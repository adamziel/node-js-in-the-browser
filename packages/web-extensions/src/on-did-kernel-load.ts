import * as vscode from 'vscode';
import { KernelManager } from './kernelManager';
import { BlobReader, ZipReader, Uint8ArrayWriter } from '@zip.js/zip.js';
import { Kernel } from '@adamziel/kernel/runtime/core/kernel';

export async function onDidLoadKernel(
	context: vscode.ExtensionContext,
	kernelManager: KernelManager
): Promise<void> {
	const kernel = kernelManager.getKernel();
	await setupEsbuild(kernel, context);
	await createSimpleBlock(kernel);
}

async function setupEsbuild(kernel: Kernel, context: vscode.ExtensionContext) {
	kernel.mkdirSync('/home/blocks', { recursive: true });

	const zipUri = vscode.Uri.joinPath(
		context.extensionUri,
		'dist',
		'kernel-blocks',
		'es-bundler.zip'
	);

	await fetchAndWriteKernelFile(
		kernel,
		zipUri.toString(),
		'/home/blocks/es-bundler.zip'
	);
	await unzipToKernelDirectory(
		kernel,
		'/home/blocks/es-bundler.zip',
		'/home/blocks'
	);

	// Fetch the latest bundle.js from the extension's dist folder
	const bundleUri = vscode.Uri.joinPath(
		context.extensionUri,
		'dist',
		'kernel-blocks',
		'bundle.js'
	);

	await fetchAndWriteKernelFile(
		kernel,
		bundleUri.toString(),
		'/home/blocks/bundle.js'
	);
}

async function createSimpleBlock(kernel: Kernel) {
	// Create a simple block
	kernel.mkdirSync('/jsx/src', { recursive: true });
	kernel.writeFileSync(
		'/jsx/src/block.json',
		`{
		"$schema": "https://json.schemastore.org/block.json",
		"apiVersion": 2,
		"name": "gutenberg-examples/example-01-basic-esnext",
		"title": "Example: Basic (ESNext)",
		"textdomain": "gutenberg-examples",
		"icon": "universal-access-alt",
		"category": "jsx-examples",
		"example": {},
		"editorScript": "file:./index.js"
	}`
	);
	kernel.writeFileSync(
		'/jsx/src/index.js',
		`/**
* WordPress dependencies
*/
import { registerBlockType } from '@wordpress/blocks';

/**
* Internal dependencies
*/
import json from './block.json';
import Edit from './edit';
import save from './save';

// Export this so we can use it in the edit and save files
export const blockStyle = {
	backgroundColor: '#900',
	color: '#fff',
	padding: '20px',
};

// Destructure the json file to get the name of the block
// For more information on how this works, see: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Destructuring_assignment
const { name } = json;

// Register the block
registerBlockType( name, {
	edit: Edit,
	save, // Object shorthand property - same as writing: save: save,
} );`
	);
	kernel.writeFileSync(
		'/jsx/src/edit.js',
		`/**
	* WordPress dependencies
	*/
import { __ } from '@wordpress/i18n';
import { useBlockProps } from '@wordpress/block-editor';

/**
 * Internal dependencies
 */
import { blockStyle } from './index';

const Edit = () => {
	const blockProps = useBlockProps( { style: blockStyle } );
	return (
		<div { ...blockProps }>
			{ __(
				'Hello World, step 1 (from the editor).',
				'gutenberg-examples'
			) }
		</div>
	);
};
export default Edit;`
	);

	kernel.writeFileSync(
		'/jsx/src/save.js',
		`/**
	* WordPress dependencies
	*/
import { __ } from '@wordpress/i18n';
import { useBlockProps } from '@wordpress/block-editor';

/**
 * Internal dependencies
 */
import { blockStyle } from './index';

const Save = () => {
	const blockProps = useBlockProps.save( { style: blockStyle } );
	return (
		<div { ...blockProps }>
			{ __(
				'Hello World, step 1 (from the frontend).',
				'gutenberg-examples'
			) }
		</div>
	);
};
export default Save;`
	);
	kernel.writeFileSync(
		'/jsx/src/index.php',
		`<?php
/**
 * Plugin Name: Gutenberg Examples Basic EsNext
 * Plugin URI: https://github.com/WordPress/gutenberg-examples
 * Description: This is a plugin demonstrating how to register new blocks for the Gutenberg editor.
 * Version: 1.1.0
 * Author: the Gutenberg Team
 *
 * @package gutenberg-examples
 */

defined( 'ABSPATH' ) || exit;

/**
 * Load all translations for our plugin from the MO file.
 */
function gutenberg_examples_01_esnext_load_textdomain() {
	load_plugin_textdomain( 'gutenberg-examples', false, basename( __DIR__ ) . '/languages' );
}
add_action( 'init', 'gutenberg_examples_01_esnext_load_textdomain' );

/**
 * Registers all block assets so that they can be enqueued through Gutenberg in
 * the corresponding context.
 *
 * Passes translations to JavaScript.
 */
function gutenberg_examples_01_esnext_register_block() {

	// Register the block by passing the location of block.json to register_block_type.
	register_block_type( __DIR__ );

	if ( function_exists( 'wp_set_script_translations' ) ) {
		/**
		 * May be extended to wp_set_script_translations( 'my-handle', 'my-domain',
		 * plugin_dir_path( MY_PLUGIN ) . 'languages' ) ). For details see
		 * https://make.wordpress.org/core/2018/11/09/new-javascript-i18n-support-in-wordpress/
		 */
		wp_set_script_translations( 'gutenberg-examples-01-esnext', 'gutenberg-examples' );
	}

}
add_action( 'init', 'gutenberg_examples_01_esnext_register_block' );`
	);

	kernel.writeFileSync(
		'/jsx/src/save.js',
		`/**
	* WordPress dependencies
	*/
import { __ } from '@wordpress/i18n';
import { useBlockProps } from '@wordpress/block-editor';

/**
 * Internal dependencies
 */
import { blockStyle } from './index';

const Save = () => {
	const blockProps = useBlockProps.save( { style: blockStyle } );
	return (
		<div { ...blockProps }>
			{ __(
				'Hello World, step 1 (from the frontend).',
				'gutenberg-examples'
			) }
		</div>
	);
};
export default Save;`
	);

	kernel.writeFileSync(
		'/jsx/package.json',
		`{
	"name": "gutenberg-examples",
	"version": "1.1.0",
	"private": true,
	"description": "Gutenberg Examples",
	"author": "The WordPress Contributors",
	"license": "GPL-2.0-or-later",
	"type": "module",
	"keywords": [
		"WordPress",
		"editor",
		"Examples"
	],
	"homepage": "https://github.com/WordPress/gutenberg-examples/",
	"repository": "git+https://github.com/WordPress/gutenberg-examples.git",
	"bugs": {
		"url": "https://github.com/WordPress/gutenberg-examples/issues"
	}
}`
	);
}

