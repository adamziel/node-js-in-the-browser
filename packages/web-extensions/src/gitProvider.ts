import './polyfills/buffer';
import * as vscode from 'vscode';
import * as git from 'isomorphic-git';
import type { KernelManager } from './kernelManager';
import {
	decodeGitFsResult,
	type GitFsReadFileOptions,
} from './gitFsEncoding';

/**
 * Git provider implementation using isomorphic-git
 * Provides full Git integration for the kernel filesystem
 */
type StoredRemoteRepository = {
	url: string;
	dir: string;
	timestamp: number;
};

export class KernelGitProvider implements vscode.Disposable {
	private disposables: vscode.Disposable[] = [];
	private static readonly LAST_REMOTE_STORAGE_KEY =
		'kernel.git.lastRemoteRepository';

	constructor(
		private kernelManager: KernelManager,
		private readonly context: vscode.ExtensionContext
	) {}

	/**
	 * Register Git commands
	 */
	registerCommands(context: vscode.ExtensionContext): void {
		// Clone repository
		this.disposables.push(
			vscode.commands.registerCommand('kernel.git.clone', async () => {
				await this.cloneRepository();
			})
		);

		// Initialize repository
		this.disposables.push(
			vscode.commands.registerCommand('kernel.git.init', async () => {
				await this.initRepository();
			})
		);

		// Stage changes
		this.disposables.push(
			vscode.commands.registerCommand('kernel.git.stage', async () => {
				await this.stageChanges();
			})
		);

		// Commit changes
		this.disposables.push(
			vscode.commands.registerCommand('kernel.git.commit', async () => {
				await this.commitChanges();
			})
		);

		// Push changes
		this.disposables.push(
			vscode.commands.registerCommand('kernel.git.push', async () => {
				await this.pushChanges();
			})
		);

		// Pull changes
		this.disposables.push(
			vscode.commands.registerCommand('kernel.git.pull', async () => {
				await this.pullChanges();
			})
		);

		// Fetch changes
		this.disposables.push(
			vscode.commands.registerCommand('kernel.git.fetch', async () => {
				await this.fetchChanges();
			})
		);

		// Show status
		this.disposables.push(
			vscode.commands.registerCommand('kernel.git.status', async () => {
				await this.showStatus();
			})
		);

		// Create branch
		this.disposables.push(
			vscode.commands.registerCommand('kernel.git.branch', async () => {
				await this.createBranch();
			})
		);

		// Checkout branch
		this.disposables.push(
			vscode.commands.registerCommand('kernel.git.checkout', async () => {
				await this.checkoutBranch();
			})
		);

		// Show log
		this.disposables.push(
			vscode.commands.registerCommand('kernel.git.log', async () => {
				await this.showLog();
			})
		);

		// Add remote
		this.disposables.push(
			vscode.commands.registerCommand(
				'kernel.git.addRemote',
				async () => {
					await this.addRemote();
				}
			)
		);

		// Open remote repository (remoteHub.openRepository replacement)
		this.disposables.push(
			vscode.commands.registerCommand(
				'remoteHub.openRepository',
				async (url?: string) => {
					await this.openRemoteRepository(url);
				}
			)
		);

		// Also register as kernel command
		this.disposables.push(
			vscode.commands.registerCommand(
				'kernel.git.openRemote',
				async (url?: string) => {
					await this.openRemoteRepository(url);
				}
			)
		);
	}

