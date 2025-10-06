import path from '../modules/path.js';
import fs from '../modules/fs.js';

function stripBOM(content) {
	if (content.charCodeAt(0) === 0xfeff) {
		return content.slice(1);
	}
	return content;
}

function updateChildren(parent, child, scan) {
	if (parent) {
		const children = parent.children;
		if (children && !(scan && children.includes(child)))
			children.push(child);
	}
}

export class Module {
	id;
	path;
	exports = {};
	parent;
	filename = null;
	loaded = false;
	children = [];
	paths = [];

	constructor(id = '', parent) {
		this.id = id;
		this.path = path.dirname(id);
		this.parent = parent;
		if (parent) {
			updateChildren(parent, this, false);
		}
	}

	require(id) {
		if (typeof id !== 'string') {
			throw new Error('id must be a string');
		}
		if (id === '') {
			throw new Error('id must be a non-empty string');
		}

		return Module._load(id, this, false);
	}

	load(filename) {
		this.filename = filename;
		this.paths = Module._nodeModulePaths(path.dirname(filename));

		const extension = path.extname(filename) || '.js';
		if (!Module._extensions[extension]) {
			Module._extensions['.js'](this, filename);
		} else {
			Module._extensions[extension](this, filename);
		}
		this.loaded = true;
	}

	_compile(content, filename) {
		// Remove shebang or two shebangs (as sometimes is the case)
		const lines = content.split('\n')
		const shebangRegex = /^#!.*/;
		if (lines.length > 0 && shebangRegex.test(lines[0])) {
			lines.shift()
		}
		if (lines.length > 0 && shebangRegex.test(lines[0])) {
			lines.shift()
		}
		content = lines.join('\n')
		
		// Keep wrapping and compiling the content
		const wrapper = Module.wrap(content);

		const factory = new Function(`return ${wrapper}`);
		const compiledWrapper = factory();

		const dirname = path.dirname(filename);

		const requireFn = (id) => {
			return this.require(id);
		};
		requireFn.resolve = (id) => {
			return Module._resolveFilename(id, this);
		};
		Object.defineProperty(requireFn, 'cache', {
			get() {
				return Module._cache;
			},
		});
		Object.defineProperty(requireFn, 'main', {
			get() {
				return Module._mainModule;
			},
		});

		return compiledWrapper.call(
			this.exports,
			this.exports,
			requireFn,
			this,
			filename,
			dirname,
		);
	}

	static _cache = Object.create(null);
	static _pathCache = Object.create(null);
	static _extensions = Object.create(null);
	static globalPaths = [];
	static _mainModule = undefined;

	static wrapper = [
		`(function (exports, require, module, __filename, __dirname) { 
			if(!('global' in globalThis)) {
				globalThis.global = globalThis;
			}
			globalThis.require = require;

			const originalSetTimeout = globalThis.setTimeout;
			globalThis.setTimeout = function(...args) {
				const ref = originalSetTimeout(...args);
				return {
					__toString: function () {
						return ref;
					},
					unref: function() {
						clearTimeout(ref);
					}
				};
			};
		`.replaceAll("\n", ""),
		'\n});',
	];

	static wrap(script) {
		return Module.wrapper[0] + script + Module.wrapper[1];
	}

	static _nodeModulePaths(from) {
		// Generate node_modules paths up the directory chain
		const parts = from.split('/');
		const paths = [];

		for (let i = parts.length; i >= 0; i--) {
			const dirPath = parts.slice(0, i).join('/');
			if (dirPath) {
				paths.push(dirPath + '/node_modules');
			}
		}

		return paths;
	}

	static _resolveFromNodeModules(request, basedir) {
		// Try to resolve from node_modules directories
		const nodeModulesPaths = Module._nodeModulePaths(basedir);
		const extensions = Object.keys(Module._extensions);

		for (const nodeModulesPath of nodeModulesPaths) {
			// First try the module as a file with extensions
			for (const ext of extensions) {
				const modulePath = path.join(nodeModulesPath, request + ext);
				if (fs.existsSync(modulePath) && fs.statSync(modulePath).isFile()) {
					return modulePath;
				}
			}

			// Then try as a directory or file
			const modulePath = path.join(nodeModulesPath, request);

			// Check if it's a file
			if (fs.existsSync(modulePath) && fs.statSync(modulePath).isFile()) {
				return modulePath;
			}

			// Check if it's a directory with package.json
			if (fs.existsSync(modulePath) && fs.statSync(modulePath).isDirectory()) {
				const pkgPath = path.join(modulePath, 'package.json');
				if (fs.existsSync(pkgPath) && fs.statSync(pkgPath).isFile()) {
					try {
						const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
						if (pkg.main) {
							const mainPath = path.resolve(modulePath, pkg.main);
							if (fs.existsSync(mainPath) && fs.statSync(mainPath).isFile()) {
								return mainPath;
							}

							// Try with extensions
							for (const ext of extensions) {
								if (fs.existsSync(mainPath + ext) && fs.statSync(mainPath + ext).isFile()) {
									return mainPath + ext;
								}
							}
						}
					} catch (e) {
						// ignore
					}
				}

				// Check for index file
				for (const ext of extensions) {
					const indexPath = path.join(modulePath, 'index' + ext);
					if (fs.existsSync(indexPath) && fs.statSync(indexPath).isFile()) {
						return indexPath;
					}
				}
			}
		}

		return null;
	}

