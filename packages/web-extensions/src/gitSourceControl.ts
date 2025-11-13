import './polyfills/buffer';
import * as vscode from 'vscode';
import * as git from 'isomorphic-git';
import type { KernelManager } from './kernelManager';
import {
	decodeGitFsResult,
	type GitFsReadFileOptions,
} from './gitFsEncoding';

/**
 * Git Source Control Provider for VS Code
 * Implements the Source Control API to show Git status in the SCM panel
 */
export class GitSourceControl implements vscode.Disposable {
	private sourceControl: vscode.SourceControlResourceGroup[] = [];
	private scm: vscode.SourceControl | null = null;
	private disposables: vscode.Disposable[] = [];
	private workspaceRoot: string = '';
	private statusBarItem: vscode.StatusBarItem;
	private changeGroup!: vscode.SourceControlResourceGroup;
	private indexGroup!: vscode.SourceControlResourceGroup;
	private mergeGroup!: vscode.SourceControlResourceGroup;
	private untrackedGroup!: vscode.SourceControlResourceGroup;

	constructor(private kernelManager: KernelManager) {
		this.statusBarItem = vscode.window.createStatusBarItem(
			vscode.StatusBarAlignment.Left,
			100
		);
		this.statusBarItem.command = 'kernel.git.status';
		this.disposables.push(this.statusBarItem);
	}

	/**
	 * Initialize the source control provider
	 */
	async initialize(): Promise<void> {
		// Check if workspace exists
		const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
		if (!workspaceFolder) {
			console.log('No workspace folder, creating SCM provider anyway');
			// Still create the SCM provider even without workspace
			this.createScmProvider('/home');
			return;
		}

		this.workspaceRoot = workspaceFolder.uri.path;

		// Create source control provider regardless of .git existence
		// This allows users to initialize repos from the SCM panel
		this.createScmProvider(this.workspaceRoot);

		// Initial status update
		await this.updateStatus();

		// Watch for file changes
		const watcher = vscode.workspace.createFileSystemWatcher(
			new vscode.RelativePattern(workspaceFolder, '**/*')
		);

		watcher.onDidChange(() => this.updateStatus());
		watcher.onDidCreate(() => this.updateStatus());
		watcher.onDidDelete(() => this.updateStatus());

		this.disposables.push(watcher);

		console.log('Git Source Control initialized');
	}

	/**
	 * Create the SCM provider
	 */
	private createScmProvider(rootPath: string): void {
		// Create source control
		this.scm = vscode.scm.createSourceControl(
			'kernel-git',
			'Kernel Git',
			vscode.Uri.parse(`kernel://${rootPath}`)
		);

		this.scm.acceptInputCommand = {
			command: 'kernel.git.commitWithMessage',
			title: 'Commit',
		};

		this.scm.quickDiffProvider = this;

		// Create resource groups
		this.indexGroup = this.scm.createResourceGroup(
			'index',
			'Staged Changes'
		);
		this.changeGroup = this.scm.createResourceGroup('working', 'Changes');
		this.mergeGroup = this.scm.createResourceGroup(
			'merge',
			'Merge Changes'
		);
		this.untrackedGroup = this.scm.createResourceGroup(
			'untracked',
			'Untracked Files'
		);

		this.disposables.push(this.scm);
		this.disposables.push(this.indexGroup);
		this.disposables.push(this.changeGroup);
		this.disposables.push(this.mergeGroup);
		this.disposables.push(this.untrackedGroup);

		console.log('SCM provider created for:', rootPath);
	}