	/**
	 * Clone a Git repository
	 */
	private async cloneRepository(): Promise<void> {
		try {
			const url = await vscode.window.showInputBox({
				prompt: 'Enter Git repository URL',
				placeHolder: 'https://github.com/user/repo.git',
				validateInput: (value) => {
					if (!value) return 'URL is required';
					if (
						!value.startsWith('http://') &&
						!value.startsWith('https://')
					) {
						return 'URL must start with http:// or https://';
					}
					return null;
				},
			});

			if (!url) return;

			const dirName = await vscode.window.showInputBox({
				prompt: 'Enter directory name',
				placeHolder: 'my-repo',
				value: this.extractRepoName(url),
			});

			if (!dirName) return;

			const dir = `/home/${dirName}`;

			// Ensure parent directory exists
			try {
				kernel.mkdirSync('/home', { recursive: true });
			} catch (error) {
				// /home might already exist, ignore error
			}

			// NOTE: Don't create the target directory - let git.clone() create it
			// isomorphic-git expects the directory to not exist

			await vscode.window.withProgress(
				{
					location: vscode.ProgressLocation.Notification,
					title: `Cloning ${url}...`,
					cancellable: false,
				},
				async (progress) => {
					progress.report({
						increment: 10,
						message: 'Initializing...',
					});

					await git.clone({
						fs: this.createFsAdapter(),
						http: this.createHttpAdapter(),
						dir,
						url,
						// corsProxy: 'https://cors.isomorphic-git.org',
						onProgress: (event) => {
							const percent = Math.floor(
								(event.loaded / event.total) * 100
							);
							progress.report({
								increment: percent / 10,
								message: `${event.phase}: ${percent}%`,
							});
						},
					});

					progress.report({ increment: 100, message: 'Complete!' });
				}
			);

			vscode.window.showInformationMessage(`Repository cloned to ${dir}`);

			// Open the cloned repository
			const uri = vscode.Uri.parse(`kernel://${dir}`);
			await vscode.commands.executeCommand('vscode.openFolder', uri);
		} catch (error) {
			const message =
				error instanceof Error ? error.message : String(error);
			vscode.window.showErrorMessage(`Clone failed: ${message}`);
		}
	}

	/**
	 * Initialize a new Git repository
	 */
	private async initRepository(): Promise<void> {
		try {
			const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
			if (!workspaceFolder) {
				vscode.window.showErrorMessage('No workspace folder open');
				return;
			}

			const dir = workspaceFolder.uri.path;

			await git.init({
				fs: this.createFsAdapter(),
				dir,
				defaultBranch: 'main',
			});

			vscode.window.showInformationMessage(
				`Initialized Git repository in ${dir}`
			);
		} catch (error) {
			const message =
				error instanceof Error ? error.message : String(error);
			vscode.window.showErrorMessage(`Init failed: ${message}`);
		}
	}

	/**
	 * Stage changes (add files)
	 */
	private async stageChanges(): Promise<void> {
		try {
			const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
			if (!workspaceFolder) {
				vscode.window.showErrorMessage('No workspace folder open');
				return;
			}

			const dir = workspaceFolder.uri.path;

			// Get status to find modified files
			const status = await git.statusMatrix({
				fs: this.createFsAdapter(),
				dir,
			});

			const modifiedFiles = status
				.filter(
					([filepath, head, workdir, stage]) =>
						workdir !== stage || head !== workdir
				)
				.map(([filepath]) => filepath);

			if (modifiedFiles.length === 0) {
				vscode.window.showInformationMessage('No changes to stage');
				return;
			}

			const selected = await vscode.window.showQuickPick(
				[
					{ label: '$(check-all) Stage All Changes', value: '.' },
					...modifiedFiles.map((file) => ({
						label: file,
						value: file,
					})),
				],
				{
					placeHolder: 'Select files to stage',
					canPickMany: true,
				}
			);

			if (!selected || selected.length === 0) return;

			for (const item of selected) {
				await git.add({
					fs: this.createFsAdapter(),
					dir,
					filepath: item.value,
				});
			}

			vscode.window.showInformationMessage(
				`Staged ${selected.length} file(s)`
			);
		} catch (error) {
			const message =
				error instanceof Error ? error.message : String(error);
			vscode.window.showErrorMessage(`Stage failed: ${message}`);
		}
	}

