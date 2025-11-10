import * as vscode from 'vscode';
import { KernelManager, RemoteDirectoryEntry, RemoteFileStat } from './kernelManager';

const toFileType = (entry: RemoteDirectoryEntry | RemoteFileStat): vscode.FileType => {
	const kind = entry.type;
	switch (kind) {
		case 'directory':
			return vscode.FileType.Directory;
		case 'file':
			return vscode.FileType.File;
		case 'symlink':
			return vscode.FileType.SymbolicLink;
		default:
			return vscode.FileType.Unknown;
	}
};

const toFileStat = (stat: RemoteFileStat): vscode.FileStat => ({
	type: toFileType(stat),
	ctime: stat.ctime,
	mtime: stat.mtime,
	size: stat.size,
});

export class KernelFileSystemProvider implements vscode.FileSystemProvider {
	private _emitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
	readonly onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]> = this._emitter.event;

	constructor(private kernelManager: KernelManager) {}

	watch(_uri: vscode.Uri, _options: { recursive: boolean; excludes: string[] }): vscode.Disposable {
		return new vscode.Disposable(() => {});
	}

	async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
		const kernel = this.kernelManager.getKernel();
		try {
			const stats = await kernel.stat(uri.path);
			return toFileStat(stats);
		} catch (error) {
			throw vscode.FileSystemError.FileNotFound(uri);
		}
	}

	async readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
		const kernel = this.kernelManager.getKernel();
		try {
			const entries = await kernel.readDirectory(uri.path);
			return entries.map((entry) => [entry.name, toFileType(entry)]);
		} catch (error) {
			throw vscode.FileSystemError.FileNotFound(uri);
		}
	}

	async createDirectory(uri: vscode.Uri): Promise<void> {
		const kernel = this.kernelManager.getKernel();
		try {
			await kernel.createDirectory(uri.path, { recursive: true });
			this._fireSoon({ type: vscode.FileChangeType.Created, uri });
		} catch (error) {
			throw vscode.FileSystemError.Unavailable(uri);
		}
	}

	async readFile(uri: vscode.Uri): Promise<Uint8Array> {
		const kernel = this.kernelManager.getKernel();
		try {
			return await kernel.readFile(uri.path);
		} catch (error) {
			throw vscode.FileSystemError.FileNotFound(uri);
		}
	}

	async writeFile(
		uri: vscode.Uri,
		content: Uint8Array,
		options: { create: boolean; overwrite: boolean }
	): Promise<void> {
		const kernel = this.kernelManager.getKernel();
		const exists = await kernel.exists(uri.path);

		if (exists && !options.overwrite) {
			throw vscode.FileSystemError.FileExists(uri);
		}
		if (!exists && !options.create) {
			throw vscode.FileSystemError.FileNotFound(uri);
		}

		try {
			await kernel.writeFile(uri.path, content, {});
			this._fireSoon({
				type: exists ? vscode.FileChangeType.Changed : vscode.FileChangeType.Created,
				uri,
			});
		} catch (error) {
			throw vscode.FileSystemError.Unavailable(uri);
		}
	}

	async delete(uri: vscode.Uri, options: { recursive: boolean }): Promise<void> {
		const kernel = this.kernelManager.getKernel();
		try {
			await kernel.delete(uri.path, { recursive: options.recursive });
			this._fireSoon({ type: vscode.FileChangeType.Deleted, uri });
		} catch (error) {
			throw vscode.FileSystemError.FileNotFound(uri);
		}
	}

	async rename(
		oldUri: vscode.Uri,
		newUri: vscode.Uri,
		options: { overwrite: boolean }
	): Promise<void> {
		const kernel = this.kernelManager.getKernel();
		if (!options.overwrite && (await kernel.exists(newUri.path))) {
			throw vscode.FileSystemError.FileExists(newUri);
		}

		try {
			await kernel.rename(oldUri.path, newUri.path);
			this._fireSoon(
				{ type: vscode.FileChangeType.Deleted, uri: oldUri },
				{ type: vscode.FileChangeType.Created, uri: newUri }
			);
		} catch (error) {
			throw vscode.FileSystemError.Unavailable(oldUri);
		}
	}

	async copy(
		source: vscode.Uri,
		destination: vscode.Uri,
		options: { overwrite: boolean }
	): Promise<void> {
		const kernel = this.kernelManager.getKernel();
		if (!options.overwrite && (await kernel.exists(destination.path))) {
			throw vscode.FileSystemError.FileExists(destination);
		}
		try {
			await kernel.copy(source.path, destination.path);
			this._fireSoon({ type: vscode.FileChangeType.Created, uri: destination });
		} catch (error) {
			throw vscode.FileSystemError.Unavailable(destination);
		}
	}

	private _bufferedEvents: vscode.FileChangeEvent[] = [];
	private _fireSoonHandle?: NodeJS.Timeout;

	private _fireSoon(...events: vscode.FileChangeEvent[]): void {
		this._bufferedEvents.push(...events);

		if (this._fireSoonHandle) {
			return;
		}

		this._fireSoonHandle = setTimeout(() => {
			this._fireSoonHandle = undefined;
			this._emitter.fire(this._bufferedEvents);
			this._bufferedEvents = [];
		}, 50);
	}
}
