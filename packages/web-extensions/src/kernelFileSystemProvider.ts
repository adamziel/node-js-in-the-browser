import * as vscode from 'vscode';
import { KernelManager } from './kernelManager';

/**
 * VS Code FileSystemProvider implementation that bridges to the kernel filesystem
 */
export class KernelFileSystemProvider implements vscode.FileSystemProvider {
	private _emitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
	readonly onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]> = this._emitter.event;

	constructor(private kernelManager: KernelManager) {}

	watch(uri: vscode.Uri, options: { recursive: boolean; excludes: string[] }): vscode.Disposable {
		// TODO: Implement file watching if needed
		return new vscode.Disposable(() => {});
	}

	stat(uri: vscode.Uri): vscode.FileStat {
		const kernel = this.kernelManager.getKernel();
		const path = uri.path;

		try {
			const stats = kernel.statSync(path);

			let type = vscode.FileType.Unknown;
			if (stats.isDirectory()) {
				type = vscode.FileType.Directory;
			} else if (stats.isFile()) {
				type = vscode.FileType.File;
			} else if (stats.isSymbolicLink()) {
				type = vscode.FileType.SymbolicLink;
			}

			return {
				type,
				ctime: stats.ctimeMs || 0,
				mtime: stats.mtimeMs || 0,
				size: stats.size || 0
			};
		} catch (error) {
			throw vscode.FileSystemError.FileNotFound(uri);
		}
	}

	readDirectory(uri: vscode.Uri): [string, vscode.FileType][] {
		const kernel = this.kernelManager.getKernel();
		const path = uri.path;

		try {
			const entries = kernel.readdirSync(path) as string[];
			const result: [string, vscode.FileType][] = [];

			for (const entry of entries) {
				const entryPath = path === '/' ? `/${entry}` : `${path}/${entry}`;
				try {
					const stats = kernel.statSync(entryPath);
					let type = vscode.FileType.Unknown;

					if (stats.isDirectory()) {
						type = vscode.FileType.Directory;
					} else if (stats.isFile()) {
						type = vscode.FileType.File;
					} else if (stats.isSymbolicLink()) {
						type = vscode.FileType.SymbolicLink;
					}

					result.push([entry, type]);
				} catch {
					// Skip entries we can't stat
				}
			}

			return result;
		} catch (error) {
			throw vscode.FileSystemError.FileNotFound(uri);
		}
	}

	createDirectory(uri: vscode.Uri): void {
		const kernel = this.kernelManager.getKernel();
		const path = uri.path;

		try {
			kernel.mkdirSync(path, { mode: 0o755, recursive: true });
			this._fireSoon({ type: vscode.FileChangeType.Created, uri });
		} catch (error) {
			throw vscode.FileSystemError.Unavailable(uri);
		}
	}

	readFile(uri: vscode.Uri): Uint8Array {
		const kernel = this.kernelManager.getKernel();
		const path = uri.path;

		try {
			const content = kernel.readFileSync(path);

			if (typeof content === 'string') {
				return new TextEncoder().encode(content);
			}

			return content;
		} catch (error) {
			throw vscode.FileSystemError.FileNotFound(uri);
		}
	}

	writeFile(uri: vscode.Uri, content: Uint8Array, options: { create: boolean; overwrite: boolean }): void {
		const kernel = this.kernelManager.getKernel();
		const path = uri.path;

		const exists = kernel.existsSync(path);

		if (exists) {
			if (!options.overwrite) {
				throw vscode.FileSystemError.FileExists(uri);
			}
		} else {
			if (!options.create) {
				throw vscode.FileSystemError.FileNotFound(uri);
			}
		}

		try {
			kernel.writeFileSync(path, content, { mode: 0o644 });
			this._fireSoon({
				type: exists ? vscode.FileChangeType.Changed : vscode.FileChangeType.Created,
				uri
			});
		} catch (error) {
			throw vscode.FileSystemError.Unavailable(uri);
		}
	}

	delete(uri: vscode.Uri, options: { recursive: boolean }): void {
		const kernel = this.kernelManager.getKernel();
		const path = uri.path;

		try {
			const stats = kernel.statSync(path);

			if (stats.isDirectory()) {
				kernel.rmdirSync(path, { recursive: options.recursive });
			} else {
				kernel.unlinkSync(path);
			}

			this._fireSoon({ type: vscode.FileChangeType.Deleted, uri });
		} catch (error) {
			throw vscode.FileSystemError.FileNotFound(uri);
		}
	}

	rename(oldUri: vscode.Uri, newUri: vscode.Uri, options: { overwrite: boolean }): void {
		const kernel = this.kernelManager.getKernel();
		const oldPath = oldUri.path;
		const newPath = newUri.path;

		const newExists = kernel.existsSync(newPath);
		if (newExists && !options.overwrite) {
			throw vscode.FileSystemError.FileExists(newUri);
		}

		try {
			kernel.renameSync(oldPath, newPath);
			this._fireSoon(
				{ type: vscode.FileChangeType.Deleted, uri: oldUri },
				{ type: vscode.FileChangeType.Created, uri: newUri }
			);
		} catch (error) {
			throw vscode.FileSystemError.Unavailable(oldUri);
		}
	}

	copy(source: vscode.Uri, destination: vscode.Uri, options: { overwrite: boolean }): void {
		const kernel = this.kernelManager.getKernel();
		const sourcePath = source.path;
		const destPath = destination.path;

		const destExists = kernel.existsSync(destPath);
		if (destExists && !options.overwrite) {
			throw vscode.FileSystemError.FileExists(destination);
		}

		try {
			const content = kernel.readFileSync(sourcePath);
			kernel.writeFileSync(destPath, content);
			this._fireSoon({ type: vscode.FileChangeType.Created, uri: destination });
		} catch (error) {
			throw vscode.FileSystemError.Unavailable(source);
		}
	}

	private _bufferedEvents: vscode.FileChangeEvent[] = [];
	private _fireSoonHandle?: NodeJS.Timeout;

	private _fireSoon(...events: vscode.FileChangeEvent[]): void {
		this._bufferedEvents.push(...events);

		if (this._fireSoonHandle) {
			clearTimeout(this._fireSoonHandle);
		}

		this._fireSoonHandle = setTimeout(() => {
			this._emitter.fire(this._bufferedEvents);
			this._bufferedEvents = [];
		}, 5);
	}

	dispose(): void {
		this._emitter.dispose();
	}
}