	/**
	 * Commit staged changes
	 */
	private async commitChanges(): Promise<void> {
		try {
			const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
			if (!workspaceFolder) {
				vscode.window.showErrorMessage('No workspace folder open');
				return;
			}

			const message = await vscode.window.showInputBox({
				prompt: 'Enter commit message',
				placeHolder: 'feat: add new feature',
				validateInput: (value) => {
					if (!value) return 'Commit message is required';
					return null;
				},
			});

			if (!message) return;

			const config = vscode.workspace.getConfiguration('git');
			const authorName = config.get<string>('defaultName') || 'User';
			const authorEmail =
				config.get<string>('defaultEmail') || 'user@example.com';

			const dir = workspaceFolder.uri.path;

			const sha = await git.commit({
				fs: this.createFsAdapter(),
				dir,
				message,
				author: {
					name: authorName,
					email: authorEmail,
				},
			});

			vscode.window.showInformationMessage(
				`Committed changes: ${sha.slice(0, 7)}`
			);
		} catch (error) {
			const message =
				error instanceof Error ? error.message : String(error);
			vscode.window.showErrorMessage(`Commit failed: ${message}`);
		}
	}

	/**
	 * Push changes to remote
	 */
	private async pushChanges(): Promise<void> {
		try {
			const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
			if (!workspaceFolder) {
				vscode.window.showErrorMessage('No workspace folder open');
				return;
			}

			const dir = workspaceFolder.uri.path;

			// Get current branch
			const branch = await git.currentBranch({
				fs: this.createFsAdapter(),
				dir,
			});

			if (!branch) {
				vscode.window.showErrorMessage('Not on any branch');
				return;
			}

			const remote = await this.selectRemote(dir);
			if (!remote) return;

			await vscode.window.withProgress(
				{
					location: vscode.ProgressLocation.Notification,
					title: `Pushing to ${remote}...`,
					cancellable: false,
				},
				async (progress) => {
					await git.push({
						fs: this.createFsAdapter(),
						http: this.createHttpAdapter(),
						dir,
						remote,
						ref: branch,
						// corsProxy: 'https://cors.isomorphic-git.org',
						onProgress: (event) => {
							progress.report({
								message: `${event.phase}: ${event.loaded}/${event.total}`,
							});
						},
					});
				}
			);

			vscode.window.showInformationMessage(
				`Pushed ${branch} to ${remote}`
			);
		} catch (error) {
			const message =
				error instanceof Error ? error.message : String(error);
			vscode.window.showErrorMessage(`Push failed: ${message}`);
		}
	}

	/**
	 * Pull changes from remote
	 */
	private async pullChanges(): Promise<void> {
		try {
			const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
			if (!workspaceFolder) {
				vscode.window.showErrorMessage('No workspace folder open');
				return;
			}

			const dir = workspaceFolder.uri.path;

			const config = vscode.workspace.getConfiguration('git');
			const authorName = config.get<string>('defaultName') || 'User';
			const authorEmail =
				config.get<string>('defaultEmail') || 'user@example.com';

			const remote = await this.selectRemote(dir);
			if (!remote) return;

			await vscode.window.withProgress(
				{
					location: vscode.ProgressLocation.Notification,
					title: `Pulling from ${remote}...`,
					cancellable: false,
				},
				async () => {
					await git.pull({
						fs: this.createFsAdapter(),
						http: this.createHttpAdapter(),
						dir,
						remote,
						author: {
							name: authorName,
							email: authorEmail,
						},
						// corsProxy: 'https://cors.isomorphic-git.org',
					});
				}
			);

			vscode.window.showInformationMessage(
				`Pulled changes from ${remote}`
			);
		} catch (error) {
			const message =
				error instanceof Error ? error.message : String(error);
			vscode.window.showErrorMessage(`Pull failed: ${message}`);
		}
	}