	/**
	 * Update Git status and refresh the SCM view
	 */
	async updateStatus(): Promise<void> {
		if (!this.scm || !this.workspaceRoot) {
			return;
		}

		try {
			const kernel = this.kernelManager.getKernel();
			const fs = this.createFsAdapter();

			// Check if .git exists
			const gitDir = `${this.workspaceRoot}/.git`;
			const hasGit = kernel.existsSync(gitDir);

			if (!hasGit) {
				// No git repo, show message in status bar
				this.statusBarItem.text =
					'$(source-control) Initialize Repository';
				this.statusBarItem.command = 'kernel.git.init';
				this.statusBarItem.show();

				// Clear all resource groups
				this.indexGroup.resourceStates = [];
				this.changeGroup.resourceStates = [];
				this.untrackedGroup.resourceStates = [];

				if (this.scm) {
					this.scm.count = 0;
				}
				return;
			}

			// Get current branch
			const branch = await git.currentBranch({
				fs,
				dir: this.workspaceRoot,
			});

			// Get status matrix
			const statusMatrix = await git.statusMatrix({
				fs,
				dir: this.workspaceRoot,
			});

			// Categorize changes
			const staged: vscode.SourceControlResourceState[] = [];
			const unstaged: vscode.SourceControlResourceState[] = [];
			const untracked: vscode.SourceControlResourceState[] = [];

			for (const [filepath, head, workdir, stage] of statusMatrix) {
				const uri = vscode.Uri.parse(
					`kernel://${this.workspaceRoot}/${filepath}`
				);
				const command = this.createDiffCommand(uri, filepath);

				// Untracked files
				if (head === 0 && workdir === 2 && stage === 0) {
					untracked.push({
						resourceUri: uri,
						command,
						decorations: {
							strikeThrough: false,
							faded: false,
							tooltip: 'Untracked',
							iconPath: new vscode.ThemeIcon(
								'new-file',
								new vscode.ThemeColor(
									'gitDecoration.untrackedResourceForeground'
								)
							),
						},
					});
				}
				// Staged new file
				else if (head === 0 && workdir === 2 && stage === 2) {
					staged.push({
						resourceUri: uri,
						command,
						decorations: {
							strikeThrough: false,
							faded: false,
							tooltip: 'Added',
							iconPath: new vscode.ThemeIcon(
								'diff-added',
								new vscode.ThemeColor(
									'gitDecoration.addedResourceForeground'
								)
							),
						},
					});
				}
				// Modified and staged
				else if (head === 1 && workdir === 2 && stage === 2) {
					staged.push({
						resourceUri: uri,
						command,
						decorations: {
							strikeThrough: false,
							faded: false,
							tooltip: 'Modified',
							iconPath: new vscode.ThemeIcon(
								'diff-modified',
								new vscode.ThemeColor(
									'gitDecoration.modifiedResourceForeground'
								)
							),
						},
					});
				}
				// Modified but unstaged
				else if (head === 1 && workdir === 2 && stage === 1) {
					unstaged.push({
						resourceUri: uri,
						command,
						decorations: {
							strikeThrough: false,
							faded: false,
							tooltip: 'Modified',
							iconPath: new vscode.ThemeIcon(
								'diff-modified',
								new vscode.ThemeColor(
									'gitDecoration.modifiedResourceForeground'
								)
							),
						},
					});
				}
				// Deleted
				else if (head === 1 && workdir === 0) {
					if (stage === 0) {
						staged.push({
							resourceUri: uri,
							command,
							decorations: {
								strikeThrough: true,
								faded: false,
								tooltip: 'Deleted',
								iconPath: new vscode.ThemeIcon(
									'diff-removed',
									new vscode.ThemeColor(
										'gitDecoration.deletedResourceForeground'
									)
								),
							},
						});
					} else {
						unstaged.push({
							resourceUri: uri,
							command,
							decorations: {
								strikeThrough: true,
								faded: false,
								tooltip: 'Deleted',
								iconPath: new vscode.ThemeIcon(
									'diff-removed',
									new vscode.ThemeColor(
										'gitDecoration.deletedResourceForeground'
									)
								),
							},
						});
					}
				}
			}

			// Update resource groups
			this.indexGroup.resourceStates = staged;
			this.changeGroup.resourceStates = unstaged;
			this.untrackedGroup.resourceStates = untracked;

			// Update status bar
			const totalChanges =
				staged.length + unstaged.length + untracked.length;
			this.statusBarItem.text = `$(git-branch) ${branch || 'detached'} ${
				totalChanges > 0 ? `$(warning) ${totalChanges}` : '$(check)'
			}`;
			this.statusBarItem.show();

			// Update SCM input box count
			if (this.scm) {
				this.scm.count = totalChanges;
			}
		} catch (error) {
			console.error('Failed to update Git status:', error);
			this.statusBarItem.text = '$(git-branch) Git';
			this.statusBarItem.show();
		}
	}

	/**
	 * QuickDiffProvider implementation
	 */
	async provideOriginalResource(
		uri: vscode.Uri
	): Promise<vscode.Uri | undefined> {
		if (!this.workspaceRoot) {
			return undefined;
		}

		// Return a special URI that will be used to fetch the HEAD version
		const relativePath = uri.path.replace(this.workspaceRoot + '/', '');
		return vscode.Uri.parse(
			`kernel-git-head://${this.workspaceRoot}/${relativePath}`
		);
	}

