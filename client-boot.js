globalThis.SharedArrayBuffer = ArrayBuffer;
globalThis.primordials = { };
globalThis.global = globalThis;
import * as builtins from "./src/builtins.js";
const { InMemoryFileSystem } = await import("./src/in-memory-fs.js");
const globalFs = new InMemoryFileSystem();

function maybePromiseFromSync(syncFn, kUsePromises) {
	if (kUsePromises === undefined) {
		return syncFn();
	}
	return new Promise((resolve, reject) => {
		try {
			resolve(syncFn());
		} catch (err) {
			reject(err);
		}
	});
}

// Implement V8 internal functions in JavaScript
function getOwnNonIndexProperties(obj, filter) {
	if (typeof obj !== 'object' || obj === null) {
		return [];
	}

	const ALL_PROPERTIES = 0;
	const ONLY_WRITABLE = 1;
	const ONLY_ENUMERABLE = 2;
	const ONLY_CONFIGURABLE = 4;
	const SKIP_STRINGS = 8;
	const SKIP_SYMBOLS = 16;

	let keys = [];
	
	// Get string keys
	if (!(filter & SKIP_STRINGS)) {
		keys = keys.concat(Object.getOwnPropertyNames(obj).filter(k => {
			// Skip numeric indices
			const num = Number(k);
			if (Number.isInteger(num) && num >= 0 && String(num) === k) {
				return false;
			}
			return true;
		}));
	}

	// Get symbol keys
	if (!(filter & SKIP_SYMBOLS)) {
		keys = keys.concat(Object.getOwnPropertySymbols(obj));
	}

	// Apply property filters
	if (filter !== ALL_PROPERTIES) {
		keys = keys.filter(key => {
			const desc = Object.getOwnPropertyDescriptor(obj, key);
			if (!desc) return false;

			if ((filter & ONLY_WRITABLE) && !desc.writable) return false;
			if ((filter & ONLY_ENUMERABLE) && !desc.enumerable) return false;
			if ((filter & ONLY_CONFIGURABLE) && !desc.configurable) return false;

			return true;
		});
	}

	return keys;
}

function getPromiseDetails(promise) {
	// Return undefined if it's not a Promise
	if (!(promise instanceof Promise)) {
		return undefined;
	}

	// We can't directly access promise state in JavaScript, 
	// but we can use a trick with Promise.race
	const kPending = 0;
	const kFulfilled = 1;
	const kRejected = 2;

	// This is a best-effort polyfill since JavaScript doesn't expose promise internals
	// For synchronous inspection, we'd need to track promises ourselves
	// Return pending state as fallback
	return [kPending];
}

function getProxyDetails(proxy, includeTarget = true) {
	// Return undefined if it's not a proxy
	// Unfortunately, JavaScript doesn't provide a way to detect if something is a Proxy
	// or to extract its target and handler
	// This is a limitation of the language
	return undefined;
}

function previewEntries(obj) {
	// Preview entries for Maps, Sets, typed arrays etc
	if (obj instanceof Map) {
		const entries = Array.from(obj.entries()).slice(0, 100);
		return [entries, entries.length < obj.size];
	}
	if (obj instanceof Set) {
		const entries = Array.from(obj.values()).slice(0, 100);
		return [entries, entries.length < obj.size];
	}
	// For arrays and typed arrays
	if (Array.isArray(obj) || ArrayBuffer.isView(obj)) {
		const entries = Array.from(obj).slice(0, 100);
		return [entries, entries.length < obj.length];
	}
	return undefined;
}

function internalGetConstructorName(obj) {
	if (obj === null || obj === undefined) {
		return '';
	}
	if (typeof obj !== 'object' && typeof obj !== 'function') {
		return '';
	}
	// Get constructor name
	if (obj.constructor && obj.constructor.name) {
		return obj.constructor.name;
	}
	// Fallback to Object.prototype.toString
	const str = Object.prototype.toString.call(obj);
	const match = str.match(/^\[object (\w+)\]$/);
	return match ? match[1] : 'Object';
}

function getExternalValue(external) {
	// External values are V8-specific and represent C++ pointers
	// We can't truly polyfill this in JavaScript
	// Return 0n as a placeholder
	return 0n;
}