	/**
	 * Fetch changes from remote
	 */
	private async fetchChanges(): Promise<void> {
		try {
			const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
			if (!workspaceFolder) {
				vscode.window.showErrorMessage('No workspace folder open');
				return;
			}

			const dir = workspaceFolder.uri.path;

			const remote = await this.selectRemote(dir);
			if (!remote) return;

			await vscode.window.withProgress(
				{
					location: vscode.ProgressLocation.Notification,
					title: `Fetching from ${remote}...`,
					cancellable: false,
				},
				async () => {
					await git.fetch({
						fs: this.createFsAdapter(),
						http: this.createHttpAdapter(),
						dir,
						remote,
						// corsProxy: 'https://cors.isomorphic-git.org',
					});
				}
			);

			vscode.window.showInformationMessage(
				`Fetched changes from ${remote}`
			);
		} catch (error) {
			const message =
				error instanceof Error ? error.message : String(error);
			vscode.window.showErrorMessage(`Fetch failed: ${message}`);
		}
	}

	/**
	 * Show Git status
	 */
	private async showStatus(): Promise<void> {
		try {
			const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
			if (!workspaceFolder) {
				vscode.window.showErrorMessage('No workspace folder open');
				return;
			}

			const dir = workspaceFolder.uri.path;

			const branch = await git.currentBranch({
				fs: this.createFsAdapter(),
				dir,
			});

			const status = await git.statusMatrix({
				fs: this.createFsAdapter(),
				dir,
			});

			const changes = status
				.map(([filepath, head, workdir, stage]) => {
					let state = '';
					if (head === 0 && workdir === 2 && stage === 0)
						state = 'untracked';
					else if (head === 1 && workdir === 2 && stage === 2)
						state = 'modified';
					else if (head === 1 && workdir === 0 && stage === 0)
						state = 'deleted';
					else if (head === 0 && workdir === 2 && stage === 2)
						state = 'added';
					else if (head === 1 && workdir === 2 && stage === 1)
						state = 'modified (unstaged)';

					return state ? `${state}: ${filepath}` : null;
				})
				.filter((item): item is string => item !== null);

			const message = [
				`Branch: ${branch || 'detached HEAD'}`,
				'',
				changes.length > 0
					? 'Changes:'
					: 'No changes (working tree clean)',
				...changes,
			].join('\n');

			vscode.window.showInformationMessage(message, {
				modal: true,
				detail: 'Git Status',
			});
		} catch (error) {
			const message =
				error instanceof Error ? error.message : String(error);
			vscode.window.showErrorMessage(`Status failed: ${message}`);
		}
	}

	/**
	 * Create a new branch
	 */
	private async createBranch(): Promise<void> {
		try {
			const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
			if (!workspaceFolder) {
				vscode.window.showErrorMessage('No workspace folder open');
				return;
			}

			const branchName = await vscode.window.showInputBox({
				prompt: 'Enter branch name',
				placeHolder: 'feature/my-feature',
				validateInput: (value) => {
					if (!value) return 'Branch name is required';
					if (!/^[a-zA-Z0-9/_-]+$/.test(value))
						return 'Invalid branch name';
					return null;
				},
			});

			if (!branchName) return;

			const dir = workspaceFolder.uri.path;

			await git.branch({
				fs: this.createFsAdapter(),
				dir,
				ref: branchName,
			});

			const checkout = await vscode.window.showQuickPick(['Yes', 'No'], {
				placeHolder: `Checkout ${branchName}?`,
			});

			if (checkout === 'Yes') {
				await git.checkout({
					fs: this.createFsAdapter(),
					dir,
					ref: branchName,
				});
				vscode.window.showInformationMessage(
					`Created and checked out branch: ${branchName}`
				);
			} else {
				vscode.window.showInformationMessage(
					`Created branch: ${branchName}`
				);
			}
		} catch (error) {
			const message =
				error instanceof Error ? error.message : String(error);
			vscode.window.showErrorMessage(
				`Branch creation failed: ${message}`
			);
		}
	}

	/**
	 * Checkout a branch
	 */
	private async checkoutBranch(): Promise<void> {
		try {
			const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
			if (!workspaceFolder) {
				vscode.window.showErrorMessage('No workspace folder open');
				return;
			}

			const dir = workspaceFolder.uri.path;

			const branches = await git.listBranches({
				fs: this.createFsAdapter(),
				dir,
			});

			const selected = await vscode.window.showQuickPick(branches, {
				placeHolder: 'Select branch to checkout',
			});

			if (!selected) return;

			await git.checkout({
				fs: this.createFsAdapter(),
				dir,
				ref: selected,
			});

			vscode.window.showInformationMessage(`Checked out: ${selected}`);
		} catch (error) {
			const message =
				error instanceof Error ? error.message : String(error);
			vscode.window.showErrorMessage(`Checkout failed: ${message}`);
		}
	}