async function unzip(zipData: Uint8Array): Promise<Record<string, Uint8Array>> {
	// Convert Uint8Array to Blob - create a new ArrayBuffer copy to ensure proper type
	const arrayBuffer = zipData.slice().buffer as ArrayBuffer;
	const zipBlob = new Blob([arrayBuffer]);

	// Create a BlobReader to read the zip file
	const zipFileReader = new BlobReader(zipBlob);

	// Create a ZipReader to read the zip content
	const zipReader = new ZipReader(zipFileReader);

	// Get all entries from the zip file
	const entries = await zipReader.getEntries();

	// Extract all entries into an object
	const result: Record<string, Uint8Array> = {};

	for (const entry of entries) {
		// Skip if it's a directory (directories end with /)
		if (entry.directory) {
			result[entry.filename] = new Uint8Array(0);
		} else {
			// Create a Uint8ArrayWriter to receive the data
			const writer = new Uint8ArrayWriter();

			// Get the entry data and write it to the writer
			const data = await entry.getData!(writer);

			// Store the data in the result object
			result[entry.filename] = data;
		}
	}

	// Close the zip reader
	await zipReader.close();

	return result;
}

async function unzipToKernelDirectory(
	kernel: Kernel,
	zipPath: string,
	targetDirectory: string
) {
	// Read the zip file from the kernel filesystem
	const zipData = (await kernel.readFileSync(
		zipPath,
		undefined
	)) as Uint8Array;

	// Unzip the data
	const unzipped = await unzip(zipData);

	// Write all files to the target directory
	for (const [filePath, fileData] of Object.entries(unzipped)) {
		const fullPath = `${targetDirectory}/${filePath}`;

		// Check if this is a directory (ends with /)
		if (filePath.endsWith('/')) {
			kernel.mkdirSync(fullPath.slice(0, -1), { recursive: true });
		} else {
			// Ensure parent directory exists
			ensureParentDirectory(kernel, fullPath);
			// Write the file
			kernel.writeFileSync(fullPath, fileData, {});
		}
	}

	console.log(
		`Unzipped ${
			Object.keys(unzipped).length
		} entries from ${zipPath} to ${targetDirectory}`
	);
}

async function fetchAndWriteKernelFile(
	kernel: Kernel,
	sourcePath: string,
	targetPath: string,
	mode?: number
) {
	const response = await fetch(sourcePath);
	if (!response.ok) {
		throw new Error(
			`Failed to fetch ${sourcePath}: ${response.status} ${response.statusText}`
		);
	}
	const data = new Uint8Array(await response.arrayBuffer());
	ensureParentDirectory(kernel, targetPath);
	if (typeof mode === 'number') {
		kernel.writeFileSync(targetPath, data, { mode });
	} else {
		kernel.writeFileSync(targetPath, data, {});
	}
}

function ensureParentDirectory(kernel: Kernel, targetPath: string) {
	const lastSlash = targetPath.lastIndexOf('/');
	if (lastSlash <= 0) {
		return;
	}
	const directory = targetPath.slice(0, lastSlash);
	kernel.mkdirSync(directory, { recursive: true });
}