	static _resolveFilename(request, parent) {
		if (builtinModules.includes(request)) {
			return request;
		}
		if (!parent || !parent.path) {
			throw new Error(
				`Cannot resolve module '${request}' without a parent context.`
			);
		}

		// node-gyp polyfill
		const normalised = request.startsWith('node:')
			? request.substring(5)
			: request;
		if (normalised.includes('node-gyp')) {
			return 'fake';
		}

		// Special case for debugging
		if (request === './default-input.js') {
			console.log('resolve ./default-input.js');
			console.log({request, parent});
			return '/bin/default-input.js';
		}

		const basedir = parent.path;
		const isRelative = request.startsWith('./') || request.startsWith('../');

		// For relative imports, first try the current resolution logic
		if (isRelative) {
			let resolvedPath;
			try {
				resolvedPath = path.resolve(basedir, request);
			} catch (e) {
				throw new Error(
					`Could not resolve '${request}' from '${basedir}'.`
				);
			}

			const extensions = Object.keys(Module._extensions);

			// Check if it's a file
			if (fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isFile()) {
				return resolvedPath;
			}
			for (const ext of extensions) {
				if (
					fs.existsSync(resolvedPath + ext) &&
					fs.statSync(resolvedPath + ext).isFile()
				) {
					return resolvedPath + ext;
				}
			}

			// Check if it's a directory
			if (
				fs.existsSync(resolvedPath) &&
				fs.statSync(resolvedPath).isDirectory()
			) {
				// Check for package.json "main"
				const pkgPath = path.join(resolvedPath, 'package.json');
				if (fs.existsSync(pkgPath) && fs.statSync(pkgPath).isFile()) {
					try {
						const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
						if (pkg.main) {
							const mainPath = path.resolve(resolvedPath, pkg.main);
							if (
								fs.existsSync(mainPath) &&
								fs.statSync(mainPath).isFile()
							) {
								return mainPath;
							}
							for (const ext of extensions) {
								if (
									fs.existsSync(mainPath + ext) &&
									fs.statSync(mainPath + ext).isFile()
								) {
									return mainPath + ext;
								}
							}
						}
					} catch (e) {
						// ignore
					}
				}

				// Check for index file
				for (const ext of extensions) {
					const indexPath = path.join(resolvedPath, 'index' + ext);
					if (
						fs.existsSync(indexPath) &&
						fs.statSync(indexPath).isFile()
					) {
						return indexPath;
					}
				}
			}
		}

		// Try resolving from node_modules (for both relative and absolute imports)
		const nodeModulesResult = Module._resolveFromNodeModules(request, basedir);
		if (nodeModulesResult) {
			return nodeModulesResult;
		}

		// If relative resolution was attempted but failed, throw specific error
		if (isRelative) {
			throw new Error(`Cannot find module '${request}'`);
		}

		throw new Error(`Cannot find module '${request}'`);
	}

	static _load(request, parent, isMain) {
		const normalised = request.startsWith('node:')
			? request.substring(5)
			: request;
		if (normalised in globalThis.coreModules) {
			return globalThis.coreModules[normalised];
		}

		if (builtinModules.includes(request)) {
			// This is a browser environment, we can't truly load builtins
			// but we can return a placeholder or throw.
			// For now, let's assume the build process handles these.
			console.warn(
				`Attempted to load builtin module "${request}". This may not work in the browser.`
			);
			// The bundler should have provided a polyfill.
			// This logic is a fallback and might not work as expected.
			return {};
		}

		const filename = Module._resolveFilename(request, parent);

		const cachedModule = Module._cache[filename];
		if (cachedModule !== undefined) {
			updateChildren(parent, cachedModule, true);
			return cachedModule.exports;
		}

		const module = new Module(filename, parent);

		Module._cache[filename] = module;

		let threw = true;
		try {
			module.load(filename);
			threw = false;
		} finally {
			if (threw) {
				delete Module._cache[filename];
			}
		}

		return module.exports;
	}

	static runMain(options) {
		const mainModule = new Module(options.path, options.parent);
		mainModule.filename = options.path;
		mainModule.paths = Module._nodeModulePaths(path.dirname(options.path));

		Module._cache[options.path] = mainModule;
		Module._mainModule = mainModule;

		return mainModule._compile(options.code, options.path);
	}
}

Module._extensions['.js'] = function (module, filename) {
	const content = fs.readFileSync(filename, 'utf8');
	module._compile(stripBOM(content), filename);
};

Module._extensions['.json'] = function (module, filename) {
	const content = fs.readFileSync(filename, 'utf8');
	try {
		module.exports = JSON.parse(stripBOM(content));
	} catch (err) {
		const newErr = new Error(`${filename}: ${err.message}`);
		throw newErr;
	}
};

export const builtinModules = Object.keys(globalThis.coreModules);

export const modulePolyfill = Object.assign(Module, {
	Module,
	builtinModules,
});