	/**
	 * Register commands for source control
	 */
	registerCommands(context: vscode.ExtensionContext): void {
		// Refresh status
		this.disposables.push(
			vscode.commands.registerCommand('kernel.git.refresh', async () => {
				await this.updateStatus();
			})
		);

		// Stage file
		this.disposables.push(
			vscode.commands.registerCommand(
				'kernel.git.stage.file',
				async (resource) => {
					await this.stageFile(resource);
				}
			)
		);

		// Unstage file
		this.disposables.push(
			vscode.commands.registerCommand(
				'kernel.git.unstage.file',
				async (resource) => {
					await this.unstageFile(resource);
				}
			)
		);

		// Discard changes
		this.disposables.push(
			vscode.commands.registerCommand(
				'kernel.git.discard',
				async (resource) => {
					await this.discardChanges(resource);
				}
			)
		);

		// Open file
		this.disposables.push(
			vscode.commands.registerCommand(
				'kernel.git.openFile',
				async (uri: vscode.Uri) => {
					await vscode.window.showTextDocument(uri);
				}
			)
		);

		this.disposables.push(
			vscode.commands.registerCommand(
				'kernel.git.openDiff',
				async (resource, filepath?: string) => {
					await this.openDiff(resource, filepath);
				}
			)
		);

		// Commit with message from input box
		this.disposables.push(
			vscode.commands.registerCommand(
				'kernel.git.commitWithMessage',
				async () => {
					await this.commitWithMessage();
				}
			)
		);

		// Stage all changes
		this.disposables.push(
			vscode.commands.registerCommand('kernel.git.stageAll', async () => {
				await this.stageAll();
			})
		);

		// Unstage all changes
		this.disposables.push(
			vscode.commands.registerCommand(
				'kernel.git.unstageAll',
				async () => {
					await this.unstageAll();
				}
			)
		);
	}

	/**
	 * Stage a file
	 */
	private async stageFile(resource: unknown): Promise<void> {
		try {
			const uri = this.normalizeCommandUri(resource);
			const filepath = this.getRelativePath(uri);

			await git.add({
				fs: this.createFsAdapter(),
				dir: this.workspaceRoot,
				filepath,
			});

			await this.updateStatus();
		} catch (error) {
			const message =
				error instanceof Error ? error.message : String(error);
			vscode.window.showErrorMessage(`Failed to stage file: ${message}`);
		}
	}

	/**
	 * Unstage a file
	 */
	private async unstageFile(resource: unknown): Promise<void> {
		try {
			const uri = this.normalizeCommandUri(resource);
			const filepath = this.getRelativePath(uri);

			await git.resetIndex({
				fs: this.createFsAdapter(),
				dir: this.workspaceRoot,
				filepath,
			});

			await this.updateStatus();
		} catch (error) {
			const message =
				error instanceof Error ? error.message : String(error);
			vscode.window.showErrorMessage(
				`Failed to unstage file: ${message}`
			);
		}
	}

	/**
	 * Discard changes to a file
	 */
	private async discardChanges(resource: unknown): Promise<void> {
		const confirm = await vscode.window.showWarningMessage(
			'Are you sure you want to discard changes? This cannot be undone.',
			{ modal: true },
			'Discard Changes'
		);

		if (confirm !== 'Discard Changes') {
			return;
		}

		try {
			const uri = this.normalizeCommandUri(resource);
			const filepath = this.getRelativePath(uri);

			await git.checkout({
				fs: this.createFsAdapter(),
				dir: this.workspaceRoot,
				filepaths: [filepath],
				force: true,
			});

			await this.updateStatus();
		} catch (error) {
			const message =
				error instanceof Error ? error.message : String(error);
			vscode.window.showErrorMessage(
				`Failed to discard changes: ${message}`
			);
		}
	}

	private normalizeCommandUri(resource: unknown): vscode.Uri {
		if (!resource) {
			throw new Error('No file selected.');
		}

		if (Array.isArray(resource) && resource.length > 0) {
			return this.normalizeCommandUri(resource[0]);
		}

		if (vscode.Uri.isUri(resource)) {
			return resource;
		}

		if (isSourceControlResourceState(resource)) {
			if (resource.resourceUri) {
				return resource.resourceUri;
			}
		}

		throw new Error('No file selected.');
	}

	private createDiffCommand(
		uri: vscode.Uri,
		filepath: string
	): vscode.Command | undefined {
		if (!this.workspaceRoot) {
			return undefined;
		}

		return {
			command: 'kernel.git.openDiff',
			title: 'Open Changes',
			arguments: [uri, filepath],
		};
	}