globalThis.internalModules = {
	builtins: {
		...builtins 
	},
crypto: {
	getBundledRootCertificates() {},
	getExtraCACertificates() {},
	getSystemCACertificates() {},
	resetRootCertStore() {},
	getUserRootCertificates() {},
	getSSLCiphers() {},
	getHashes() {
		return ['md5', 'sha1', 'sha256', 'sha384', 'sha512'];
	},
	getCurves() {
		return ['secp256k1', 'prime256v1', 'secp384r1', 'secp521r1'];
	},
	getCiphers() {
		return ['aes-128-cbc', 'aes-192-cbc', 'aes-256-cbc', 'aes-128-gcm', 'aes-256-gcm'];
	},
	startLoadingCertificatesOffThread() {},
	KeyObjectHandle: null,
	createNativeKeyObjectClass() {
		return [null, null, null, null];
	},
	kKeyTypeSecret: null,
	kKeyTypePublic: null,
	kKeyTypePrivate: null,
	kKeyFormatPEM: null,
	kKeyFormatDER: null,
	kKeyFormatJWK: null,
	kKeyEncodingPKCS1: null,
	kKeyEncodingPKCS8: null,
	kKeyEncodingSPKI: null,
	kKeyEncodingSEC1: null,
	EVP_PKEY_ML_DSA_44: null,
	EVP_PKEY_ML_DSA_65: null,
	EVP_PKEY_ML_DSA_87: null,
	
	// Crypto job constants
	kCryptoJobAsync: 0,
	kCryptoJobSync: 1,

	// RandomBytesJob class for async random bytes generation
	RandomBytesJob: class RandomBytesJob {
		constructor(size) {
			this.size = size;
			this.result = null;
			this.error = null;
		}
		
		run(callback) {
			try {
				const buffer = new Uint8Array(this.size);
				// @TODO: Use another method of generating sync random bytes
				for (let i = 0; i < this.size; i++) {
					buffer[i] = Math.round(Math.random() * 256);
				}
				this.result = buffer;
				
				// Return as array [error, result]
				return [null, buffer];
			} catch (err) {
				return [err, null];
			}
		}
	},
	
	// RandomPrimeJob class for generating random prime numbers
	RandomPrimeJob: class RandomPrimeJob {
		constructor(size, options = {}) {
			this.size = size;
			this.options = options;
			this.result = null;
			this.error = null;
		}
		
		run(callback) {
			try {
				// Simple prime generation (not cryptographically optimal, but functional)
				const min = this.options.min || 2n;
				const max = this.options.max || (2n ** BigInt(this.size));
				
				// Generate random bigint in range
				let candidate = this._randomBigInt(min, max);
				
				// Ensure it's odd
				if (candidate % 2n === 0n) candidate += 1n;
				
				// Simple primality test (Miller-Rabin would be better)
				while (!this._isProbablyPrime(candidate)) {
					candidate += 2n;
					if (candidate > max) {
						candidate = min + (candidate - max);
					}
				}
				
				this.result = candidate;
				if (callback) callback(null, candidate);
			} catch (err) {
				this.error = err;
				if (callback) callback(err);
			}
		}
		
		_randomBigInt(min, max) {
			const range = max - min;
			const bits = range.toString(2).length;
			const bytes = Math.ceil(bits / 8);
			const buffer = new Uint8Array(bytes);
			crypto.getRandomValues(buffer);
			
			let result = 0n;
			for (let i = 0; i < bytes; i++) {
				result = (result << 8n) | BigInt(buffer[i]);
			}
			
			return min + (result % range);
		}
		
		_isProbablyPrime(n, k = 5) {
			if (n < 2n) return false;
			if (n === 2n || n === 3n) return true;
			if (n % 2n === 0n) return false;
			
			// Simple trial division for small primes
			const smallPrimes = [3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n, 41n, 43n, 47n];
			for (const p of smallPrimes) {
				if (n === p) return true;
				if (n % p === 0n) return false;
			}
			
			// Miller-Rabin primality test
			let d = n - 1n;
			let r = 0n;
			while (d % 2n === 0n) {
				d /= 2n;
				r += 1n;
			}
			
			witnessLoop: for (let i = 0; i < k; i++) {
				const a = 2n + this._randomBigInt(0n, n - 4n);
				let x = this._modPow(a, d, n);
				
				if (x === 1n || x === n - 1n) continue;
				
				for (let j = 0n; j < r - 1n; j++) {
					x = this._modPow(x, 2n, n);
					if (x === n - 1n) continue witnessLoop;
				}
				
				return false;
			}
			
			return true;
		}
		
		_modPow(base, exponent, modulus) {
			if (modulus === 1n) return 0n;
			let result = 1n;
			base = base % modulus;
			while (exponent > 0n) {
				if (exponent % 2n === 1n) {
					result = (result * base) % modulus;
				}
				exponent = exponent / 2n;
				base = (base * base) % modulus;
			}
			return result;
		}
	},
	
	// CheckPrimeJob class for checking primality
	CheckPrimeJob: class CheckPrimeJob {
		constructor(candidate, checks = 0) {
			this.candidate = BigInt(candidate);
			this.checks = checks || 5;
			this.result = false;
			this.error = null;
		}
		
		run(callback) {
			try {
				// Use the same primality test from RandomPrimeJob
				const job = new this.constructor.RandomPrimeJob(0);
				this.result = job._isProbablyPrime(this.candidate, this.checks);
				if (callback) callback(null, this.result);
			} catch (err) {
				this.error = err;
				if (callback) callback(err);
			}
		}
	},
	
	// Secure buffer creation
	secureBuffer(size) {
		const buffer = new Uint8Array(size);
		crypto.getRandomValues(buffer);
		return buffer;
	}
},
	util: {
		privateSymbols: {
			arrow_message_private_symbol: 1,
			contextify_context_private_symbol: 2,
			decorated_private_symbol: 3,
			napi_type_tag: 4,
			napi_wrapper: 5,
			untransferable_object_private_symbol: 6,
			exiting_aliased_Uint32Array: 7,
		},
		defineLazyProperties: (obj, props) => {
			for (const [key, get] of Object.entries(props)) {
				Object.defineProperty(obj, key, {
					configurable: true,
					enumerable: true,
					get() {
						const value = get;
						Object.defineProperty(obj, key, {
							value,
							writable: false,
							configurable: false,
							enumerable: true
						});
						return value;
					}
				});
			}
		},
		constants: {
			kPending: 0,
			kFulfilled: 1,
			kRejected: 2,
			kExiting: 0,
			kExitCode: 1,
			kHasExitCode: 2,
			ALL_PROPERTIES: 0,
			ONLY_WRITABLE: 1,
			ONLY_ENUMERABLE: 2,
			ONLY_CONFIGURABLE: 4,
			SKIP_STRINGS: 8,
			SKIP_SYMBOLS: 16,
			kDisallowCloneAndTransfer: 0,
			kTransferable: 1,
			kCloneable: 2,
		},
		propertyFilter: {
			ALL_PROPERTIES: 0,
			ONLY_WRITABLE: 1,
			ONLY_ENUMERABLE: 2,
			ONLY_CONFIGURABLE: 4,
			SKIP_STRINGS: 8,
			SKIP_SYMBOLS: 16,
		},
		getOwnNonIndexProperties,
		getPromiseDetails,
		getProxyDetails,
		previewEntries,
		getConstructorName: internalGetConstructorName,
		getExternalValue
	},
	options: {
		getCLIOptionsValues: () => ({}),
		getCLIOptionsInfo: () => ({}),
		getOptionsAsFlags: () => ({}),
		getEmbedderOptions: () => ({}),
		getEnvOptionsInputType: () => ({}),
		getNamespaceOptionsInputType: () => ({}),
	},
	config: {
		get: () => ({}),
	},
	fs: {
		kUsePromises: Symbol("kUsePromises"),
		FSReqCallback: class FSReqCallback {
			constructor() {
				this.context = undefined;
				this.oncomplete = () => {};
			}
			
			// Called when the async operation completes
			// Node.js C++ code calls this with (err, result, ...)
			// We simulate this pattern
		},
		constants: {},
		open(path, flags, mode, reqOrPromise) {
			// Check if this is an FSReqCallback (has oncomplete) or kUsePromises symbol
			if (reqOrPromise && typeof reqOrPromise === 'object' && 'oncomplete' in reqOrPromise) {
				// Async callback pattern
				setImmediate(() => {
					try {
						const fd = globalFs.openSync(path, flags, mode);
						reqOrPromise.oncomplete(null, fd);
					} catch (err) {
						reqOrPromise.oncomplete(err);
					}
				});
				return;
			}
			// Promise or sync pattern
			return maybePromiseFromSync(() => globalFs.openSync(path, flags, mode), reqOrPromise);
		},
		openFileHandle(path, flags, mode, usePromises) {
			return globalFs.openFileHandle(path, flags, mode, usePromises);
		},
		
		exists(path) {
			console.log("Regular exists – how is it different from existsSync?")
			return globalFs.existsSync(path);
		},
		existsSync(path) {
			return globalFs.existsSync(path);
		},
		mkdir(path, options, recursive, kUsePromises) {
			// Properly merge options and recursive parameter
			let finalOptions = options;
			if (typeof options === 'number') {
				// If options is a number, it's the mode
				finalOptions = { mode: options, recursive: recursive };
			} else if (options && typeof options === 'object') {
				// If options is an object, merge in the recursive parameter
				finalOptions = { ...options, recursive: recursive };
			} else if (recursive !== undefined) {
				// If only recursive is provided
				finalOptions = { recursive: recursive };
			}
			
			return maybePromiseFromSync(() => globalFs.mkdirSync(path, finalOptions), kUsePromises);
		},
		close(fd, kUsePromises) {
			return maybePromiseFromSync(() => globalFs.closeSync(fd), kUsePromises);
		},
		read(fd, buffer, offset, length, position, kUsePromises) {
			return maybePromiseFromSync(() => globalFs.readSync(fd, buffer, offset, length, position), kUsePromises);
		},
	readdir(path, encoding, withFileTypes, kUsePromises) {
		// Native binding returns [names, types] tuple where types are UV_DIRENT_* constants
		// This is different from readdirSync which returns strings or Dirent objects
		return maybePromiseFromSync(() => {
			// Get the raw directory node to access children
			const { node, blockedBy, missingParent } = globalFs.walk(path);
			
			if (missingParent || !node) {
				const error = new Error(`ENOENT: no such file or directory, scandir '${path}'`);
				error.code = 'ENOENT';
				throw error;
			}
			
			if (blockedBy || node.type !== 'dir') {
				const error = new Error(`ENOTDIR: not a directory, scandir '${path}'`);
				error.code = 'ENOTDIR';
				throw error;
			}
			
			// Extract names and types from children
			const names = [];
			const types = [];
			
			// Map node types to UV_DIRENT constants
			const UV_DIRENT_FILE = 1;
			const UV_DIRENT_DIR = 2;
			const UV_DIRENT_UNKNOWN = 0;
			
			for (const [name, childNode] of node.children.entries()) {
				names.push(name);
				
				// Map the type string to UV_DIRENT constant
				let typeConstant = UV_DIRENT_UNKNOWN;
				if (childNode.type === 'file') {
					typeConstant = UV_DIRENT_FILE;
				} else if (childNode.type === 'dir') {
					typeConstant = UV_DIRENT_DIR;
				}
				
				types.push(typeConstant);
			}
			
			// Return tuple [names, types] like the native binding
			return [names, types];
		}, kUsePromises);
		},
		readFileUtf8(path, flags) {
			// readFileUtf8 is a synchronous optimized path for reading UTF-8 files
			// It takes a path (string, Buffer, or file descriptor) and flags (number)
			// Returns the file contents as a UTF-8 string
			
			// If path is a file descriptor (number), use it directly
			// Otherwise, treat it as a path string
			const isFileDescriptor = typeof path === 'number';
			
			if (isFileDescriptor) {
				// Read from file descriptor
				const stats = globalFs.fstatSync(path);
				const size = stats.size;
				
				if (size === 0) {
					// Empty file or special file (like /dev/null)
					let result = '';
					const buffer = Buffer.allocUnsafe(8192);
					let bytesRead;
					
					do {
						bytesRead = globalFs.readSync(path, buffer, 0, 8192, null);
						if (bytesRead > 0) {
							result += buffer.toString('utf8', 0, bytesRead);
						}
					} while (bytesRead > 0);
					
					return result;
				} else {
					// Regular file with known size
					const buffer = Buffer.allocUnsafe(size);
					let pos = 0;
					let bytesRead;
					
					do {
						bytesRead = globalFs.readSync(path, buffer, pos, size - pos, pos);
						pos += bytesRead;
					} while (bytesRead > 0 && pos < size);
					
					return buffer.toString('utf8', 0, pos);
				}
			} else {
				// Read from path - open, read, close
				// Note: flags parameter is used for opening the file
				// In Node.js, this is typically O_RDONLY (0) for reading
				const fd = globalFs.openSync(path, flags || 0);
				
				try {
					const stats = globalFs.fstatSync(fd);
					const size = stats.size;
					
					if (size === 0) {
						// Empty file or special file
						let result = '';
						const buffer = Buffer.allocUnsafe(8192);
						let bytesRead;
						
						do {
							bytesRead = globalFs.readSync(fd, buffer, 0, 8192, null);
							if (bytesRead > 0) {
								result += buffer.toString('utf8', 0, bytesRead);
							}
						} while (bytesRead > 0);
						
						return result;
					} else {
						// Regular file with known size
						const buffer = Buffer.allocUnsafe(size);
						let pos = 0;
						let bytesRead;
						
						do {
							bytesRead = globalFs.readSync(fd, buffer, pos, size - pos, pos);
							pos += bytesRead;
						} while (bytesRead > 0 && pos < size);
						
						return buffer.toString('utf8', 0, pos);
					}
				} finally {
					globalFs.closeSync(fd);
				}
			}
		},
		readFile(path, options, kUsePromises) {
			return maybePromiseFromSync(() => globalFs.readFileSync(path, options), kUsePromises);
		},
		writeFile(path, data, options, kUsePromises) {
			return maybePromiseFromSync(() => globalFs.writeFileSync(path, data, options), kUsePromises);
		},
		rmSync(path, maxRetries, recursive, retryDelay) {
			return globalFs.rmSync(path, maxRetries, recursive, retryDelay);
		},
		cpSyncCheckPaths(src, dest, dereference, recursive) {
			return globalFs.cpSyncCheckPaths(src, dest, dereference, recursive);
		},
		cpSync(src, dest, options) {
			return globalFs.cpSync(src, dest, options);
		},
		cpSyncCopyDir(src, dest, force, dereference, errorOnExist, verbatimSymlinks, preserveTimestamps) {
			// This is an optimization for cpSync when no filter is provided
			// We can just call our cpSync implementation with the appropriate options
			const options = {
				force,
				dereference,
				errorOnExist,
				verbatimSymlinks,
				preserveTimestamps,
				recursive: true,
				filter: null
			};
			return globalFs.cpSync(src, dest, options);
		},
		cpSyncOverrideFile(src, dest) {
			// This is used to override a file during copy
			// Just copy the file, overwriting if it exists
			return globalFs.copyFileSync(src, dest, 0);
		},
		symlink(target, path, type, kUsePromises) {
			return maybePromiseFromSync(() => globalFs.symlinkSync(target, path, type), kUsePromises);
		},
		readBuffers(fd, buffers, position, kUsePromises) {
			return maybePromiseFromSync(() => globalFs.readBuffers(fd, buffers, position), kUsePromises);
		},
		mkdtemp(prefix, encoding, kUsePromises) {
			return maybePromiseFromSync(() => globalFs.mkdtemp(prefix, encoding), kUsePromises);
		},
		ftruncate(fd, len, kUsePromises) {
			return maybePromiseFromSync(() => globalFs.ftruncateSync(fd, len), kUsePromises);
		},
		truncate(path, len, kUsePromises) {
			return maybePromiseFromSync(() => globalFs.truncateSync(path, len), kUsePromises);
		},
		rename(oldPath, newPath, kUsePromises) {
			return maybePromiseFromSync(() => globalFs.renameSync(oldPath, newPath), kUsePromises);
		},
		rm(path, options, kUsePromises) {
			return maybePromiseFromSync(() => globalFs.rmSync(path, options), kUsePromises);
		},
		rmdir(path, options, kUsePromises) {
			return maybePromiseFromSync(() => globalFs.rmdirSync(path, options), kUsePromises);
		},
	stat(path, useBigint, kUsePromises, throwIfNoEntry) {
		// Native binding returns Float64Array or BigInt64Array, not Stats object
		// throwIfNoEntry defaults to true for backwards compatibility
		return maybePromiseFromSync(() => {
			try {
				const stats = globalFs.statSync(path);
				return globalFs.statsToArray(stats, useBigint);
			} catch (err) {
				// If throwIfNoEntry is false and error is ENOENT, return undefined
				if (throwIfNoEntry === false && err.code === 'ENOENT') {
					return undefined;
				}
				throw err;
			}
		}, kUsePromises);
	},
	lstat(path, useBigint, kUsePromises, throwIfNoEntry) {
		// Native binding returns Float64Array or BigInt64Array, not Stats object
		// throwIfNoEntry defaults to true for backwards compatibility
		return maybePromiseFromSync(() => {
			try {
				const stats = globalFs.lstatSync(path);
				return globalFs.statsToArray(stats, useBigint);
			} catch (err) {
				// If throwIfNoEntry is false and error is ENOENT, return undefined
				if (throwIfNoEntry === false && err.code === 'ENOENT') {
					return undefined;
				}
				throw err;
			}
		}, kUsePromises);
	},
	fstat(fd, useBigint, kUsePromises, throwIfNoEntry) {
		// Native binding returns Float64Array or BigInt64Array, not Stats object
		// throwIfNoEntry defaults to true for backwards compatibility
		return maybePromiseFromSync(() => {
			try {
				const stats = globalFs.fstatSync(fd);
				return globalFs.statsToArray(stats, useBigint);
			} catch (err) {
				// If throwIfNoEntry is false and error is EBADF, return undefined
				if (throwIfNoEntry === false && (err.code === 'ENOENT' || err.code === 'EBADF')) {
					return undefined;
				}
				throw err;
			}
		}, kUsePromises);
	},
		fsSync(path) {
			return globalFs.fsSync(path);
		},
		unlink(path, kUsePromises) {
			return maybePromiseFromSync(() => globalFs.unlinkSync(path), kUsePromises);
		},
		symlink(existingPath, newPath, type, kUsePromises) {
			return maybePromiseFromSync(() => globalFs.symlinkSync(existingPath, newPath), kUsePromises);
		},
	writeBuffer(fd, buffer, offset, length, position, kUsePromises) {
		return globalFs.writeBuffer(fd, buffer, offset, length, position, kUsePromises);
	},
	writeString(fd, string, position, encoding, kUsePromises) {
		// Native binding for writing strings to file descriptors
		return maybePromiseFromSync(() => {
			return globalFs.writeSync(fd, string, position, encoding);
		}, kUsePromises);
	},
	writeBuffers(fd, buffers, position, kUsePromises) {
		// Native binding for writing multiple buffers (writev)
		return maybePromiseFromSync(() => {
			return globalFs.writeBuffersSync(fd, buffers, position);
		}, kUsePromises);
	},
	writeFileUtf8(path, data, flags, mode, kUsePromises) {
		return maybePromiseFromSync(() => globalFs.writeFileUtf8(path, data, flags, mode), kUsePromises);
	},
	access(path, mode, kUsePromises) {
		// Check file access permissions
		return maybePromiseFromSync(() => {
			const exists = globalFs.existsSync(path);
			if (!exists) {
				const error = new Error(`ENOENT: no such file or directory, access '${path}'`);
				error.code = 'ENOENT';
				throw error;
			}
			// In browser environment, all existing files are readable/writable
			// mode parameter is ignored for simplicity
			return undefined;
		}, kUsePromises);
	},
	copyFile(src, dest, mode, kUsePromises) {
		return maybePromiseFromSync(() => globalFs.copyFileSync(src, dest, mode), kUsePromises);
	},
	readlink(path, encoding, kUsePromises) {
		return maybePromiseFromSync(() => globalFs.readlinkSync(path, encoding), kUsePromises);
	},
	realpath(path, encoding, kUsePromises) {
		// Return the absolute path if file exists, otherwise throw ENOENT
		// Since we don't have symlinks, realpath just verifies the file exists
		// and returns its path
		return maybePromiseFromSync(() => {
			// Check if file exists
			if (!globalFs.existsSync(path)) {
				const error = new Error(`ENOENT: no such file or directory, realpath '${path}'`);
				error.code = 'ENOENT';
				throw error;
			}
			// Return the path as-is since we don't have symlinks to resolve
			// In a real filesystem, this would resolve symlinks and return canonical path
			return path;
		}, kUsePromises);
	},
	utimes(path, atime, mtime, kUsePromises) {
		return maybePromiseFromSync(() => globalFs.utimesSync(path, atime, mtime), kUsePromises);
	},
	futimes(fd, atime, mtime, kUsePromises) {
		return maybePromiseFromSync(() => globalFs.futimesSync(fd, atime, mtime), kUsePromises);
	},
	ftruncate(fd, len, kUsePromises) {
		return maybePromiseFromSync(() => globalFs.ftruncateSync(fd, len), kUsePromises);
	},
	chmod(path, mode, kUsePromises) {
		// File permissions are simplified in browser environment
		return maybePromiseFromSync(() => undefined, kUsePromises);
	},
	fchmod(fd, mode, kUsePromises) {
		// File permissions are simplified in browser environment
		return maybePromiseFromSync(() => undefined, kUsePromises);
	},
	chown(path, uid, gid, kUsePromises) {
		// File ownership is not supported in browser environment
		return maybePromiseFromSync(() => undefined, kUsePromises);
	},
	fchown(fd, uid, gid, kUsePromises) {
		// File ownership is not supported in browser environment
		return maybePromiseFromSync(() => undefined, kUsePromises);
	},
	fsync(fd, kUsePromises) {
		// Always synced in memory filesystem
		return maybePromiseFromSync(() => undefined, kUsePromises);
	},
	fdatasync(fd, kUsePromises) {
		// Always synced in memory filesystem
		return maybePromiseFromSync(() => undefined, kUsePromises);
	},
	link(existingPath, newPath, kUsePromises) {
		return maybePromiseFromSync(() => globalFs.linkSync(existingPath, newPath), kUsePromises);
	},
},
	mksnapshot: {
		setSerializeCallback() {},
		setDeserializeCallback() {},
		setDeserializeMainFunction() {},
		isBuildingSnapshotBuffer: []
	},
	"internal/errors": {
		exitCodes: {}
	},
	errors: {
		exitCodes: {}
	},
	string_decoder: {
		kIncompleteCharactersStart: 0,
		kIncompleteCharactersEnd: 4,
		kMissingBytes: 4,
		kBufferedBytes: 5,
		kEncodingField: 6,
		kNumFields: 7,
		encodings: [
			'utf-8',
			'ascii',
			'base64'
		],
		kIncompleteCharactersStart: 0,
		kIncompleteCharactersEnd: 4,
		kMissingBytes: 4,
		kBufferedBytes: 5,
		kEncodingField: 6,
		kNumFields: 7,
		kSize: 2048,
		decode: (encodingBuffer, buffer, options) => {
			// encodingBuffer is a UInt8Array with 1 at the index of the encoding
			const encoding = globalThis.internalModules.string_decoder.encodings[encodingBuffer.indexOf(1)] ?? 'utf-8';
			return buffer.toString(encoding, options);
		},
		flush: (buffer) => {
			return buffer.toString();
		}
	},
	buffer: {
		compare: (buf1, buf2) => {
			// Validate inputs are Uint8Array or Buffer
			if (!(buf1 instanceof Uint8Array) || !(buf2 instanceof Uint8Array)) {
				throw new TypeError('Arguments must be Buffer or Uint8Array');
			}

			const len = Math.min(buf1.length, buf2.length);

			// Byte-by-byte comparison
			for (let i = 0; i < len; i++) {
				if (buf1[i] !== buf2[i]) {
					return buf1[i] < buf2[i] ? -1 : 1;
				}
			}

			// If all compared bytes are equal, compare lengths
			// Normalize to -1, 0, or 1 as per Node.js behavior
			if (buf1.length === buf2.length) {
				return 0;
			}
			return buf1.length < buf2.length ? -1 : 1;
		}
	},
types: {
	isRegExp(value) {
		return Object.prototype.toString.call(value) === '[object RegExp]';
	},
	isDate(value) {
		return Object.prototype.toString.call(value) === '[object Date]';
	},
	isNativeError(value) {
		if (value === null || value === undefined) {
			return false;
		}
		// Check if it's an instance of Error or one of the native error types
		return value instanceof Error ||
			value instanceof EvalError ||
			value instanceof RangeError ||
			value instanceof ReferenceError ||
			value instanceof SyntaxError ||
			value instanceof TypeError ||
			value instanceof URIError ||
			(typeof AggregateError !== 'undefined' && value instanceof AggregateError);
	},
	isPromise(value) {
		return value instanceof Promise;
	},
	isProxy(value) {
		// JavaScript doesn't provide a way to detect proxies reliably
		// This is a limitation of the language
		return false;
	},
	isMap(value) {
		return Object.prototype.toString.call(value) === '[object Map]';
	},
	isSet(value) {
		return Object.prototype.toString.call(value) === '[object Set]';
	},
	isMapIterator(value) {
		return Object.prototype.toString.call(value) === '[object Map Iterator]';
	},
	isSetIterator(value) {
		return Object.prototype.toString.call(value) === '[object Set Iterator]';
	},
	isWeakMap(value) {
		return Object.prototype.toString.call(value) === '[object WeakMap]';
	},
	isWeakSet(value) {
		return Object.prototype.toString.call(value) === '[object WeakSet]';
	},
	isArrayBuffer(value) {
		return Object.prototype.toString.call(value) === '[object ArrayBuffer]';
	},
	isDataView(value) {
		return Object.prototype.toString.call(value) === '[object DataView]';
	},
	isSharedArrayBuffer(value) {
		return Object.prototype.toString.call(value) === '[object SharedArrayBuffer]';
	},
	isTypedArray(value) {
		return ArrayBuffer.isView(value) && !(value instanceof DataView);
	},
	isUint8Array(value) {
		return Object.prototype.toString.call(value) === '[object Uint8Array]';
	},
	isUint8ClampedArray(value) {
		return Object.prototype.toString.call(value) === '[object Uint8ClampedArray]';
	},
	isUint16Array(value) {
		return Object.prototype.toString.call(value) === '[object Uint16Array]';
	},
	isUint32Array(value) {
		return Object.prototype.toString.call(value) === '[object Uint32Array]';
	},
	isInt8Array(value) {
		return Object.prototype.toString.call(value) === '[object Int8Array]';
	},
	isInt16Array(value) {
		return Object.prototype.toString.call(value) === '[object Int16Array]';
	},
	isInt32Array(value) {
		return Object.prototype.toString.call(value) === '[object Int32Array]';
	},
	isFloat32Array(value) {
		return Object.prototype.toString.call(value) === '[object Float32Array]';
	},
	isFloat64Array(value) {
		return Object.prototype.toString.call(value) === '[object Float64Array]';
	},
	isBigInt64Array(value) {
		return Object.prototype.toString.call(value) === '[object BigInt64Array]';
	},
	isBigUint64Array(value) {
		return Object.prototype.toString.call(value) === '[object BigUint64Array]';
	},
	isGeneratorObject(value) {
		return Object.prototype.toString.call(value) === '[object Generator]';
	},
	isGeneratorFunction(value) {
		return Object.prototype.toString.call(value) === '[object GeneratorFunction]';
	},
	isAsyncFunction(value) {
		return Object.prototype.toString.call(value) === '[object AsyncFunction]';
	},
	isArrayBufferView(value) {
		return ArrayBuffer.isView(value);
	},
	isBoxedPrimitive(value) {
		return value instanceof Boolean ||
			value instanceof Number ||
			value instanceof String ||
			value instanceof Symbol ||
			value instanceof BigInt;
	},
	isAnyArrayBuffer(value) {
		const tag = Object.prototype.toString.call(value);
		return tag === '[object ArrayBuffer]' || tag === '[object SharedArrayBuffer]';
	},
	isArgumentsObject(value) {
		return Object.prototype.toString.call(value) === '[object Arguments]';
	},
	isBooleanObject(value) {
		return Object.prototype.toString.call(value) === '[object Boolean]';
	},
	isNumberObject(value) {
		return Object.prototype.toString.call(value) === '[object Number]';
	},
	isStringObject(value) {
		return Object.prototype.toString.call(value) === '[object String]';
	},
	isSymbolObject(value) {
		return Object.prototype.toString.call(value) === '[object Symbol]';
	},
	isBigIntObject(value) {
		return Object.prototype.toString.call(value) === '[object BigInt]';
	},
	isModuleNamespaceObject(value) {
		return Object.prototype.toString.call(value) === '[object Module]';
	},
},
	timers: {
		timeoutInfo: []
	},
	trace_events: {
		getCategoryEnabledBuffer(){}
	},
	credentials: {},
	performance: {
		constants: {},
		setupObservers() {} 
	},
	js_stream: {
		JSStream: class JSStream {
			constructor() {
				this.persistent = false;
			}
		}
	},
	blob: {},
	encoding_binding: {},
	process_methods: { hrtimeBuffer: {} },
	url_pattern: {},
	url: {},
	permission: {},
	fs_dir: {
		opendirSync(path) {
			return globalFs.opendirSync(path);
		},
		opendir(path, encoding, kUsePromises) {
			return maybePromiseFromSync(() => globalFs.opendirSync(path), kUsePromises);
		}
	},
	cares_wrap: {
		ChannelWrap: class ChannelWrap {
			constructor() {
				this.persistent = false;
			}
		}
	},
	stream_wrap: {},
	pipe_wrap: {},
	tls_wrap: {
		TLSWrap: class TLSWrap {
			constructor() {
				this.persistent = false;
			}
		}
	},
	http_parser: {
		HTTPParser: class HTTPParser {
			constructor() {
				this.persistent = false;
			}
		},
		methods: [],
		allMethods: [],
	},
	tcp_wrap: {
		TCP: class TCP {
			constructor() {
				this.persistent = false;
			}
		}
	},
	udp_wrap: {
		constants: {
			// @TODO: verify these
			UV_UDP_IPV6ONLY: 1,
			UV_UDP_REUSEPORT: 2
		},
		UDP: class UDP {
			constructor() {
				this.persistent = false;
			}
		}
	},
	tty_wrap: {
		isTTY() {
			return false;
		},
		Tty: class Tty {
			constructor() {
				this.persistent = false;
			}
		}
	},
	fs_event_wrap: {
		FSEvent: class FSEvent {
			constructor() {
				this.persistent = false;
			}
		}
	},
	uv: {},
	os: {
		arch() {
			return 'x64';
		},
		cpus() {
			return [
				{
					model: 'Virtual CPU',
					speed: 2400,
					times: {
						user: 252020,
						nice: 0,
						sys: 30340,
						idle: 1070356870,
						irq: 0,
					},
				},
			];
		},
		hostname() {
			return 'localhost';
		},
		machine() {
			return 'x86_64';
		},
		networkInterfaces() {
			return {
				lo: [
					{
						address: '127.0.0.1',
						netmask: '255.0.0.0',
						family: 'IPv4',
						mac: '00:00:00:00:00:00',
						internal: true,
						cidr: '127.0.0.1/8',
					},
				],
			};
		},
		platform() {
			return 'linux';
		},
		release() {
			return '5.4.0';
		},
		setPriority(pidOrPriority, priority) {
			// No-op in browser environment
		},
		tmpdir() {
			return '/tmp';
		},
		totalmem() {
			return 8589934592; // 8GB
		},
		type() {
			return 'Linux';
		},
		uptime() {
			return Math.floor(performance.now() / 1000);
		},
		version() {
			return '#1 SMP Thu Oct 6 16:21:56 UTC 2022';
		},
		getOSInformation() {
			return ['Linux', '5.4.0', '5.4.0'];
		},
		isBigEndian() {
			return false;
		},
		getAvailableParallelism() {
			return navigator.hardwareConcurrency || 10;
		},
		getFreeMem() {
			// Estimate 2GB free memory (browser environments don't expose this)
			return 2147483648;
		},
		getHostname() {
			return 'localhost';
		},
		getOSVersion() {
			return '#1 SMP Thu Oct 6 16:21:56 UTC 2022';
		},
		getOSType() {
			return 'Linux';
		},
		getOSRelease() {
			return '5.4.0';
		},
		getMachine() {
			return 'x86_64';
		},
		getHomeDirectory() {
			return '/home/user';
		},
		getTotalMem() {
			return 8589934592; // 8GB
		},
		getUptime() {
			return Math.floor(performance.now() / 1000);
		},
		homedir() {
			return '/home/user';
		},
		getPriority(pid) {
			return 0;
		},
		getInterfaceAddresses() {
			return [];
		},
		getLoadAvg() {
			return [0, 0, 0];
		},
		getOSVersion() {
			return '5.4.0';
		},
		getOSType() {
			return 'Linux';
		},
		getOSRelease() {
			return '5.4.0';
		},
		getMachine() {
			return 'x86_64';
		},
		getHomeDirectory() {
			return '/home/user';
		},
		getTotalMem() {
			return 8589934592; // 8GB
		},
		getUptime() {
			return Math.floor(performance.now() / 1000);
		},
		getUserInfo(options) {
			return {
				uid: 1000,
				gid: 1000,
				username: 'user',
				homedir: '/home/user',
				shell: '/bin/bash',
			};
		},
		setPriority(pidOrPriority, priority) {
			// No-op in browser environment
		},
	},
	zlib: {
		Zlib: class Zlib {
			constructor() {
				this.persistent = false;
			}
		}
	},
	messaging: {
		DOMException: class DOMException {
			constructor(message) {
				this.message = message;
			}
		}
	},
	async_wrap: {
		constants: {}
	},
	async_context_frame: {},
	task_queue: {
		promiseRejectEvents: {}
	},
	stream_pipe: {
		StreamPipe: class StreamPipe {
			constructor() {
				this.persistent = false;
			}
		}
	},
	symbols: {},
	http2: {
		setCallbackFunctions() {},
		constants: {
			HTTP2_HEADER_STATUS: ':status',
			HTTP2_HEADER_METHOD: ':method',
			HTTP2_HEADER_AUTHORITY: ':authority',
			HTTP2_HEADER_SCHEME: ':scheme',
			HTTP2_HEADER_PATH: ':path',
			HTTP2_HEADER_PROTOCOL: ':protocol',
			HTTP2_HEADER_DATE: 'date',
			HTTP2_HEADER_ACCEPT_CHARSET: 'accept-charset',
			HTTP2_HEADER_ACCEPT_ENCODING: 'accept-encoding',
			HTTP2_HEADER_ACCEPT_LANGUAGE: 'accept-language',
			HTTP2_HEADER_ACCEPT_RANGES: 'accept-ranges',
			HTTP2_HEADER_ACCEPT: 'accept',
			HTTP2_HEADER_ACCESS_CONTROL_ALLOW_CREDENTIALS: 'access-control-allow-credentials',
			HTTP2_HEADER_ACCESS_CONTROL_ALLOW_HEADERS: 'access-control-allow-headers',
			HTTP2_HEADER_ACCESS_CONTROL_ALLOW_METHODS: 'access-control-allow-methods',
			HTTP2_HEADER_ACCESS_CONTROL_ALLOW_ORIGIN: 'access-control-allow-origin',
			HTTP2_HEADER_ACCESS_CONTROL_EXPOSE_HEADERS: 'access-control-expose-headers',
			HTTP2_HEADER_ACCESS_CONTROL_MAX_AGE: 'access-control-max-age',
			HTTP2_HEADER_ACCESS_CONTROL_REQUEST_HEADERS: 'access-control-request-headers',
			HTTP2_HEADER_ACCESS_CONTROL_REQUEST_METHOD: 'access-control-request-method',
			HTTP2_HEADER_AGE: 'age',
			HTTP2_HEADER_ALLOW: 'allow',
			HTTP2_HEADER_AUTHORIZATION: 'authorization',
			HTTP2_HEADER_CACHE_CONTROL: 'cache-control',
			HTTP2_HEADER_CONTENT_DISPOSITION: 'content-disposition',
			HTTP2_HEADER_CONTENT_ENCODING: 'content-encoding',
			HTTP2_HEADER_CONTENT_LANGUAGE: 'content-language',
			HTTP2_HEADER_CONTENT_LENGTH: 'content-length',
			HTTP2_HEADER_CONTENT_LOCATION: 'content-location',
			HTTP2_HEADER_CONTENT_RANGE: 'content-range',
			HTTP2_HEADER_CONTENT_TYPE: 'content-type',
			HTTP2_HEADER_COOKIE: 'cookie',
			HTTP2_HEADER_CONNECTION: 'connection',
			HTTP2_HEADER_DNT: 'dnt',
			HTTP2_HEADER_ETAG: 'etag',
			HTTP2_HEADER_EXPECT: 'expect',
			HTTP2_HEADER_EXPIRES: 'expires',
			HTTP2_HEADER_FORWARDED: 'forwarded',
			HTTP2_HEADER_FROM: 'from',
			HTTP2_HEADER_HOST: 'host',
			HTTP2_HEADER_IF_MATCH: 'if-match',
			HTTP2_HEADER_IF_MODIFIED_SINCE: 'if-modified-since',
			HTTP2_HEADER_IF_NONE_MATCH: 'if-none-match',
			HTTP2_HEADER_IF_RANGE: 'if-range',
			HTTP2_HEADER_IF_UNMODIFIED_SINCE: 'if-unmodified-since',
			HTTP2_HEADER_LAST_MODIFIED: 'last-modified',
			HTTP2_HEADER_LINK: 'link',
			HTTP2_HEADER_LOCATION: 'location',
			HTTP2_HEADER_MAX_FORWARDS: 'max-forwards',
			HTTP2_HEADER_PREFER: 'prefer',
			HTTP2_HEADER_PROXY_AUTHENTICATE: 'proxy-authenticate',
			HTTP2_HEADER_PROXY_AUTHORIZATION: 'proxy-authorization',
			HTTP2_HEADER_PROXY_CONNECTION: 'proxy-connection',
			HTTP2_HEADER_RANGE: 'range',
			HTTP2_HEADER_REFERER: 'referer',
			HTTP2_HEADER_REFRESH: 'refresh',
			HTTP2_HEADER_RETRY_AFTER: 'retry-after',
			HTTP2_HEADER_SERVER: 'server',
			HTTP2_HEADER_SET_COOKIE: 'set-cookie',
			HTTP2_HEADER_STRICT_TRANSPORT_SECURITY: 'strict-transport-security',
			HTTP2_HEADER_TRAILER: 'trailer',
			HTTP2_HEADER_TRANSFER_ENCODING: 'transfer-encoding',
			HTTP2_HEADER_TK: 'tk',
			HTTP2_HEADER_UPGRADE_INSECURE_REQUESTS: 'upgrade-insecure-requests',
			HTTP2_HEADER_USER_AGENT: 'user-agent',
			HTTP2_HEADER_VARY: 'vary',
			HTTP2_HEADER_VIA: 'via',
			HTTP2_HEADER_WARNING: 'warning',
			HTTP2_HEADER_WWW_AUTHENTICATE: 'www-authenticate',
			HTTP2_HEADER_X_CONTENT_TYPE_OPTIONS: 'x-content-type-options',
			HTTP2_HEADER_X_FRAME_OPTIONS: 'x-frame-options',
			HTTP2_HEADER_KEEP_ALIVE: 'keep-alive',
			HTTP2_HEADER_CONTENT_MD5: 'content-md5',
			HTTP2_HEADER_TE: 'te',
			HTTP2_HEADER_UPGRADE: 'upgrade',
			HTTP2_HEADER_HTTP2_SETTINGS: 'http2-settings',
			HTTP2_HEADER_X_XSS_PROTECTION: 'x-xss-protection',
			HTTP2_HEADER_ALT_SVC: 'alt-svc',
			HTTP2_HEADER_CONTENT_SECURITY_POLICY: 'content-security-policy',
			HTTP2_HEADER_EARLY_DATA: 'early-data',
			HTTP2_HEADER_EXPECT_CT: 'expect-ct',
			HTTP2_HEADER_ORIGIN: 'origin',
			HTTP2_HEADER_PURPOSE: 'purpose',
			HTTP2_HEADER_TIMING_ALLOW_ORIGIN: 'timing-allow-origin',
			HTTP2_HEADER_X_FORWARDED_FOR: 'x-forwarded-for',
			HTTP2_HEADER_PRIORITY: 'priority',
		}
	},
	constants: {
		os: {
			UV_UDP_REUSEADDR: 4,
			dlopen: {
			RTLD_LAZY: 1,
			RTLD_NOW: 2,
			RTLD_GLOBAL: 8,
			RTLD_LOCAL: 4,
			},
			errno: {
			E2BIG: 7,
			EACCES: 13,
			EADDRINUSE: 48,
			EADDRNOTAVAIL: 49,
			EAFNOSUPPORT: 47,
			EAGAIN: 35,
			EALREADY: 37,
			EBADF: 9,
			EBADMSG: 94,
			EBUSY: 16,
			ECANCELED: 89,
			ECHILD: 10,
			ECONNABORTED: 53,
			ECONNREFUSED: 61,
			ECONNRESET: 54,
			EDEADLK: 11,
			EDESTADDRREQ: 39,
			EDOM: 33,
			EDQUOT: 69,
			EEXIST: 17,
			EFAULT: 14,
			EFBIG: 27,
			EHOSTUNREACH: 65,
			EIDRM: 90,
			EILSEQ: 92,
			EINPROGRESS: 36,
			EINTR: 4,
			EINVAL: 22,
			EIO: 5,
			EISCONN: 56,
			EISDIR: 21,
			ELOOP: 62,
			EMFILE: 24,
			EMLINK: 31,
			EMSGSIZE: 40,
			EMULTIHOP: 95,
			ENAMETOOLONG: 63,
			ENETDOWN: 50,
			ENETRESET: 52,
			ENETUNREACH: 51,
			ENFILE: 23,
			ENOBUFS: 55,
			ENODATA: 96,
			ENODEV: 19,
			ENOENT: 2,
			ENOEXEC: 8,
			ENOLCK: 77,
			ENOLINK: 97,
			ENOMEM: 12,
			ENOMSG: 91,
			ENOPROTOOPT: 42,
			ENOSPC: 28,
			ENOSR: 98,
			ENOSTR: 99,
			ENOSYS: 78,
			ENOTCONN: 57,
			ENOTDIR: 20,
			ENOTEMPTY: 66,
			ENOTSOCK: 38,
			ENOTSUP: 45,
			ENOTTY: 25,
			ENXIO: 6,
			EOPNOTSUPP: 102,
			EOVERFLOW: 84,
			EPERM: 1,
			EPIPE: 32,
			EPROTO: 100,
			EPROTONOSUPPORT: 43,
			EPROTOTYPE: 41,
			ERANGE: 34,
			EROFS: 30,
			ESPIPE: 29,
			ESRCH: 3,
			ESTALE: 70,
			ETIME: 101,
			ETIMEDOUT: 60,
			ETXTBSY: 26,
			EWOULDBLOCK: 35,
			EXDEV: 18,
			},
			signals: {
			SIGHUP: 1,
			SIGINT: 2,
			SIGQUIT: 3,
			SIGILL: 4,
			SIGTRAP: 5,
			SIGABRT: 6,
			SIGIOT: 6,
			SIGBUS: 10,
			SIGFPE: 8,
			SIGKILL: 9,
			SIGUSR1: 30,
			SIGSEGV: 11,
			SIGUSR2: 31,
			SIGPIPE: 13,
			SIGALRM: 14,
			SIGTERM: 15,
			SIGCHLD: 20,
			SIGCONT: 19,
			SIGSTOP: 17,
			SIGTSTP: 18,
			SIGTTIN: 21,
			SIGTTOU: 22,
			SIGURG: 16,
			SIGXCPU: 24,
			SIGXFSZ: 25,
			SIGVTALRM: 26,
			SIGPROF: 27,
			SIGWINCH: 28,
			SIGIO: 23,
			SIGINFO: 29,
			SIGSYS: 12,
			},
			priority: {
			PRIORITY_LOW: 19,
			PRIORITY_BELOW_NORMAL: 10,
			PRIORITY_NORMAL: 0,
			PRIORITY_ABOVE_NORMAL: -7,
			PRIORITY_HIGH: -14,
			PRIORITY_HIGHEST: -20,
			},
		},
		sqlite: {
			SQLITE_CHANGESET_OMIT: 0,
			SQLITE_CHANGESET_REPLACE: 1,
			SQLITE_CHANGESET_ABORT: 2,
		},
		http: {
			HPE_OK: 0,
			HPE_INTERNAL: 1,
			HPE_STRICT: 2,
			HPE_CR_EXPECTED: 25,
			HPE_LF_EXPECTED: 3,
			HPE_UNEXPECTED_CONTENT_LENGTH: 4,
			HPE_UNEXPECTED_SPACE: 30,
			HPE_CLOSED_CONNECTION: 5,
			HPE_INVALID_METHOD: 6,
			HPE_INVALID_URL: 7,
			HPE_INVALID_CONSTANT: 8,
			HPE_INVALID_VERSION: 9,
			HPE_INVALID_HEADER_TOKEN: 10,
			HPE_INVALID_CONTENT_LENGTH: 11,
			HPE_INVALID_CHUNK_SIZE: 12,
			HPE_INVALID_STATUS: 13,
			HPE_INVALID_EOF_STATE: 14,
			HPE_INVALID_TRANSFER_ENCODING: 15,
			HPE_CB_MESSAGE_BEGIN: 16,
			HPE_CB_HEADERS_COMPLETE: 17,
			HPE_CB_MESSAGE_COMPLETE: 18,
			HPE_CB_CHUNK_HEADER: 19,
			HPE_CB_CHUNK_COMPLETE: 20,
			HPE_PAUSED: 21,
			HPE_PAUSED_UPGRADE: 22,
			HPE_PAUSED_H2_UPGRADE: 23,
			HPE_USER: 24,
			HPE_CB_URL_COMPLETE: 26,
			HPE_CB_STATUS_COMPLETE: 27,
			HPE_CB_METHOD_COMPLETE: 32,
			HPE_CB_VERSION_COMPLETE: 33,
			HPE_CB_HEADER_FIELD_COMPLETE: 28,
			HPE_CB_HEADER_VALUE_COMPLETE: 29,
			HPE_CB_CHUNK_EXTENSION_NAME_COMPLETE: 34,
			HPE_CB_CHUNK_EXTENSION_VALUE_COMPLETE: 35,
			HPE_CB_RESET: 31,
			HPE_CB_PROTOCOL_COMPLETE: 38,
			F_CONNECTION_KEEP_ALIVE: 0x1,
			F_CONNECTION_CLOSE: 0x2,
			F_CONNECTION_UPGRADE: 0x4,
			F_CHUNKED: 0x8,
			F_UPGRADE: 0x10,
			F_CONTENT_LENGTH: 0x20,
			F_SKIPBODY: 0x40,
			F_TRAILING: 0x80,
			F_TRANSFER_ENCODING: 0x200,
			LENIENT_HEADERS: 0x1,
			LENIENT_CHUNKED_LENGTH: 0x2,
			LENIENT_KEEP_ALIVE: 0x4,
			LENIENT_TRANSFER_ENCODING: 0x8,
			LENIENT_VERSION: 0x10,
			LENIENT_DATA_AFTER_CLOSE: 0x20,
			LENIENT_OPTIONAL_LF_AFTER_CR: 0x40,
			LENIENT_OPTIONAL_CRLF_AFTER_CHUNK: 0x80,
			LENIENT_OPTIONAL_CR_BEFORE_LF: 0x100,
			LENIENT_SPACES_AFTER_CHUNK_SIZE: 0x200,
			HTTP_BOTH: 0,
			HTTP_REQUEST: 1,
			HTTP_RESPONSE: 2,
			HTTP_FINISH_SAFE: 0,
			HTTP_FINISH_SAFE_WITH_CB: 1,
			HTTP_FINISH_UNSAFE: 2,
			HTTP_DELETE: 0,
			HTTP_GET: 1,
			HTTP_HEAD: 2,
			HTTP_POST: 3,
			HTTP_PUT: 4,
			HTTP_CONNECT: 5,
			HTTP_OPTIONS: 6,
			HTTP_TRACE: 7,
			HTTP_COPY: 8,
			HTTP_LOCK: 9,
			HTTP_MKCOL: 10,
			HTTP_MOVE: 11,
			HTTP_PROPFIND: 12,
			HTTP_PROPPATCH: 13,
			HTTP_SEARCH: 14,
			HTTP_UNLOCK: 15,
			HTTP_BIND: 16,
			HTTP_REBIND: 17,
			HTTP_UNBIND: 18,
			HTTP_ACL: 19,
			HTTP_REPORT: 20,
			HTTP_MKACTIVITY: 21,
			HTTP_CHECKOUT: 22,
			HTTP_MERGE: 23,
			HTTP_MSEARCH: 24,
			HTTP_NOTIFY: 25,
			HTTP_SUBSCRIBE: 26,
			HTTP_UNSUBSCRIBE: 27,
			HTTP_PATCH: 28,
			HTTP_PURGE: 29,
			HTTP_MKCALENDAR: 30,
			HTTP_LINK: 31,
			HTTP_UNLINK: 32,
			HTTP_SOURCE: 33,
			HTTP_PRI: 34,
			HTTP_DESCRIBE: 35,
			HTTP_ANNOUNCE: 36,
			HTTP_SETUP: 37,
			HTTP_PLAY: 38,
			HTTP_PAUSE: 39,
			HTTP_TEARDOWN: 40,
			HTTP_GET_PARAMETER: 41,
			HTTP_SET_PARAMETER: 42,
			HTTP_REDIRECT: 43,
			HTTP_RECORD: 44,
			HTTP_FLUSH: 45,
			HTTP_QUERY: 46,
			HTTP_STATUS_CONTINUE: 100,
			HTTP_STATUS_SWITCHING_PROTOCOLS: 101,
			HTTP_STATUS_PROCESSING: 102,
			HTTP_STATUS_EARLY_HINTS: 103,
			HTTP_STATUS_RESPONSE_IS_STALE: 110,
			HTTP_STATUS_REVALIDATION_FAILED: 111,
			HTTP_STATUS_DISCONNECTED_OPERATION: 112,
			HTTP_STATUS_HEURISTIC_EXPIRATION: 113,
			HTTP_STATUS_MISCELLANEOUS_WARNING: 199,
			HTTP_STATUS_OK: 200,
			HTTP_STATUS_CREATED: 201,
			HTTP_STATUS_ACCEPTED: 202,
			HTTP_STATUS_NON_AUTHORITATIVE_INFORMATION: 203,
			HTTP_STATUS_NO_CONTENT: 204,
			HTTP_STATUS_RESET_CONTENT: 205,
			HTTP_STATUS_PARTIAL_CONTENT: 206,
			HTTP_STATUS_MULTI_STATUS: 207,
			HTTP_STATUS_ALREADY_REPORTED: 208,
			HTTP_STATUS_TRANSFORMATION_APPLIED: 214,
			HTTP_STATUS_IM_USED: 226,
			HTTP_STATUS_MISCELLANEOUS_PERSISTENT_WARNING: 299,
			HTTP_STATUS_MULTIPLE_CHOICES: 300,
			HTTP_STATUS_MOVED_PERMANENTLY: 301,
			HTTP_STATUS_FOUND: 302,
			HTTP_STATUS_SEE_OTHER: 303,
			HTTP_STATUS_NOT_MODIFIED: 304,
			HTTP_STATUS_USE_PROXY: 305,
			HTTP_STATUS_SWITCH_PROXY: 306,
			HTTP_STATUS_TEMPORARY_REDIRECT: 307,
			HTTP_STATUS_PERMANENT_REDIRECT: 308,
			HTTP_STATUS_BAD_REQUEST: 400,
			HTTP_STATUS_UNAUTHORIZED: 401,
			HTTP_STATUS_PAYMENT_REQUIRED: 402,
			HTTP_STATUS_FORBIDDEN: 403,
			HTTP_STATUS_NOT_FOUND: 404,
			HTTP_STATUS_METHOD_NOT_ALLOWED: 405,
			HTTP_STATUS_NOT_ACCEPTABLE: 406,
			HTTP_STATUS_PROXY_AUTHENTICATION_REQUIRED: 407,
			HTTP_STATUS_REQUEST_TIMEOUT: 408,
			HTTP_STATUS_CONFLICT: 409,
			HTTP_STATUS_GONE: 410,
			HTTP_STATUS_LENGTH_REQUIRED: 411,
			HTTP_STATUS_PRECONDITION_FAILED: 412,
			HTTP_STATUS_PAYLOAD_TOO_LARGE: 413,
			HTTP_STATUS_URI_TOO_LONG: 414,
			HTTP_STATUS_UNSUPPORTED_MEDIA_TYPE: 415,
			HTTP_STATUS_RANGE_NOT_SATISFIABLE: 416,
			HTTP_STATUS_EXPECTATION_FAILED: 417,
			HTTP_STATUS_IM_A_TEAPOT: 418,
			HTTP_STATUS_PAGE_EXPIRED: 419,
			HTTP_STATUS_ENHANCE_YOUR_CALM: 420,
			HTTP_STATUS_MISDIRECTED_REQUEST: 421,
			HTTP_STATUS_UNPROCESSABLE_ENTITY: 422,
			HTTP_STATUS_LOCKED: 423,
			HTTP_STATUS_FAILED_DEPENDENCY: 424,
			HTTP_STATUS_TOO_EARLY: 425,
			HTTP_STATUS_UPGRADE_REQUIRED: 426,
			HTTP_STATUS_PRECONDITION_REQUIRED: 428,
			HTTP_STATUS_TOO_MANY_REQUESTS: 429,
			HTTP_STATUS_REQUEST_HEADER_FIELDS_TOO_LARGE_UNOFFICIAL: 430,
			HTTP_STATUS_REQUEST_HEADER_FIELDS_TOO_LARGE: 431,
			HTTP_STATUS_LOGIN_TIMEOUT: 440,
			HTTP_STATUS_NO_RESPONSE: 444,
			HTTP_STATUS_RETRY_WITH: 449,
			HTTP_STATUS_BLOCKED_BY_PARENTAL_CONTROL: 450,
			HTTP_STATUS_UNAVAILABLE_FOR_LEGAL_REASONS: 451,
			HTTP_STATUS_CLIENT_CLOSED_LOAD_BALANCED_REQUEST: 460,
			HTTP_STATUS_INVALID_X_FORWARDED_FOR: 463,
			HTTP_STATUS_REQUEST_HEADER_TOO_LARGE: 494,
			HTTP_STATUS_SSL_CERTIFICATE_ERROR: 495,
			HTTP_STATUS_SSL_CERTIFICATE_REQUIRED: 496,
			HTTP_STATUS_HTTP_REQUEST_SENT_TO_HTTPS_PORT: 497,
			HTTP_STATUS_INVALID_TOKEN: 498,
			HTTP_STATUS_CLIENT_CLOSED_REQUEST: 499,
			HTTP_STATUS_INTERNAL_SERVER_ERROR: 500,
			HTTP_STATUS_NOT_IMPLEMENTED: 501,
			HTTP_STATUS_BAD_GATEWAY: 502,
			HTTP_STATUS_SERVICE_UNAVAILABLE: 503,
			HTTP_STATUS_GATEWAY_TIMEOUT: 504,
			HTTP_STATUS_HTTP_VERSION_NOT_SUPPORTED: 505,
			HTTP_STATUS_VARIANT_ALSO_NEGOTIATES: 506,
			HTTP_STATUS_INSUFFICIENT_STORAGE: 507,
			HTTP_STATUS_LOOP_DETECTED: 508,
			HTTP_STATUS_BANDWIDTH_LIMIT_EXCEEDED: 509,
			HTTP_STATUS_NOT_EXTENDED: 510,
			HTTP_STATUS_NETWORK_AUTHENTICATION_REQUIRED: 511,
			HTTP_STATUS_WEB_SERVER_UNKNOWN_ERROR: 520,
			HTTP_STATUS_WEB_SERVER_IS_DOWN: 521,
			HTTP_STATUS_CONNECTION_TIMEOUT: 522,
			HTTP_STATUS_ORIGIN_IS_UNREACHABLE: 523,
			HTTP_STATUS_TIMEOUT_OCCURED: 524,
			HTTP_STATUS_SSL_HANDSHAKE_FAILED: 525,
			HTTP_STATUS_INVALID_SSL_CERTIFICATE: 526,
			HTTP_STATUS_RAILGUN_ERROR: 527,
			HTTP_STATUS_SITE_IS_OVERLOADED: 529,
			HTTP_STATUS_SITE_IS_FROZEN: 530,
			HTTP_STATUS_IDENTITY_PROVIDER_AUTHENTICATION_ERROR: 561,
			HTTP_STATUS_NETWORK_READ_TIMEOUT: 598,
			HTTP_STATUS_NETWORK_CONNECT_TIMEOUT: 599
		},
		fs: {
			UV_FS_SYMLINK_DIR: 1,
			UV_FS_SYMLINK_JUNCTION: 2,
			O_RDONLY: 0,
			O_WRONLY: 1,
			O_RDWR: 2,
			UV_DIRENT_UNKNOWN: 0,
			UV_DIRENT_FILE: 1,
			UV_DIRENT_DIR: 2,
			UV_DIRENT_LINK: 3,
			UV_DIRENT_FIFO: 4,
			UV_DIRENT_SOCKET: 5,
			UV_DIRENT_CHAR: 6,
			UV_DIRENT_BLOCK: 7,
			S_IFMT: 61440,
			S_IFREG: 32768,
			S_IFDIR: 16384,
			S_IFCHR: 8192,
			S_IFBLK: 24576,
			S_IFIFO: 4096,
			S_IFLNK: 40960,
			S_IFSOCK: 49152,
			O_CREAT: 512,
			O_EXCL: 2048,
			UV_FS_O_FILEMAP: 0,
			O_NOCTTY: 131072,
			O_TRUNC: 1024,
			O_APPEND: 8,
			O_DIRECTORY: 1048576,
			O_NOFOLLOW: 256,
			O_SYNC: 128,
			O_DSYNC: 4194304,
			O_SYMLINK: 2097152,
			O_NONBLOCK: 4,
			S_IRWXU: 448,
			S_IRUSR: 256,
			S_IWUSR: 128,
			S_IXUSR: 64,
			S_IRWXG: 56,
			S_IRGRP: 32,
			S_IWGRP: 16,
			S_IXGRP: 8,
			S_IRWXO: 7,
			S_IROTH: 4,
			S_IWOTH: 2,
			S_IXOTH: 1,
			F_OK: 0,
			R_OK: 4,
			W_OK: 2,
			X_OK: 1,
			UV_FS_COPYFILE_EXCL: 1,
			COPYFILE_EXCL: 1,
			UV_FS_COPYFILE_FICLONE: 2,
			COPYFILE_FICLONE: 2,
			UV_FS_COPYFILE_FICLONE_FORCE: 4,
			COPYFILE_FICLONE_FORCE: 4,
		},
		crypto: {
			OPENSSL_VERSION_NUMBER: 269488319,
			SSL_OP_ALL: 2147485780,
			SSL_OP_ALLOW_NO_DHE_KEX: 1024,
			SSL_OP_ALLOW_UNSAFE_LEGACY_RENEGOTIATION: 262144,
			SSL_OP_CIPHER_SERVER_PREFERENCE: 4194304,
			SSL_OP_CISCO_ANYCONNECT: 32768,
			SSL_OP_COOKIE_EXCHANGE: 8192,
			SSL_OP_CRYPTOPRO_TLSEXT_BUG: 2147483648,
			SSL_OP_DONT_INSERT_EMPTY_FRAGMENTS: 2048,
			SSL_OP_LEGACY_SERVER_CONNECT: 4,
			SSL_OP_NO_COMPRESSION: 131072,
			SSL_OP_NO_ENCRYPT_THEN_MAC: 524288,
			SSL_OP_NO_QUERY_MTU: 4096,
			SSL_OP_NO_RENEGOTIATION: 1073741824,
			SSL_OP_NO_SESSION_RESUMPTION_ON_RENEGOTIATION: 65536,
			SSL_OP_NO_SSLv2: 0,
			SSL_OP_NO_SSLv3: 33554432,
			SSL_OP_NO_TICKET: 16384,
			SSL_OP_NO_TLSv1: 67108864,
			SSL_OP_NO_TLSv1_1: 268435456,
			SSL_OP_NO_TLSv1_2: 134217728,
			SSL_OP_NO_TLSv1_3: 536870912,
			SSL_OP_PRIORITIZE_CHACHA: 2097152,
			SSL_OP_TLS_ROLLBACK_BUG: 8388608,
			ENGINE_METHOD_RSA: 1,
			ENGINE_METHOD_DSA: 2,
			ENGINE_METHOD_DH: 4,
			ENGINE_METHOD_RAND: 8,
			ENGINE_METHOD_EC: 2048,
			ENGINE_METHOD_CIPHERS: 64,
			ENGINE_METHOD_DIGESTS: 128,
			ENGINE_METHOD_PKEY_METHS: 512,
			ENGINE_METHOD_PKEY_ASN1_METHS: 1024,
			ENGINE_METHOD_ALL: 65535,
			ENGINE_METHOD_NONE: 0,
			DH_CHECK_P_NOT_SAFE_PRIME: 2,
			DH_CHECK_P_NOT_PRIME: 1,
			DH_UNABLE_TO_CHECK_GENERATOR: 4,
			DH_NOT_SUITABLE_GENERATOR: 8,
			RSA_PKCS1_PADDING: 1,
			RSA_SSLV23_PADDING: 2,
			RSA_NO_PADDING: 3,
			RSA_PKCS1_OAEP_PADDING: 4,
			RSA_X931_PADDING: 5,
			RSA_PKCS1_PSS_PADDING: 6,
			RSA_PSS_SALTLEN_DIGEST: -1,
			RSA_PSS_SALTLEN_MAX_SIGN: -2,
			RSA_PSS_SALTLEN_AUTO: -2,
			defaultCoreCipherList: 'TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256:TLS_AES_128_GCM_SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-AES256-GCM-SHA384:DHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-SHA256:DHE-RSA-AES128-SHA256:ECDHE-RSA-AES256-SHA384:DHE-RSA-AES256-SHA384:ECDHE-RSA-AES256-SHA256:DHE-RSA-AES256-SHA256:HIGH:!aNULL:!eNULL:!EXPORT:!DES:!RC4:!MD5:!PSK:!SRP:!CAMELLIA',
			TLS1_VERSION: 769,
			TLS1_1_VERSION: 770,
			TLS1_2_VERSION: 771,
			TLS1_3_VERSION: 772,
			POINT_CONVERSION_COMPRESSED: 2,
			POINT_CONVERSION_UNCOMPRESSED: 4,
			POINT_CONVERSION_HYBRID: 6,
		},
		zlib: {
			Z_NO_FLUSH: 0,
			Z_PARTIAL_FLUSH: 1,
			Z_SYNC_FLUSH: 2,
			Z_FULL_FLUSH: 3,
			Z_FINISH: 4,
			Z_BLOCK: 5,
			Z_OK: 0,
			Z_STREAM_END: 1,
			Z_NEED_DICT: 2,
			Z_ERRNO: -1,
			Z_STREAM_ERROR: -2,
			Z_DATA_ERROR: -3,
			Z_MEM_ERROR: -4,
			Z_BUF_ERROR: -5,
			Z_VERSION_ERROR: -6,
			Z_NO_COMPRESSION: 0,
			Z_BEST_SPEED: 1,
			Z_BEST_COMPRESSION: 9,
			Z_DEFAULT_COMPRESSION: -1,
			Z_FILTERED: 1,
			Z_HUFFMAN_ONLY: 2,
			Z_RLE: 3,
			Z_FIXED: 4,
			Z_DEFAULT_STRATEGY: 0,
			ZLIB_VERNUM: 4784,
			DEFLATE: 1,
			INFLATE: 2,
			GZIP: 3,
			GUNZIP: 4,
			DEFLATERAW: 5,
			INFLATERAW: 6,
			UNZIP: 7,
			BROTLI_DECODE: 8,
			BROTLI_ENCODE: 9,
			ZSTD_COMPRESS: 10,
			ZSTD_DECOMPRESS: 11,
			ZSTD_e_continue: 0,
			ZSTD_e_flush: 1,
			ZSTD_e_end: 2,
			Z_MIN_WINDOWBITS: 8,
			Z_MAX_WINDOWBITS: 15,
			Z_DEFAULT_WINDOWBITS: 15,
			Z_MIN_CHUNK: 64,
			Z_MAX_CHUNK: 2147483647,
			Z_DEFAULT_CHUNK: 16384,
			Z_MIN_MEMLEVEL: 1,
			Z_MAX_MEMLEVEL: 9,
			Z_DEFAULT_MEMLEVEL: 8,
			Z_MIN_LEVEL: -1,
			Z_MAX_LEVEL: 9,
			Z_DEFAULT_LEVEL: -1,
			BROTLI_OPERATION_PROCESS: 0,
			BROTLI_OPERATION_FLUSH: 1,
			BROTLI_OPERATION_FINISH: 2,
			BROTLI_OPERATION_EMIT_METADATA: 3,
			BROTLI_PARAM_MODE: 0,
			BROTLI_MODE_GENERIC: 0,
			BROTLI_MODE_TEXT: 1,
			BROTLI_MODE_FONT: 2,
			BROTLI_DEFAULT_MODE: 0,
			BROTLI_PARAM_QUALITY: 1,
			BROTLI_MIN_QUALITY: 0,
			BROTLI_MAX_QUALITY: 11,
			BROTLI_DEFAULT_QUALITY: 11,
			BROTLI_PARAM_LGWIN: 2,
			BROTLI_MIN_WINDOW_BITS: 10,
			BROTLI_MAX_WINDOW_BITS: 24,
			BROTLI_LARGE_MAX_WINDOW_BITS: 30,
			BROTLI_DEFAULT_WINDOW: 22,
			BROTLI_PARAM_LGBLOCK: 3,
			BROTLI_MIN_INPUT_BLOCK_BITS: 16,
			BROTLI_MAX_INPUT_BLOCK_BITS: 24,
			BROTLI_PARAM_DISABLE_LITERAL_CONTEXT_MODELING: 4,
			BROTLI_PARAM_SIZE_HINT: 5,
			BROTLI_PARAM_LARGE_WINDOW: 6,
			BROTLI_PARAM_NPOSTFIX: 7,
			BROTLI_PARAM_NDIRECT: 8,
			BROTLI_DECODER_RESULT_ERROR: 0,
			BROTLI_DECODER_RESULT_SUCCESS: 1,
			BROTLI_DECODER_RESULT_NEEDS_MORE_INPUT: 2,
			BROTLI_DECODER_RESULT_NEEDS_MORE_OUTPUT: 3,
			BROTLI_DECODER_PARAM_DISABLE_RING_BUFFER_REALLOCATION: 0,
			BROTLI_DECODER_PARAM_LARGE_WINDOW: 1,
			BROTLI_DECODER_NO_ERROR: 0,
			BROTLI_DECODER_SUCCESS: 1,
			BROTLI_DECODER_NEEDS_MORE_INPUT: 2,
			BROTLI_DECODER_NEEDS_MORE_OUTPUT: 3,
			BROTLI_DECODER_ERROR_FORMAT_EXUBERANT_NIBBLE: -1,
			BROTLI_DECODER_ERROR_FORMAT_RESERVED: -2,
			BROTLI_DECODER_ERROR_FORMAT_EXUBERANT_META_NIBBLE: -3,
			BROTLI_DECODER_ERROR_FORMAT_SIMPLE_HUFFMAN_ALPHABET: -4,
			BROTLI_DECODER_ERROR_FORMAT_SIMPLE_HUFFMAN_SAME: -5,
			BROTLI_DECODER_ERROR_FORMAT_CL_SPACE: -6,
			BROTLI_DECODER_ERROR_FORMAT_HUFFMAN_SPACE: -7,
			BROTLI_DECODER_ERROR_FORMAT_CONTEXT_MAP_REPEAT: -8,
			BROTLI_DECODER_ERROR_FORMAT_BLOCK_LENGTH_1: -9,
			BROTLI_DECODER_ERROR_FORMAT_BLOCK_LENGTH_2: -10,
			BROTLI_DECODER_ERROR_FORMAT_TRANSFORM: -11,
			BROTLI_DECODER_ERROR_FORMAT_DICTIONARY: -12,
			BROTLI_DECODER_ERROR_FORMAT_WINDOW_BITS: -13,
			BROTLI_DECODER_ERROR_FORMAT_PADDING_1: -14,
			BROTLI_DECODER_ERROR_FORMAT_PADDING_2: -15,
			BROTLI_DECODER_ERROR_FORMAT_DISTANCE: -16,
			BROTLI_DECODER_ERROR_DICTIONARY_NOT_SET: -19,
			BROTLI_DECODER_ERROR_INVALID_ARGUMENTS: -20,
			BROTLI_DECODER_ERROR_ALLOC_CONTEXT_MODES: -21,
			BROTLI_DECODER_ERROR_ALLOC_TREE_GROUPS: -22,
			BROTLI_DECODER_ERROR_ALLOC_CONTEXT_MAP: -25,
			BROTLI_DECODER_ERROR_ALLOC_RING_BUFFER_1: -26,
			BROTLI_DECODER_ERROR_ALLOC_RING_BUFFER_2: -27,
			BROTLI_DECODER_ERROR_ALLOC_BLOCK_TYPE_TREES: -30,
			BROTLI_DECODER_ERROR_UNREACHABLE: -31,
		},
		trace: {
			TRACE_EVENT_PHASE_BEGIN: 66,
			TRACE_EVENT_PHASE_END: 69,
			TRACE_EVENT_PHASE_COMPLETE: 88,
			TRACE_EVENT_PHASE_INSTANT: 73,
			TRACE_EVENT_PHASE_ASYNC_BEGIN: 83,
			TRACE_EVENT_PHASE_ASYNC_STEP_INTO: 84,
			TRACE_EVENT_PHASE_ASYNC_STEP_PAST: 112,
			TRACE_EVENT_PHASE_ASYNC_END: 70,
			TRACE_EVENT_PHASE_NESTABLE_ASYNC_BEGIN: 98,
			TRACE_EVENT_PHASE_NESTABLE_ASYNC_END: 101,
			TRACE_EVENT_PHASE_NESTABLE_ASYNC_INSTANT: 110,
			TRACE_EVENT_PHASE_FLOW_BEGIN: 115,
			TRACE_EVENT_PHASE_FLOW_STEP: 116,
			TRACE_EVENT_PHASE_FLOW_END: 102,
			TRACE_EVENT_PHASE_METADATA: 77,
			TRACE_EVENT_PHASE_COUNTER: 67,
			TRACE_EVENT_PHASE_SAMPLE: 80,
			TRACE_EVENT_PHASE_CREATE_OBJECT: 78,
			TRACE_EVENT_PHASE_SNAPSHOT_OBJECT: 79,
			TRACE_EVENT_PHASE_DELETE_OBJECT: 68,
			TRACE_EVENT_PHASE_MEMORY_DUMP: 118,
			TRACE_EVENT_PHASE_MARK: 82,
			TRACE_EVENT_PHASE_CLOCK_SYNC: 99,
			TRACE_EVENT_PHASE_ENTER_CONTEXT: 40,
			TRACE_EVENT_PHASE_LEAVE_CONTEXT: 41,
			TRACE_EVENT_PHASE_LINK_IDS: 61,
		},
		internal: {
			EXTENSIONLESS_FORMAT_JAVASCRIPT: 0,
			EXTENSIONLESS_FORMAT_WASM: 1,
		},
	},
	// @TODO: Implement those modules
	module_wrap: { ModuleWrap: class ModuleWrap {
		constructor() {
			this.exports = {};
		}
	} }
};