	/**
	 * Show commit log
	 */
	private async showLog(): Promise<void> {
		try {
			const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
			if (!workspaceFolder) {
				vscode.window.showErrorMessage('No workspace folder open');
				return;
			}

			const dir = workspaceFolder.uri.path;

			const commits = await git.log({
				fs: this.createFsAdapter(),
				dir,
				depth: 20,
			});

			const items = commits.map((commit) => ({
				label: `$(git-commit) ${commit.oid.slice(0, 7)}`,
				description: commit.commit.message.split('\n')[0],
				detail: `${commit.commit.author.name} <${
					commit.commit.author.email
				}> - ${new Date(
					commit.commit.author.timestamp * 1000
				).toLocaleString()}`,
			}));

			await vscode.window.showQuickPick(items, {
				placeHolder: 'Recent commits',
			});
		} catch (error) {
			const message =
				error instanceof Error ? error.message : String(error);
			vscode.window.showErrorMessage(`Log failed: ${message}`);
		}
	}

	/**
	 * Open a remote repository (clone and open in workspace)
	 * This replaces the remoteHub.openRepository command
	 */
	private async openRemoteRepository(initialUrl?: string): Promise<void> {
		try {
			const url =
				initialUrl ||
				(await vscode.window.showInputBox({
					prompt: 'Enter Git repository URL',
					placeHolder: 'https://github.com/user/repo.git',
					validateInput: (value) => {
						if (!value) return 'URL is required';
						if (
							!value.startsWith('http://') &&
							!value.startsWith('https://')
						) {
							return 'URL must start with http:// or https://';
						}
						return null;
					},
				}));

			if (!url) return;

			const dirName = this.extractRepoName(url);

			const kernel = this.kernelManager.getKernel();
			const dir = `/home/${dirName}`;

			await this.cloneRemoteRepository({
				url,
				dir,
				progressTitle: `Cloning ${url}...`,
				promptOnOverwrite: true,
				openFolder: true,
				remember: true,
				successMessage: `Repository cloned to ${dir}`,
			});
		} catch (error) {
			console.error(error);
			const message =
				error instanceof Error ? error.message : String(error);
			vscode.window.showErrorMessage(
				`Failed to open remote repository: ${message}`
			);
		}
	}

	/**
	 * Add a remote repository
	 */
	private async addRemote(): Promise<void> {
		try {
			const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
			if (!workspaceFolder) {
				vscode.window.showErrorMessage('No workspace folder open');
				return;
			}

			const remoteName = await vscode.window.showInputBox({
				prompt: 'Enter remote name',
				placeHolder: 'origin',
				value: 'origin',
			});

			if (!remoteName) return;

			const url = await vscode.window.showInputBox({
				prompt: 'Enter remote URL',
				placeHolder: 'https://github.com/user/repo.git',
			});

			if (!url) return;

			const dir = workspaceFolder.uri.path;

			await git.addRemote({
				fs: this.createFsAdapter(),
				dir,
				remote: remoteName,
				url,
			});

			vscode.window.showInformationMessage(
				`Added remote: ${remoteName} -> ${url}`
			);
		} catch (error) {
			const message =
				error instanceof Error ? error.message : String(error);
			vscode.window.showErrorMessage(`Add remote failed: ${message}`);
		}
	}