	private async openDiff(
		resource: unknown,
		filepath?: string
	): Promise<void> {
		if (!this.workspaceRoot) {
			vscode.window.showErrorMessage('No workspace folder available.');
			return;
		}
		const uri = this.normalizeCommandUri(resource);

		const relativePath = filepath ?? this.getRelativePath(uri);
		const fs = this.createFsAdapter();

		let headContent = '';
		try {
			const { blob } = await git.readBlob({
				fs,
				dir: this.workspaceRoot,
				filepath: relativePath,
				oid: 'HEAD',
			});
			const decoder = new TextDecoder();
			headContent = decoder.decode(blob);
		} catch (error) {
			console.warn('Failed to load HEAD content for diff', error);
		}

		let language: string | undefined;
		try {
			const workingDoc = await vscode.workspace.openTextDocument(uri);
			language = workingDoc.languageId;
		} catch {
			language = undefined;
		}

		const headDocument = await vscode.workspace.openTextDocument({
			content: headContent,
			language,
		});

		const title = `${relativePath} (HEAD ↔ Working Tree)`;
		await vscode.commands.executeCommand(
			'vscode.diff',
			headDocument.uri,
			uri,
			title
		);
	}

	private getRelativePath(uri?: vscode.Uri): string {
		if (!this.workspaceRoot) {
			throw new Error('No workspace folder available.');
		}
		if (!uri) {
			throw new Error('No file selected.');
		}

		const workspaceFolder = vscode.workspace.workspaceFolders?.find(
			(folder) => folder.uri.path === this.workspaceRoot
		);
		if (workspaceFolder) {
			const relative = vscode.workspace.asRelativePath(uri, false);
			if (
				relative &&
				relative !== uri.toString() &&
				relative !== uri.path
			) {
				return relative;
			}
		}

		const rootPath = decodeURIComponent(this.workspaceRoot);
		const fullPath = decodeURIComponent(uri.path);

		if (fullPath === rootPath) {
			return '.';
		}

		const prefix = rootPath.endsWith('/') ? rootPath : rootPath + '/';
		if (fullPath.startsWith(prefix)) {
			return fullPath.slice(prefix.length);
		}

		throw new Error('File is outside of the workspace.');
	}

	/**
	 * Commit with message from SCM input box
	 */
	private async commitWithMessage(): Promise<void> {
		if (!this.scm) {
			return;
		}

		const message = this.scm.inputBox.value;
		if (!message) {
			vscode.window.showErrorMessage('Please enter a commit message');
			return;
		}

		try {
			const config = vscode.workspace.getConfiguration('git');
			const authorName = config.get<string>('defaultName') || 'User';
			const authorEmail =
				config.get<string>('defaultEmail') || 'user@example.com';

			const sha = await git.commit({
				fs: this.createFsAdapter(),
				dir: this.workspaceRoot,
				message,
				author: {
					name: authorName,
					email: authorEmail,
				},
			});

			this.scm.inputBox.value = '';
			await this.updateStatus();

			vscode.window.showInformationMessage(
				`Committed: ${sha.slice(0, 7)} - ${message.split('\n')[0]}`
			);
		} catch (error) {
			const message =
				error instanceof Error ? error.message : String(error);
			vscode.window.showErrorMessage(`Commit failed: ${message}`);
		}
	}

	/**
	 * Stage all changes
	 */
	private async stageAll(): Promise<void> {
		try {
			const fs = this.createFsAdapter();
			const statusMatrix = await git.statusMatrix({
				fs,
				dir: this.workspaceRoot,
			});

			for (const [filepath, head, workdir, stage] of statusMatrix) {
				if (workdir !== stage) {
					await git.add({
						fs,
						dir: this.workspaceRoot,
						filepath,
					});
				}
			}

			await this.updateStatus();
		} catch (error) {
			const message =
				error instanceof Error ? error.message : String(error);
			vscode.window.showErrorMessage(
				`Failed to stage all changes: ${message}`
			);
		}
	}

	/**
	 * Unstage all changes
	 */
	private async unstageAll(): Promise<void> {
		try {
			await git.resetIndex({
				fs: this.createFsAdapter(),
				dir: this.workspaceRoot,
			});

			await this.updateStatus();
		} catch (error) {
			const message =
				error instanceof Error ? error.message : String(error);
			vscode.window.showErrorMessage(
				`Failed to unstage all changes: ${message}`
			);
		}
	}