globalThis.internalModules.os.constants = globalThis.internalModules.constants.os;
console.log(globalThis.internalModules);

await import("./modules/primordials.js");
// import * as myPrimordials from "./src/primordials.js";
// globalThis.primordials = { ...myPrimordials, ...globalThis.primordials };
// console.log(globalThis.primordials);

globalThis.getInternalBinding = 
globalThis.internalBinding = function(moduleName) {
	if(internalModules[moduleName]) {
		const module = internalModules[moduleName];
		if(moduleName === "errors") {
			return { ...module, exitCodes: module.codes };
		}
		return module;
	}
	throw new Error(`Unknown module "${moduleName}"`)
}
globalThis.coreModules = {};

const process = await import("./src/process.js");
globalThis.process = { ...process };
globalThis.coreModules.process = globalThis.process;

const types = await import("./modules/internal/types.js");
globalThis.internalModules.util = { types: {...types}, ...globalThis.internalModules.util };
globalThis.internalModules.types = { ...globalThis.internalModules.types, ...types };

const internalConstants = await import("./modules/internal/constants.js");
globalThis.internalModules.constants = { 
	...globalThis.internalModules.constants,
	...internalConstants,
	os: {
		errno: {
			EINVAL: 22,
			EACCES: 13,
			ENOENT: 2,
			ENOTDIR: 20,
			ENOTEMPTY: 66,
			EEXIST: 17,
			EROFS: 30,
			EISDIR: 21,
			ETIMEDOUT: 60,
			ECONNREFUSED: 61,
			ECONNRESET: 54,
			ECONNABORTED: 53,
			ECONNREFUSED: 61,
			ECONNRESET: 54,
		}
	}
};
globalThis.coreModules.constants = globalThis.internalModules.constants;
globalThis.internalModules.util = { 
	constants: {...internalConstants},
	...globalThis.internalModules.util
};

