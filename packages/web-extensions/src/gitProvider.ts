import * as vscode from 'vscode';
import * as git from 'isomorphic-git';
import type { KernelManager } from './kernelManager';

/**
 * Git provider implementation using isomorphic-git
 * Provides full Git integration for the kernel filesystem
 */
export class KernelGitProvider implements vscode.Disposable {
	private disposables: vscode.Disposable[] = [];

	constructor(private kernelManager: KernelManager) {}

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
			vscode.commands.registerCommand('kernel.git.addRemote', async () => {
				await this.addRemote();
			})
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
					if (!value.startsWith('http://') && !value.startsWith('https://')) {
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

			const kernel = this.kernelManager.getKernel();
			const dir = `/home/${dirName}`;

			await vscode.window.withProgress(
				{
					location: vscode.ProgressLocation.Notification,
					title: `Cloning ${url}...`,
					cancellable: false,
				},
				async (progress) => {
					progress.report({ increment: 10, message: 'Initializing...' });

					await git.clone({
						fs: this.createFsAdapter(),
						http: this.createHttpAdapter(),
						dir,
						url,
						corsProxy: 'https://cors.isomorphic-git.org',
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

			vscode.window.showInformationMessage(
				`Repository cloned to ${dir}`
			);

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
			const authorName =
				config.get<string>('defaultName') || 'User';
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
						corsProxy: 'https://cors.isomorphic-git.org',
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
			const authorName =
				config.get<string>('defaultName') || 'User';
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
						corsProxy: 'https://cors.isomorphic-git.org',
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
						corsProxy: 'https://cors.isomorphic-git.org',
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
			vscode.window.showErrorMessage(`Branch creation failed: ${message}`);
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
				detail: `${commit.commit.author.name} <${commit.commit.author.email}> - ${new Date(commit.commit.author.timestamp * 1000).toLocaleString()}`,
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

	/**
	 * Extract repository name from URL
	 */
	private extractRepoName(url: string): string {
		const match = url.match(/\/([^/]+?)(\.git)?$/);
		return match ? match[1] : 'repo';
	}

	/**
	 * Create filesystem adapter for isomorphic-git
	 */
	private createFsAdapter(): any {
		const kernel = this.kernelManager.getKernel();

		return {
			promises: {
				readFile: async (filepath: string) => {
					try {
						return kernel.readFileSync(filepath);
					} catch (error) {
						throw new Error(`readFile failed: ${error}`);
					}
				},
				writeFile: async (
					filepath: string,
					data: Uint8Array | string
				) => {
					try {
						kernel.writeFileSync(filepath, data);
					} catch (error) {
						throw new Error(`writeFile failed: ${error}`);
					}
				},
				unlink: async (filepath: string) => {
					try {
						kernel.unlinkSync(filepath);
					} catch (error) {
						throw new Error(`unlink failed: ${error}`);
					}
				},
				readdir: async (filepath: string) => {
					try {
						return kernel.readdirSync(filepath);
					} catch (error) {
						throw new Error(`readdir failed: ${error}`);
					}
				},
				mkdir: async (filepath: string) => {
					try {
						kernel.mkdirSync(filepath, { recursive: true });
					} catch (error) {
						throw new Error(`mkdir failed: ${error}`);
					}
				},
				rmdir: async (filepath: string) => {
					try {
						kernel.rmdirSync(filepath);
					} catch (error) {
						throw new Error(`rmdir failed: ${error}`);
					}
				},
				stat: async (filepath: string) => {
					try {
						const stats = kernel.statSync(filepath);
						return {
							isFile: () => stats.type === 'file',
							isDirectory: () => stats.type === 'directory',
							isSymbolicLink: () => stats.type === 'symlink',
							mode: stats.mode,
							size: stats.size,
							mtimeMs: stats.mtime,
						};
					} catch (error) {
						throw new Error(`stat failed: ${error}`);
					}
				},
				lstat: async (filepath: string) => {
					try {
						const stats = kernel.statSync(filepath);
						return {
							isFile: () => stats.type === 'file',
							isDirectory: () => stats.type === 'directory',
							isSymbolicLink: () => stats.type === 'symlink',
							mode: stats.mode,
							size: stats.size,
							mtimeMs: stats.mtime,
						};
					} catch (error) {
						throw new Error(`lstat failed: ${error}`);
					}
				},
				readlink: async (filepath: string) => {
					try {
						return kernel.readlinkSync(filepath);
					} catch (error) {
						throw new Error(`readlink failed: ${error}`);
					}
				},
				symlink: async (target: string, filepath: string) => {
					try {
						kernel.symlinkSync(target, filepath);
					} catch (error) {
						throw new Error(`symlink failed: ${error}`);
					}
				},
				chmod: async (filepath: string, mode: number) => {
					try {
						kernel.chmodSync(filepath, mode);
					} catch (error) {
						throw new Error(`chmod failed: ${error}`);
					}
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
				const response = await fetch(url, {
					method: method || 'GET',
					headers: headers || {},
					body: body,
				});

				return {
					url: response.url,
					method: method || 'GET',
					headers: Object.fromEntries(response.headers.entries()),
					body: response.body
						? new Uint8Array(await response.arrayBuffer())
						: undefined,
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