	/**
	 * Create filesystem adapter for isomorphic-git
	 * Uses VS Code's workspace filesystem APIs
	 */
	private createFsAdapter(): any {
		return {
			promises: {
				readFile: async (
					filepath: string,
					options?: GitFsReadFileOptions
				) => {
					const uri = vscode.Uri.parse(`kernel://${filepath}`);
					try {
						const content = await vscode.workspace.fs.readFile(uri);
						return decodeGitFsResult(content, options);
					} catch (error) {
						// Convert VS Code FileSystemError to Node.js-style ENOENT error
						const err: any = new Error(`ENOENT: no such file or directory, open '${filepath}'`);
						err.code = 'ENOENT';
						err.errno = -2;
						err.syscall = 'open';
						err.path = filepath;
						throw err;
					}
				},
				writeFile: async (
					filepath: string,
					data: Uint8Array | string
				) => {
					const uri = vscode.Uri.parse(`kernel://${filepath}`);
					const uint8Array = typeof data === 'string'
						? new TextEncoder().encode(data)
						: data;
					await vscode.workspace.fs.writeFile(uri, uint8Array);
				},
				unlink: async (filepath: string) => {
					const uri = vscode.Uri.parse(`kernel://${filepath}`);
					await vscode.workspace.fs.delete(uri, { recursive: false, useTrash: false });
				},
				readdir: async (filepath: string) => {
					const uri = vscode.Uri.parse(`kernel://${filepath}`);
					const entries = await vscode.workspace.fs.readDirectory(uri);
					return entries.map(([name, _type]) => name);
				},
				mkdir: async (filepath: string) => {
					const uri = vscode.Uri.parse(`kernel://${filepath}`);
					await vscode.workspace.fs.createDirectory(uri);
				},
				rmdir: async (filepath: string) => {
					const uri = vscode.Uri.parse(`kernel://${filepath}`);
					await vscode.workspace.fs.delete(uri, { recursive: true, useTrash: false });
				},
				stat: async (filepath: string) => {
					try {
						const uri = vscode.Uri.parse(`kernel://${filepath}`);
						const stat = await vscode.workspace.fs.stat(uri);
						return mapFileStat(stat);
					} catch (error) {
						// Convert VS Code FileSystemError to Node.js-style error
						const err: any = new Error(`ENOENT: no such file or directory, stat '${filepath}'`);
						err.code = 'ENOENT';
						err.errno = -2;
						err.syscall = 'stat';
						err.path = filepath;
						throw err;
					}
				},
				lstat: async (filepath: string) => {
					try {
						// VS Code doesn't distinguish lstat from stat
						const uri = vscode.Uri.parse(`kernel://${filepath}`);
						const stat = await vscode.workspace.fs.stat(uri);
						return mapFileStat(stat);
					} catch (error) {
						// Convert VS Code FileSystemError to Node.js-style error
						const err: any = new Error(`ENOENT: no such file or directory, lstat '${filepath}'`);
						err.code = 'ENOENT';
						err.errno = -2;
						err.syscall = 'lstat';
						err.path = filepath;
						throw err;
					}
				},
				readlink: async (filepath: string) => {
					// VS Code doesn't have readlink API, fallback to kernel
					const kernel = this.kernelManager.getKernel();
					return kernel.readlinkSync(filepath);
				},
				symlink: async (target: string, filepath: string) => {
					// VS Code doesn't have symlink API, fallback to kernel
					const kernel = this.kernelManager.getKernel();
					return kernel.symlinkSync(target, filepath);
				},
				chmod: async (_filepath: string, _mode: number) => {
					// VS Code doesn't support chmod, no-op
					return;
				},
			},
		};
	}

	dispose(): void {
		for (const disposable of this.disposables) {
			disposable.dispose();
		}
		this.disposables = [];
	}
}

function mapFileStat(stat: vscode.FileStat) {
	const mtime = stat.mtime ?? Date.now();
	const ctime = stat.ctime ?? mtime;
	return {
		isFile: () => stat.type === vscode.FileType.File,
		isDirectory: () => stat.type === vscode.FileType.Directory,
		isSymbolicLink: () => stat.type === vscode.FileType.SymbolicLink,
		mode: 0o644,
		size: stat.size,
		mtimeMs: mtime,
		ctimeMs: ctime,
		mtime: new Date(mtime),
		ctime: new Date(ctime),
		dev: 0,
		ino: 0,
		uid: 0,
		gid: 0,
	};
}

function isSourceControlResourceState(
	value: unknown
): value is vscode.SourceControlResourceState {
	return (
		!!value &&
		typeof value === 'object' &&
		'resourceUri' in value &&
		vscode.Uri.isUri(
			(value as vscode.SourceControlResourceState).resourceUri
		)
	);
}