const buffer = await import("./modules/buffer.js");
globalThis.internalModules.buffer = { buffer: {...buffer}, ...globalThis.internalModules.buffer };
globalThis.coreModules.buffer = buffer;
globalThis.buffer = buffer.Buffer;
globalThis.Buffer = buffer.Buffer;

const stringDecoder = await import("./modules/string_decoder.js");
globalThis.internalModules.string_decoder = { stringDecoder: {...stringDecoder}, ...globalThis.internalModules.string_decoder };
globalThis.coreModules.string_decoder = stringDecoder.default;

const inspect = await import("./modules/util/inspect.js");
globalThis.internalModules.util = { inspect: {...inspect}, ...globalThis.internalModules.util };

const util = await import("./modules/util.js");
globalThis.internalModules.util = { 
	...globalThis.internalModules.util,
	...util,
	encodingsMap: globalThis.internalModules.string_decoder.encodings
};
globalThis.coreModules.util = util.default;
globalThis.coreModules.util.encodingsMap = globalThis.internalModules.string_decoder.encodings;

const errors = await import("./modules/errors.js");
globalThis.internalModules.errors = {
	...errors.default,
	codes: errors.default.codes
 };
console.log(globalThis.internalModules.errors);

const realm = await import("./modules/realm.js");
globalThis.realm = { ...realm };

