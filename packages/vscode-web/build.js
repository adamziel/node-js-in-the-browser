#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const CACHE_DIR = path.join(__dirname, '.vscode-test-web');
const DIST_DIR = path.join(__dirname, 'dist');

console.log('Building VS Code Web static assets...\n');

// Step 1: Check if VS Code assets are downloaded
console.log('Step 1/3: Checking for VS Code assets...');
const cacheExists = fs.existsSync(CACHE_DIR);

if (!cacheExists) {
	console.log('VS Code assets not found. Downloading...');
	console.log('Running: npm run dev (this will download VS Code)');
	console.log('Please wait while VS Code downloads (~22MB)...\n');

	try {
		// Run the dev server briefly to trigger download
		const child = execSync('timeout 30 npm run dev || true', {
			stdio: 'inherit',
			cwd: __dirname,
		});
	} catch (e) {
		// Timeout is expected, we just need the download
	}
}

// Step 2: Find the downloaded VS Code directory
console.log('\nStep 2/3: Locating VS Code assets...');
const vscodeDir = fs
	.readdirSync(CACHE_DIR)
	.find((dir) => dir.startsWith('vscode-web-'));

if (!vscodeDir) {
	console.error(
		'Error: Could not find VS Code assets. Please run: npm run dev'
	);
	process.exit(1);
}

const sourcePath = path.join(CACHE_DIR, vscodeDir);
console.log(`Found: ${vscodeDir}`);

// Step 3: Copy to dist
console.log('\nStep 3/3: Copying assets to dist/...');

// Remove old dist if exists
if (fs.existsSync(DIST_DIR)) {
	fs.rmSync(DIST_DIR, { recursive: true });
}

// Copy everything
fs.cpSync(sourcePath, DIST_DIR, { recursive: true });

// Copy over custom kernel host bootstrap/worker
const kernelHostDir = path.join(__dirname, 'kernel-host');
if (fs.existsSync(kernelHostDir)) {
	fs.cpSync(kernelHostDir, path.join(DIST_DIR, 'kernel-host'), {
		recursive: true,
	});
}

// Copy and modify the AMD main.js file
const testWebPackageJson = require.resolve('@vscode/test-web/package.json', {
	paths: [__dirname],
});
const testWebRoot = path.dirname(testWebPackageJson);
const amdSourceDir = path.join(testWebRoot, 'out', 'browser', 'amd');
const amdDestDir = path.join(DIST_DIR, 'out', 'browser', 'amd');
if (!fs.existsSync(amdDestDir)) {
	fs.mkdirSync(amdDestDir, { recursive: true });
}

// Read main.js and replace the workbench.api path
let mainJsContent = fs.readFileSync(
	path.join(amdSourceDir, 'main.js'),
	'utf-8'
);
// Replace ./workbench.api with the correct path
mainJsContent = mainJsContent.replace(
	'./workbench.api',
	'vs/workbench/workbench.web.main'
);
fs.writeFileSync(path.join(amdDestDir, 'main.js'), mainJsContent);

// Create index.html
const indexHtml = `<!-- Copyright (C) Microsoft Corporation. All rights reserved. -->
<!DOCTYPE html>
<html>
	<head>
		<script>
			performance.mark('code/didStartRenderer')
		</script>
		<meta charset="utf-8" />

		<!-- Mobile tweaks -->
		<meta name="mobile-web-app-capable" content="yes" />
		<meta name="apple-mobile-web-app-capable" content="yes" />
		<meta name="apple-mobile-web-app-title" content="Code">
		<link rel="apple-touch-icon" href="./code-192.png" />

		<!-- Disable pinch zooming -->
		<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no">

		<!-- Workbench Configuration -->
		<meta id="vscode-workbench-web-configuration" data-settings="{&quot;productConfiguration&quot;:{&quot;enableTelemetry&quot;:false},&quot;workspaceUri&quot;:{&quot;scheme&quot;:&quot;tmp&quot;,&quot;path&quot;:&quot;/default.code-workspace&quot;}}">

		<!-- Builtin Extensions -->
		<meta id="vscode-workbench-builtin-extensions" data-settings="[&quot;automattic.foo-button-extension&quot;]">

		<!-- Workbench Icon/Manifest/CSS -->
		<link rel="icon" href="./favicon.ico" type="image/x-icon" />
		<link rel="manifest" href="./manifest.json">
		<link data-name="vs/workbench/workbench.web.main" rel="stylesheet" href="./out/vs/workbench/workbench.web.main.css" />
	</head>

	<body aria-label="">
		<script type="module" src="./kernel-host/bootstrap.js"></script>
	</body>

	<!-- Startup (do not modify order of script tags!) -->
	<script src="./out/vs/loader.js"></script>
	<script>
		require.config({
			baseUrl: \`./out\`,
			recordStats: true,
			trustedTypesPolicy: window.trustedTypes?.createPolicy('amdLoader', {
				createScriptURL(value) {
					return value;
				}
			}),
			paths: {
				'@microsoft/1ds-core-js': '../node_modules/@microsoft/1ds-core-js/dist/ms.core',
				'@microsoft/1ds-post-js': '../node_modules/@microsoft/1ds-post-js/dist/ms.post',
				'@vscode/iconv-lite-umd': '../node_modules/@vscode/iconv-lite-umd/lib/iconv-lite-umd',
				'jschardet': '../node_modules/jschardet/dist/jschardet.min',
				'vscode-textmate': '../node_modules/vscode-textmate/release/main',
				'vscode-oniguruma': '../node_modules/vscode-oniguruma/release/main',
				'@xterm/xterm': '../node_modules/@xterm/xterm/lib/xterm',
				'@xterm/addon-clipboard': '../node_modules/@xterm/addon-clipboard/lib/addon-clipboard',
				'@xterm/addon-image': '../node_modules/@xterm/addon-image/lib/addon-image',
				'@xterm/addon-search': '../node_modules/@xterm/addon-search/lib/addon-search',
				'@xterm/addon-serialize': '../node_modules/@xterm/addon-serialize/lib/addon-serialize',
				'@xterm/addon-unicode11': '../node_modules/@xterm/addon-unicode11/lib/addon-unicode11',
				'@xterm/addon-webgl': '../node_modules/@xterm/addon-webgl/lib/addon-webgl',
				'@vscode/vscode-languagedetection': '../node_modules/@vscode/vscode-languagedetection/dist/lib/index',
				'tas-client-umd': '../node_modules/tas-client-umd/lib/tas-client-umd'
			}
		});
	</script>
	<script>
		performance.mark('code/willLoadWorkbenchMain');
	</script>
	<script src="./out/nls.messages.js"></script>
	<script src="./out/vs/workbench/workbench.web.main.js"></script>
	<script src="./out/browser/amd/main.js"></script>
	<script>
		require(["vscode-web-browser-main"], function() { });
	</script>
</html>
`;

fs.writeFileSync(path.join(DIST_DIR, 'index.html'), indexHtml);

console.log('\n✅ Build complete!');
console.log(`\nStatic files are in: ${DIST_DIR}`);
console.log('\nTo serve locally:');
console.log('  npm run serve');
console.log('\nTo deploy:');
console.log('  Upload the dist/ directory to your web server');
console.log('  Serve with any static file server (nginx, Apache, CDN, etc.)');