	/**
	 * Select a remote
	 */
	private async selectRemote(dir: string): Promise<string | undefined> {
		const remotes = await git.listRemotes({
			fs: this.createFsAdapter(),
			dir,
		});

		if (remotes.length === 0) {
			vscode.window.showErrorMessage(
				'No remotes configured. Use "Git: Add Remote" first.'
			);
			return undefined;
		}

		if (remotes.length === 1) {
			return remotes[0].remote;
		}

		const selected = await vscode.window.showQuickPick(
			remotes.map((r) => ({
				label: r.remote,
				description: r.url,
			})),
			{
				placeHolder: 'Select remote',
			}
		);

		return selected?.label;
	}

	private hasExistingRepository(dir: string): boolean {
		try {
			const kernel = this.kernelManager.getKernel();
			return (
				kernel.existsSync(dir) && kernel.existsSync(`${dir}/.git`)
			);
		} catch (error) {
			console.warn('Failed to stat repository directory', error);
			return false;
		}
	}

	private ensureParentDirectory(dir: string): void {
		const kernel = this.kernelManager.getKernel();
		const parent = dir.split('/').slice(0, -1).join('/') || '/';
		try {
			kernel.mkdirSync(parent, { recursive: true });
		} catch (error) {
			console.warn('Failed to create parent directory', parent, error);
		}
	}

	private async cloneRemoteRepository({
		url,
		dir,
		progressTitle,
		promptOnOverwrite = false,
		openFolder = false,
		remember = false,
		successMessage,
	}: CloneRemoteOptions): Promise<void> {
		const kernel = this.kernelManager.getKernel();
		if (promptOnOverwrite && kernel.existsSync(dir)) {
			const overwrite = await vscode.window.showWarningMessage(
				`Directory ${dir} already exists. Overwrite?`,
				{ modal: true },
				'Overwrite',
				'Cancel'
			);

			if (overwrite !== 'Overwrite') {
				return;
			}
		} else if (!promptOnOverwrite && this.hasExistingRepository(dir)) {
			return;
		}

		if (kernel.existsSync(dir)) {
			try {
				kernel.rmdirSync(dir, { recursive: true });
			} catch (error) {
				console.error('Failed to remove existing directory:', error);
				throw error;
			}
		}

		this.ensureParentDirectory(dir);

		await vscode.window.withProgress(
			{
				location: vscode.ProgressLocation.Notification,
				title: progressTitle,
				cancellable: false,
			},
			async (progress) => {
				progress.report({
					increment: 10,
					message: 'Initializing...',
				});

				await git.clone({
					fs: this.createFsAdapter(),
					http: this.createHttpAdapter(),
					dir,
					url,
					singleBranch: true,
					depth: 1,
					onProgress: (event) => {
						const percent = Math.floor(
							(event.loaded / event.total) * 100
						);
						progress.report({
							increment: percent / 10,
							message: `${event.phase}: ${percent}%`,
						});
					},
				});

				progress.report({ increment: 100, message: 'Complete!' });
			}
		);

		if (remember) {
			await this.context.globalState.update(
				KernelGitProvider.LAST_REMOTE_STORAGE_KEY,
				{
					url,
					dir,
					timestamp: Date.now(),
				}
			);
		}

		if (successMessage) {
			vscode.window.showInformationMessage(successMessage);
		}

		if (openFolder) {
			const uri = vscode.Uri.parse(`kernel://${dir}`);
			await vscode.commands.executeCommand(
				'vscode.openFolder',
				uri,
				false
			);
		}
	}

	async restoreLastRemoteRepository(): Promise<void> {
		const stored =
			this.context.globalState.get<StoredRemoteRepository>(
				KernelGitProvider.LAST_REMOTE_STORAGE_KEY
			);

		if (!stored) {
			return;
		}

		const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
		const workspaceNeedsRestore = workspaceFolders.some(
			(folder) =>
				folder.uri.scheme === 'kernel' && folder.uri.path === stored.dir
		);

		if (!workspaceNeedsRestore) {
			return;
		}

		if (this.hasExistingRepository(stored.dir)) {
			return;
		}

		try {
			await this.cloneRemoteRepository({
				url: stored.url,
				dir: stored.dir,
				progressTitle: `Restoring ${stored.url}`,
				promptOnOverwrite: false,
				openFolder: false,
				remember: true,
				successMessage: `Restored ${stored.url}`,
			});
		} catch (error) {
			console.error('Failed to restore remote repository', error);
			const message =
				error instanceof Error ? error.message : String(error);
			vscode.window.showWarningMessage(
				`Failed to restore ${stored.url}: ${message}`
			);
		}
	}