const path = await import("./modules/path.js");
console.log(path.default.join("a", "b", "c"));
globalThis.coreModules.path = path.default;

const stream = await import("./modules/stream.js");
globalThis.coreModules.stream = stream.default;

globalThis.process.stdout = new stream.default.Writable({
	write(chunk, encoding, callback) {
		let message = typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk);
		console.log(message.substr(0, 500));
		callback();
	},
});
globalThis.process.stderr = new stream.default.Writable({
	write(chunk, encoding, callback) {
		let message = typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk);
		console.trace(message.substr(0, 500));
		callback();
	},
});
globalThis.process.stdin = new stream.default.Readable({
	read(size) {
		console.log(size);
		return null;
	},
});
await import("./modules/boot.js");
globalThis.process.stdin.setEncoding("utf-8");
globalThis.process.stdin.resume();

globalThis.coreModules.os = globalThis.internalModules.os;

const blob = await import("./modules/blob.js");
globalThis.coreModules.blob = blob.default;

const fs = await import("./modules/fs.js");
console.log('fs', fs);
globalThis.coreModules.fs = fs.default;

const fsPromises = await import("./modules/fs/promises.js");
globalThis.coreModules["fs/promises"] = fsPromises.default.exports;
globalThis.coreModules["fs"].FileHandle = fsPromises.default.FileHandle;

