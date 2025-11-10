import { spawn } from 'child_process';
import path from 'path';
import url from 'url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const quality = process.env.VSCODE_TEST_WEB_QUALITY;
const args = ['vscode-test-web', '--browserType', 'none', '--coi', '--extensionDevelopmentPath=../web-extensions', '--host=127.0.0.1', '--port=3958'];

if (quality) {
	args.push(`--quality=${quality}`);
}

process.env.VSCODE_DEV_FORCE_PROTO = process.env.VSCODE_DEV_FORCE_PROTO || 'https';

const child = spawn('npx', args, {
	cwd: path.join(root, 'packages', 'vscode-web'),
	stdio: 'inherit',
	env: process.env,
});

child.on('exit', (code) => {
	process.exit(code ?? 0);
});