	/**
	 * Extract repository name from URL
	 */
	private extractRepoName(url: string): string {
		const match = url.match(/\/([^/]+?)(\.git)?$/);
		return match ? match[1] : 'repo';
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
					console.log('[Git FS] readFile:', filepath);
					const uri = vscode.Uri.parse(`kernel://${filepath}`);
					try {
						const content = await vscode.workspace.fs.readFile(uri);
						console.log('[Git FS] readFile SUCCESS:', filepath, 'size:', content.length);
						return decodeGitFsResult(content, options);
					} catch (error) {
						console.error('[Git FS] readFile FAILED:', filepath, error);
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
					console.log('[Git FS] writeFile:', filepath);
					const uri = vscode.Uri.parse(`kernel://${filepath}`);
					const uint8Array = typeof data === 'string'
						? new TextEncoder().encode(data)
						: data;

					// Log config file contents for debugging
					if (filepath?.endsWith('.git/config')) {
						const content = typeof data === 'string' ? data : new TextDecoder().decode(data);
						console.log('[Git FS] config content:', content);
					}

					try {
						await vscode.workspace.fs.writeFile(uri, uint8Array);
						console.log('[Git FS] writeFile SUCCESS:', filepath);
					} catch (error) {
						console.error('[Git FS] writeFile FAILED:', filepath, error);
						throw error;
					}
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
					console.log('[Git FS] mkdir:', filepath);
					const uri = vscode.Uri.parse(`kernel://${filepath}`);
					try {
						await vscode.workspace.fs.createDirectory(uri);
						console.log('[Git FS] mkdir SUCCESS:', filepath);
					} catch (error) {
						console.error('[Git FS] mkdir FAILED:', filepath, error);
						// Try to create parent directories first
						const parts = filepath.split('/').filter(p => p);
						let currentPath = '';
						for (const part of parts) {
							currentPath += '/' + part;
							const parentUri = vscode.Uri.parse(`kernel://${currentPath}`);
							try {
								await vscode.workspace.fs.createDirectory(parentUri);
							} catch (e) {
								// Parent might already exist, ignore
							}
						}
					}
				},
				rmdir: async (filepath: string) => {
					const uri = vscode.Uri.parse(`kernel://${filepath}`);
					await vscode.workspace.fs.delete(uri, { recursive: true, useTrash: false });
				},
				stat: async (filepath: string) => {
					try {
						const uri = vscode.Uri.parse(`kernel://${filepath}`);
						const stat = await vscode.workspace.fs.stat(uri);
						return {
							isFile: () => stat.type === vscode.FileType.File,
							isDirectory: () => stat.type === vscode.FileType.Directory,
							isSymbolicLink: () => stat.type === vscode.FileType.SymbolicLink,
							mode: 0o644, // Default mode
							size: stat.size,
							mtimeMs: stat.mtime,
						};
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
						return {
							isFile: () => stat.type === vscode.FileType.File,
							isDirectory: () => stat.type === vscode.FileType.Directory,
							isSymbolicLink: () => stat.type === vscode.FileType.SymbolicLink,
							mode: 0o644,
							size: stat.size,
							mtimeMs: stat.mtime,
						};
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

	/**
	 * Create HTTP adapter for isomorphic-git
	 */
	private createHttpAdapter(): any {
		return {
			request: async ({
				url,
				method,
				headers,
				body,
			}: {
				url: string;
				method?: string;
				headers?: Record<string, string>;
				body?: any;
			}) => {
				// @TODO: Populate during the build, do not hardcode.
				const requestBody = await normalizeRequestBody(body);
				const response = await fetch(
					'https://vscode.localhost:4443/proxy/?url=' +
						encodeURIComponent(url),
					{
						method: method || 'GET',
						headers: headers || {},
						body: requestBody,
					}
				);

				const responseBody =
					response.body && typeof response.body.getReader === 'function'
						? readableStreamToAsyncIterator(
								response.body as ReadableStream<Uint8Array>
						  )
						: singleChunkAsyncIterable(
								new Uint8Array(await response.arrayBuffer())
						  );

				return {
					url: response.url,
					method: method || 'GET',
					headers: Object.fromEntries(response.headers.entries()),
					body: responseBody,
					statusCode: response.status,
					statusMessage: response.statusText,
				};
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

type CloneRemoteOptions = {
	url: string;
	dir: string;
	progressTitle: string;
	promptOnOverwrite?: boolean;
	openFolder?: boolean;
	remember?: boolean;
	successMessage?: string;
};

type RequestBodyInput =
	| AsyncIterable<ChunkLike>
	| Uint8Array
	| ArrayBuffer
	| string
	| Blob
	| FormData
	| URLSearchParams
	| undefined;

type ChunkLike =
	| Uint8Array
	| ArrayBuffer
	| ArrayBufferView
	| ArrayLike<number>;

async function normalizeRequestBody(
	body?: RequestBodyInput
): Promise<BodyInit | undefined> {
	if (body == null) {
		return undefined;
	}

	if (typeof body === 'string') {
		return body;
	}

	if (body instanceof Uint8Array || body instanceof ArrayBuffer) {
		return body;
	}

	if (
		(typeof Blob !== 'undefined' && body instanceof Blob) ||
		(typeof FormData !== 'undefined' && body instanceof FormData) ||
		(typeof URLSearchParams !== 'undefined' &&
			body instanceof URLSearchParams)
	) {
		return body;
	}

	if (isAsyncIterable(body)) {
		return collectAsyncIterable(body);
	}

	return body as BodyInit;
}

function isAsyncIterable(value: unknown): value is AsyncIterable<ChunkLike> {
	return (
		typeof value === 'object' &&
		value !== null &&
		typeof (value as any)[Symbol.asyncIterator] === 'function'
	);
}

async function collectAsyncIterable(
	iterable: AsyncIterable<ChunkLike>
): Promise<Uint8Array> {
	const chunks: Uint8Array[] = [];
	let total = 0;

	for await (const chunk of iterable) {
		let normalized: Uint8Array;
		if (chunk instanceof Uint8Array) {
			normalized = chunk;
		} else if (
			typeof ArrayBuffer !== 'undefined' &&
			chunk instanceof ArrayBuffer
		) {
			normalized = new Uint8Array(chunk);
		} else if (
			typeof ArrayBuffer !== 'undefined' &&
			ArrayBuffer.isView(chunk as ArrayBufferView)
		) {
			const view = chunk as ArrayBufferView;
			normalized = new Uint8Array(
				view.buffer,
				view.byteOffset,
				view.byteLength
			);
		} else {
			normalized = Uint8Array.from(chunk as ArrayLike<number>);
		}
		chunks.push(normalized);
		total += normalized.length;
	}

	const result = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		result.set(chunk, offset);
		offset += chunk.length;
	}

	return result;
}

function readableStreamToAsyncIterator(
	stream: ReadableStream<Uint8Array>
): AsyncIterableIterator<Uint8Array> {
	const reader = stream.getReader();
	return {
		async next(): Promise<IteratorResult<Uint8Array>> {
			const { done, value } = await reader.read();
			if (done || !value) {
				return { done: true, value: undefined as unknown as Uint8Array };
			}
			return { done: false, value };
		},
		async return(): Promise<IteratorResult<Uint8Array>> {
			reader.releaseLock();
			return { done: true, value: undefined as unknown as Uint8Array };
		},
		[Symbol.asyncIterator]() {
			return this;
		},
	};
}

function singleChunkAsyncIterable(
	chunk: Uint8Array
): AsyncIterableIterator<Uint8Array> {
	return (async function* () {
		yield chunk;
	})();
}