const events = await import("./modules/events.js");
globalThis.coreModules.events = events.default;

const http = await import("./modules/http.js");
globalThis.coreModules.http = http.default;

// Recycle http module for http2
const http2 = await import("./modules/http2.js");
globalThis.coreModules.http2 = {
	// For HTTP2 constants 
	// ...http2.default,
	constants: http2.default.constants,
	// For actual requests
	...http.default,
}

const crypto = await import("./modules/crypto.js");
globalThis.coreModules.crypto = crypto.default;

const https = await import("./modules/https.js");
globalThis.coreModules.https = https.default;

const tls = await import("./modules/tls.js");
globalThis.coreModules.tls = tls.default;

const net = await import("./modules/net.js");
globalThis.coreModules.net = net.default;

const url = await import("./modules/url.js");
globalThis.coreModules.url = url.default;
console.log('URL', globalThis.coreModules.url);

const zlib = await import("./modules/zlib.js");
globalThis.coreModules.zlib = zlib.default;

const dns = await import("./modules/dns.js");
globalThis.coreModules.dns = dns.default;

const readline = await import("./modules/readline.js");
globalThis.coreModules.readline = readline.default;

const querystring = await import("./modules/querystring.js");
globalThis.coreModules.querystring = querystring.default;

const console2 = await import("./modules/console.js");
globalThis.coreModules.console = console2.default;

const tty = await import("./modules/tty.js");
globalThis.coreModules.tty = tty.default;

const assert = await import("./modules/assert.js");
globalThis.coreModules.assert = assert.default;

const timers = await import("./modules/timers.js");
globalThis.coreModules.timers = timers.default;

const timersPromises = await import("./modules/timers/promises.js");
globalThis.coreModules["timers/promises"] = timersPromises.default;

const childProcess = await import("./modules/child_process.js");
globalThis.coreModules.child_process = childProcess.default;

const vm = await import("./modules/vm.js");
globalThis.coreModules.vm = { ...vm };

const v8 = await import("./modules/v8.js");
globalThis.coreModules.v8 = { ...v8 };

// const workerThreads = await import("./modules/worker_threads.js");
// console.log(workerThreads.default);

const Module = await import("./src/module.js");
globalThis.coreModules.module = Module;

export function runMain(options) {
	return globalThis.coreModules.module.Module.runMain(options);
}

globalThis.setImmediate = setTimeout;