"use strict";

// Helper function to create filesystem errors with proper code property
function createFsError(code, message) {
	const error = new Error(message);
	error.code = code;
	return error;
}

class Stats {
    constructor(node) {
        this.type = node.type;
        this.mode = node.mode;
        this.size = node.type === 'file' ? node.content.length : 0;
        this.atime = new Date(node.atime);
        this.mtime = new Date(node.mtime);
        this.ctime = new Date(node.ctime);
        this.birthtime = new Date(node.birthtime);
        this.atimeMs = this.atime.getTime();
        this.mtimeMs = this.mtime.getTime();
        this.ctimeMs = this.ctime.getTime();
        this.birthtimeMs = this.birthtime.getTime();
    }
    isFile() {
        return this.type === 'file';
    }
    isDirectory() {
        return this.type === 'dir';
    }
    isSymbolicLink() {
        return this.type === 'symlink';
    }
    isBlockDevice() {
        return false;
    }
    isCharacterDevice() {
        return false;
    }
    isFIFO() {
        return false;
    }
    isSocket() {
        return false;
    }
}
class Dirent {
    constructor(name, type) {
        this.name = name;
        this.type = type;
    }
    isDirectory() {
        return this.type === 'dir';
    }
    isFile() {
        return this.type === 'file';
    }
    isBlockDevice() {
        return false;
    }
    isCharacterDevice() {
        return false;
    }
    isFIFO() {
        return false;
    }
    isSocket() {
        return false;
    }
    isSymbolicLink() {
        return false;
    }
}
const DEFAULT_FILE_MODE = 0o666;
const DEFAULT_DIRECTORY_MODE = 0o777;
const createDirectoryNode = (mode = DEFAULT_DIRECTORY_MODE) => {
    const timestamp = Date.now();
    return {
        type: 'dir',
        mode,
        children: new Map(),
        atime: timestamp,
        mtime: timestamp,
        ctime: timestamp,
        birthtime: timestamp,
    };
};
const createFileNode = (content, mode = DEFAULT_FILE_MODE) => {
    const timestamp = Date.now();
    return {
        type: 'file',
        mode,
        content,
        atime: timestamp,
        mtime: timestamp,
        ctime: timestamp,
        birthtime: timestamp,
    };
};
const createSymlinkNode = (target) => {
    const timestamp = Date.now();
    return {
        type: 'symlink',
        mode: 0o777,
        target,  // The path this symlink points to
        atime: timestamp,
        mtime: timestamp,
        ctime: timestamp,
        birthtime: timestamp,
    };
};


const parseOpenFlags = (flags) => {
	const {
		fs: {
			O_RDONLY,
			O_WRONLY,
			O_RDWR,
			O_CREAT,
			O_EXCL,
			O_TRUNC,
			O_APPEND,
		}
	} = globalThis.internalBinding('constants');
	let numeric = 0;
	let readable = false;
	let writable = false;
	let append = false;
	let create = false;
	let exclusive = false;
	let truncate = false;
	if (typeof flags === 'number') {
		numeric = flags;
		append = !!(numeric & O_APPEND);
		create = !!(numeric & O_CREAT);
		exclusive = !!(numeric & O_EXCL);
		truncate = !!(numeric & O_TRUNC);
		writable = true;
		readable = !(numeric & O_WRONLY);
	} else {
		switch (flags) {
			case 'r': readable = true; writable = false; break;
			case 'r+': readable = true; writable = true; break;
			case 'w': readable = false; writable = true; create = true; truncate = true; break;
			case 'wx': readable = false; writable = true; create = true; truncate = true; exclusive = true; break;
			case 'w+': readable = true; writable = true; create = true; truncate = true; break;
			case 'wx+': readable = true; writable = true; create = true; truncate = true; exclusive = true; break;
			case 'a': readable = false; writable = true; create = true; append = true; break;
			case 'ax': readable = false; writable = true; create = true; append = true; exclusive = true; break;
			case 'a+': readable = true; writable = true; create = true; append = true; break;
			case 'ax+': readable = true; writable = true; create = true; append = true; exclusive = true; break;
			default: readable = true; break;
		}
	}
	return { readable, writable, append, create, exclusive, truncate };
};
const splitPath = (input) => {
	const normalised = input;  // normalize(input); // @TODO
	if (normalised === '/') {
		return [];
	}
	return normalised.split('/').filter(Boolean);
};

const updateTimestamps = (node, type) => {
	const timestamp = Date.now();
	node.atime = timestamp;
	if (type === 'modify') {
		node.mtime = timestamp;
		node.ctime = timestamp;
	}
};

const updateDirectoryTimestamp = (directory) => {
	const timestamp = Date.now();
	directory.mtime = timestamp;
	directory.ctime = timestamp;
	directory.atime = timestamp;
};


// InternalFileHandle class for wrapping file descriptors
export class InternalFileHandle {
	constructor(fd, fs) {
		this.fd = fd;
		this.fs = fs;
	}

	close() {
		return new Promise((resolve, reject) => {
			if (this.fd !== undefined) {
				try {
					this.fs.closeSync(this.fd);
					this.fd = undefined;
					resolve();
				} catch (error) {
					reject(error);
				}
			} else {
				resolve();
			}
		});
	}

	read(buffer, offset, length, position) {
		if (this.fd === undefined) {
			throw createFsError('EBADF', 'EBADF: bad file descriptor, read');
		}
		return this.fs.readSync(this.fd, buffer, offset, length, position);
	}

	write(buffer, offset, length, position) {
		if (this.fd === undefined) {
			throw createFsError('EBADF', 'EBADF: bad file descriptor, write');
		}
		return this.fs.writeSync(this.fd, buffer, offset, length, position);
	}

	writev(buffers, position) {
		if (this.fd === undefined) {
			throw createFsError('EBADF', 'EBADF: bad file descriptor, writev');
		}
		
		let totalWritten = 0;
		let currentPosition = position;
		
		for (const buffer of buffers) {
			const written = this.fs.writeSync(
				this.fd, 
				buffer, 
				0, 
				buffer.length, 
				currentPosition
			);
			totalWritten += written;
			if (currentPosition !== null && currentPosition !== undefined) {
				currentPosition += written;
			}
		}
		
		return totalWritten;
	}

	readv(buffers, position) {
		if (this.fd === undefined) {
			throw createFsError('EBADF', 'EBADF: bad file descriptor, readv');
		}
		
		let totalRead = 0;
		let currentPosition = position;
		
		for (const buffer of buffers) {
			const bytesRead = this.fs.readSync(
				this.fd,
				buffer,
				0,
				buffer.length,
				currentPosition
			);
			totalRead += bytesRead;
			if (bytesRead < buffer.length) {
				break; // EOF reached
			}
			if (currentPosition !== null && currentPosition !== undefined) {
				currentPosition += bytesRead;
			}
		}
		
		return totalRead;
	}

	stat(bigint = false) {
		if (this.fd === undefined) {
			throw createFsError('EBADF', 'EBADF: bad file descriptor, fstat');
		}
		const openFile = this.fs.openFiles.get(this.fd);
		if (!openFile) {
			throw createFsError('EBADF', 'EBADF: bad file descriptor, fstat');
		}
		return new Stats(openFile.node);
	}

	truncate(len = 0) {
		if (this.fd === undefined) {
			throw createFsError('EBADF', 'EBADF: bad file descriptor, ftruncate');
		}
		return this.fs.ftruncateSync(this.fd, len);
	}

	ftruncate(len = 0) {
		// Alias for truncate - both do the same thing
		return this.truncate(len);
	}

	utimes(atime, mtime) {
		if (this.fd === undefined) {
			throw createFsError('EBADF', 'EBADF: bad file descriptor, futimes');
		}
		return this.fs.futimesSync(this.fd, atime, mtime);
	}

	chmod(mode) {
		if (this.fd === undefined) {
			throw createFsError('EBADF', 'EBADF: bad file descriptor, fchmod');
		}
		const openFile = this.fs.openFiles.get(this.fd);
		if (!openFile) {
			throw createFsError('EBADF', 'EBADF: bad file descriptor, fchmod');
		}
		openFile.node.mode = mode;
	}

	chown(uid, gid) {
		if (this.fd === undefined) {
			throw createFsError('EBADF', 'EBADF: bad file descriptor, fchown');
		}
		// No-op in browser environment, but don't throw
	}

	datasync() {
		if (this.fd === undefined) {
			throw createFsError('EBADF', 'EBADF: bad file descriptor, fdatasync');
		}
		// No-op in memory filesystem (always synced)
	}

	sync() {
		if (this.fd === undefined) {
			throw createFsError('EBADF', 'EBADF: bad file descriptor, fsync');
		}
		// No-op in memory filesystem (always synced)
	}
}

export class InMemoryFileSystem {
    constructor(initialFiles) {
        this.root = createDirectoryNode();
        this.openFiles = new Map();
        this.nextFd = 3;
        if (initialFiles) {
            for (const [filePath, value] of Object.entries(initialFiles)) {
                this.writeFileSync(filePath, value);
            }
        }
    }
    walk(path) {
        const segments = splitPath(path);
        if (segments.length === 0) {
            return { parent: null, node: this.root, name: '/', segments };
        }
        let current = this.root;
        for (let index = 0; index < segments.length; index += 1) {
            const part = segments[index];
            const node = current.children.get(part);
            const isLast = index === segments.length - 1;
            if (!node) {
                if (isLast) {
                    return {
                        parent: current,
                        node: undefined,
                        name: part,
                        segments,
                    };
                }
                return {
                    parent: current,
                    node: undefined,
                    name: segments[segments.length - 1],
                    segments,
                    missingParent: true,
                };
            }
            if (isLast) {
                return { parent: current, node, name: part, segments };
            }
            if (node.type !== 'dir') {
                return {
                    parent: current,
                    node: undefined,
                    name: segments[index + 1],
                    segments,
                    blockedBy: node,
                };
            }
            current = node;
        }
        return {
            parent: current,
            node: undefined,
            name: segments[segments.length - 1],
            segments,
        };
    }
    ensureDirectory(path, options) {
        const { recursive = false, mode } = options !== null && options !== void 0 ? options : {};
        const segments = splitPath(path);
        if (segments.length === 0) {
            return undefined;
        }
        let current = this.root;
        let createdAny = false;
        let firstCreatedPath = undefined;
        for (let index = 0; index < segments.length; index += 1) {
            const part = segments[index];
            let next = current.children.get(part);
            if (!next) {
                if (!recursive && index !== segments.length - 1) {
                    throw createFsError('ENOENT', `ENOENT: no such file or directory, mkdir '${path}'`);
                }
                next = createDirectoryNode(mode !== null && mode !== void 0 ? mode : DEFAULT_DIRECTORY_MODE);
                current.children.set(part, next);
                updateDirectoryTimestamp(current);
                if (!createdAny && recursive) {
                    firstCreatedPath =
                        '/' + segments.slice(0, index + 1).join('/');
                }
                createdAny = true;
            }
            if (next.type !== 'dir') {
                throw createFsError('ENOTDIR', `ENOTDIR: not a directory, mkdir '${path}'`);
            }
            current = next;
        }
        if (!recursive && !createdAny) {
            throw createFsError('EEXIST', `EEXIST: file already exists, mkdir '${path}'`);
        }
        return firstCreatedPath;
    }
    readFileSync(path, options) {
        const { node, blockedBy, missingParent } = this.walk(path);
        if (missingParent) {
            throw createFsError('ENOENT', `ENOENT: no such file or directory, open '${path}'`);
        }
        if (blockedBy) {
            throw createFsError('ENOTDIR', `ENOTDIR: not a directory, open '${path}'`);
        }
        if (!node || node.type !== 'file') {
            throw createFsError('ENOENT', `ENOENT: no such file or directory, open '${path}'`);
        }
        updateTimestamps(node, 'access');
        const encoding = extractEncoding(options);
        return fromUint8Array(node.content, encoding);
    }
    writeFileSync(path, data, options) {
        var _a;
        const encoding = (_a = extractEncoding(options)) !== null && _a !== void 0 ? _a : (typeof data === 'string' ? 'utf8' : null);
        const bytes = toUint8Array(data, encoding);
        const result = this.walk(path);
        if (result.blockedBy) {
            throw createFsError('ENOTDIR', `ENOTDIR: not a directory, open '${path}'`);
        }
        if (result.missingParent) {
            throw createFsError('ENOENT', `ENOENT: no such file or directory, open '${path}'`);
        }
        if (!result.parent) {
            throw createFsError('EISDIR', `EISDIR: illegal operation on a directory, open '${path}'`);
        }
        const { parent, node, name } = result;
        if (node && node.type === 'dir') {
            throw createFsError('EISDIR', `EISDIR: illegal operation on a directory, open '${path}'`);
        }
        if (node && node.type === 'file') {
            node.content = bytes;
            updateTimestamps(node, 'modify');
            updateDirectoryTimestamp(parent);
            return;
        }
        const fileNode = createFileNode(bytes, typeof options === 'object' &&
            options &&
            'mode' in options &&
            typeof options.mode === 'number'
            ? options.mode
            : DEFAULT_FILE_MODE);
        parent.children.set(name, fileNode);
        updateDirectoryTimestamp(parent);
    }
    existsSync(path) {
        const { node } = this.walk(path);
        return Boolean(node);
    }
    mkdirSync(path, options) {
        if (typeof options === 'number') {
            return this.ensureDirectory(path, {
                recursive: false,
                mode: options,
            });
        }
        return this.ensureDirectory(path, options);
    }
    readdirSync(path, options) {
        const { node, blockedBy, missingParent } = this.walk(path);
        if (missingParent) {
            throw createFsError('ENOENT', `ENOENT: no such file or directory, scandir '${path}'`);
        }
        if (blockedBy) {
            throw createFsError('ENOTDIR', `ENOTDIR: not a directory, scandir '${path}'`);
        }
        if (!node) {
            throw createFsError('ENOENT', `ENOENT: no such file or directory, scandir '${path}'`);
        }
        if (node.type !== 'dir') {
            throw createFsError('ENOTDIR', `ENOTDIR: not a directory, scandir '${path}'`);
        }
        const opts = typeof options === 'string' ? { encoding: options } : options !== null && options !== void 0 ? options : {};
        if (opts.withFileTypes) {
            return Array.from(node.children.entries()).map(([name, childNode]) => new Dirent(name, childNode.type));
        }
        const encoding = extractEncoding(options !== null && options !== void 0 ? options : null);
        const entries = Array.from(node.children.keys());
        if (encoding) {
            return entries.map((entry) => Buffer.from(entry).toString(encoding));
        }
        return entries || [];
    }
    statSync(path) {
        const { node, blockedBy, missingParent } = this.walk(path);
        if (missingParent) {
            throw createFsError('ENOENT', `ENOENT: no such file or directory, stat '${path}'`);
        }
        if (blockedBy) {
            throw createFsError('ENOTDIR', `ENOTDIR: not a directory, stat '${path}'`);
        }
        if (!node) {
            throw createFsError('ENOENT', `ENOENT: no such file or directory, stat '${path}'`);
        }
        
        // Follow symlinks for stat (but not for lstat)
        if (node.type === 'symlink') {
            // Resolve the symlink target
            const target = node.target;
            // Recursively stat the target
            return this.statSync(target);
        }
        
        return new Stats(node);
    }
    lstatSync(path) {
        // lstat does NOT follow symlinks, unlike stat
        const { node, blockedBy, missingParent } = this.walk(path);
        
        if (missingParent || !node) {
            // If path doesn't exist and it's an absolute path that could be a parent
            // directory of our in-memory filesystem, create fake directory stats
            // This allows realpath() to work with absolute paths
            if (path.startsWith('/')) {
                // Check if any of our root children would be under this path
                for (const childName of this.root.children.keys()) {
                    const fullChildPath = '/' + childName;
                    if (fullChildPath.startsWith(path + '/') || path === '/') {
                        // This path is a parent of something in our filesystem
                        // Return a fake directory stat
                        const fakeDir = {
                            type: 'dir',
                            mode: 0o755,
                            children: new Map(),
                            atime: Date.now(),
                            mtime: Date.now(),
                            ctime: Date.now(),
                            birthtime: Date.now()
                        };
                        return new Stats(fakeDir);
                    }
                }
            }
            throw createFsError('ENOENT', `ENOENT: no such file or directory, lstat '${path}'`);
        }
        
        if (blockedBy) {
            throw createFsError('ENOTDIR', `ENOTDIR: not a directory, lstat '${path}'`);
        }
        
        // Return stats WITHOUT following symlinks
        return new Stats(node);
    }
    fstatSync(fd, options = { bigint: false }) {
        const openFile = this.openFiles.get(fd);
        if (!openFile) {
            throw createFsError('EBADF', `EBADF: bad file descriptor, fstat`);
        }
        return new Stats(openFile.node);
    }
    
    // Convert Stats object to array format for binding compatibility
    statsToArray(stats, useBigint = false) {
        const ArrayType = useBigint ? BigInt64Array : Float64Array;
        const arr = new ArrayType(18);
        
        // Convert to appropriate type
        const toType = useBigint ? BigInt : Number;
        
        // File type constants (from Node.js constants)
        const S_IFREG = 32768;  // Regular file
        const S_IFDIR = 16384;  // Directory
        const S_IFLNK = 40960;  // Symbolic link
        
        // Combine file type bits with permission bits
        let mode = stats.mode;
        if (stats.type === 'file') {
            mode = S_IFREG | stats.mode;
        } else if (stats.type === 'dir') {
            mode = S_IFDIR | stats.mode;
        } else if (stats.type === 'symlink') {
            mode = S_IFLNK | stats.mode;
        }
        
        // Fill array in the order expected by Node.js
        // See FsStatsOffset in src/node_file.h
        arr[0] = toType(0);  // dev
        arr[1] = toType(mode);  // mode (with file type bits)
        arr[2] = toType(1);  // nlink
        arr[3] = toType(0);  // uid
        arr[4] = toType(0);  // gid
        arr[5] = toType(0);  // rdev
        arr[6] = toType(4096);  // blksize
        arr[7] = toType(0);  // ino
        arr[8] = toType(stats.size);  // size
        arr[9] = toType(Math.ceil(stats.size / 512));  // blocks
        
        // Time values - split into seconds and nanoseconds
        arr[10] = toType(Math.floor(stats.atimeMs / 1000));  // atimeSec
        arr[11] = toType((stats.atimeMs % 1000) * 1000000);  // atimeNsec
        arr[12] = toType(Math.floor(stats.mtimeMs / 1000));  // mtimeSec
        arr[13] = toType((stats.mtimeMs % 1000) * 1000000);  // mtimeNsec
        arr[14] = toType(Math.floor(stats.ctimeMs / 1000));  // ctimeSec
        arr[15] = toType((stats.ctimeMs % 1000) * 1000000);  // ctimeNsec
        arr[16] = toType(Math.floor(stats.birthtimeMs / 1000));  // birthtimeSec
        arr[17] = toType((stats.birthtimeMs % 1000) * 1000000);  // birthtimeNsec
        
        return arr;
    }
    unlinkSync(path) {
        const result = this.walk(path);
        const { parent, node, name, blockedBy, missingParent } = result;
        if (missingParent) {
            throw createFsError('ENOENT', `ENOENT: no such file or directory, unlink '${path}'`);
        }
        if (blockedBy) {
            throw createFsError('ENOTDIR', `ENOTDIR: not a directory, unlink '${path}'`);
        }
        if (!node) {
            throw createFsError('ENOENT', `ENOENT: no such file or directory, unlink '${path}'`);
        }
        // Allow unlinking files and symlinks, but not directories
        if (node.type !== 'file' && node.type !== 'symlink') {
            throw createFsError('EPERM', `EPERM: operation not permitted, unlink '${path}'`);
        }
        parent === null || parent === void 0 ? void 0 : parent.children.delete(name);
        if (parent) {
            updateDirectoryTimestamp(parent);
        }
    }
    rmdirSync(path, options) {
        var _a;
        const { parent, node, name, blockedBy, missingParent } = this.walk(path);
        if (missingParent) {
            throw createFsError('ENOENT', `ENOENT: no such file or directory, rmdir '${path}'`);
        }
        if (blockedBy) {
            throw createFsError('ENOTDIR', `ENOTDIR: not a directory, rmdir '${path}'`);
        }
        if (!node) {
            throw createFsError('ENOENT', `ENOENT: no such file or directory, rmdir '${path}'`);
        }
        if (node.type !== 'dir') {
            throw createFsError('ENOTDIR', `ENOTDIR: not a directory, rmdir '${path}'`);
        }
        const recursive = (_a = options === null || options === void 0 ? void 0 : options.recursive) !== null && _a !== void 0 ? _a : false;
        if (!recursive && node.children.size > 0) {
            throw createFsError('ENOTEMPTY', `ENOTEMPTY: directory not empty, rmdir '${path}'`);
        }
        if (recursive) {
            node.children.clear();
        }
        parent === null || parent === void 0 ? void 0 : parent.children.delete(name);
        if (parent) {
            updateDirectoryTimestamp(parent);
        }
    }
    rmSync(path, options) {
        const { node, blockedBy, missingParent } = this.walk(path);
        if (missingParent) {
            if (options === null || options === void 0 ? void 0 : options.force) {
                return;
            }
            throw createFsError('ENOENT', `ENOENT: no such file or directory, rm '${path}'`);
        }
        if (blockedBy) {
            throw createFsError('ENOTDIR', `ENOTDIR: not a directory, rm '${path}'`);
        }
        if (!node) {
            if (options === null || options === void 0 ? void 0 : options.force) {
                return;
            }
            throw createFsError('ENOENT', `ENOENT: no such file or directory, rm '${path}'`);
        }
        if (node.type === 'dir') {
            this.rmdirSync(path, { recursive: options === null || options === void 0 ? void 0 : options.recursive });
            return;
        }
        this.unlinkSync(path);
    }
    renameSync(oldPath, newPath) {
        const oldResult = this.walk(oldPath);
        if (!oldResult.node) {
            throw createFsError('ENOENT', `ENOENT: no such file or directory, rename '${oldPath}'`);
        }
        if (!oldResult.parent) {
            throw createFsError('EPERM', `EPERM: operation not permitted, rename '${oldPath}'`);
        }
        const newResult = this.walk(newPath);
        if (newResult.blockedBy) {
            throw createFsError('ENOTDIR', `ENOTDIR: not a directory, rename '${newPath}'`);
        }
        if (newResult.missingParent) {
            throw createFsError('ENOENT', `ENOENT: no such file or directory, rename '${newPath}'`);
        }
        if (newResult.node) {
            throw createFsError('EEXIST', `EEXIST: file already exists, rename '${newPath}'`);
        }
        if (!newResult.parent) {
            throw createFsError('ENOENT', `ENOENT: no such file or directory, rename '${newPath}'`);
        }
        oldResult.parent.children.delete(oldResult.name);
        newResult.parent.children.set(newResult.name, oldResult.node);
        updateDirectoryTimestamp(oldResult.parent);
        updateDirectoryTimestamp(newResult.parent);
    }
    copyFileSync(src, dest) {
        const { node, blockedBy, missingParent } = this.walk(src);
        if (missingParent || blockedBy) {
            throw createFsError('ENOENT', `ENOENT: no such file or directory, copy '${src}'`);
        }
        if (!node || node.type !== 'file') {
            throw createFsError('ENOENT', `ENOENT: no such file or directory, copy '${src}'`);
        }
        this.writeFileSync(dest, cloneBuffer(node.content));
    }
    appendFileSync(path, data, options) {
        var _a;
        const encoding = (_a = extractEncoding(options)) !== null && _a !== void 0 ? _a : (typeof data === 'string' ? 'utf8' : null);
        const bytes = toUint8Array(data, encoding);
        const { parent, node, name, blockedBy, missingParent } = this.walk(path);
        if (blockedBy) {
            throw createFsError('ENOTDIR', `ENOTDIR: not a directory, open '${path}'`);
        }
        if (missingParent) {
            throw createFsError('ENOENT', `ENOENT: no such file or directory, open '${path}'`);
        }
        if (!parent) {
            // This case should ideally not be hit for a valid non-root path
            throw createFsError('EACCES', `EACCES: permission denied, open '${path}'`);
        }
        if (node) {
            if (node.type === 'dir') {
                throw createFsError('EISDIR', `EISDIR: illegal operation on a directory, open '${path}'`);
            }
            // It's a file, append content
            const newContent = new Uint8Array(node.content.length + bytes.length);
            newContent.set(node.content);
            newContent.set(bytes, node.content.length);
            node.content = newContent;
            updateTimestamps(node, 'modify');
            updateDirectoryTimestamp(parent);
        }
        else {
            // File does not exist, create it
            const fileNode = createFileNode(bytes, typeof options === 'object' &&
                options &&
                'mode' in options &&
                typeof options.mode === 'number'
                ? options.mode
                : DEFAULT_FILE_MODE);
            parent.children.set(name, fileNode);
            updateDirectoryTimestamp(parent);
        }
    }
    openSync(path, flags, mode = DEFAULT_FILE_MODE) {
        const { parent, node: existingNode, name, blockedBy, missingParent, } = this.walk(path);
        if (blockedBy) {
            throw createFsError('ENOTDIR', `ENOTDIR: not a directory, open '${path}'`);
        }
        if (existingNode && existingNode.type === 'dir') {
            throw createFsError('EISDIR', `EISDIR: illegal operation on a directory, open '${path}'`);
        }
        const f = parseOpenFlags(flags);
        let fileNode;
        if (existingNode) {
            if (existingNode.type !== 'file') {
                throw createFsError('EISDIR', `EISDIR: illegal operation on a directory, open '${path}'`);
            }
            fileNode = existingNode;
            if (f.truncate) {
                fileNode.content = new Uint8Array(0);
                updateTimestamps(fileNode, 'modify');
            }
            if (f.exclusive && f.create) {
                throw createFsError('EEXIST', `EEXIST: file already exists, open '${path}'`);
            }
        }
        else {
            if (!parent) {
                throw createFsError('EACCES', `EACCES: permission denied, open '${path}'`);
            }
            if (!f.create) {
                // need existing file for read or write without create
                if (missingParent || !parent.children.has(name)) {
                    throw createFsError('ENOENT', `ENOENT: no such file or directory, open '${path}'`);
                }
            }
            // create if requested
            fileNode = createFileNode(new Uint8Array(0), mode);
            parent.children.set(name, fileNode);
            updateDirectoryTimestamp(parent);
        }
        const fd = this.nextFd++;
        this.openFiles.set(fd, {
            node: fileNode,
            position: f.append ? (fileNode.content.length) : 0,
            flags: typeof flags === 'string' ? flags : String(flags),
        });
        return fd;
	}
	openFileHandle(path, flags, mode, usePromises) {
		if (usePromises === globalThis.internalModules.fs.kUsePromises) {
			return promiseFromSync(() => this.openFileHandleSync(path, flags, mode));
		}
		return this.openFileHandleSync(path, flags, mode);
	}
	openFileHandleSync(path, flags, mode) {
		const FileHandle = globalThis.coreModules["fs"].FileHandle;
		const fd = this.openSync(path, flags, mode);
		const internalHandle = new InternalFileHandle(fd, this);
		return new FileHandle(internalHandle);
	}
    closeSync(fd) {
        if (!this.openFiles.has(fd)) {
            throw createFsError('EBADF', `EBADF: bad file descriptor, close`);
        }
        this.openFiles.delete(fd);
    }
    readSync(fd, buffer, offset, length, position) {
        const openFile = this.openFiles.get(fd);
        if (!openFile) {
            throw createFsError('EBADF', `EBADF: bad file descriptor, read`);
        }
        // Node.js uses -1 or null to mean "use current position"
        const readPosition = (position !== null && position !== undefined && position >= 0)
            ? position
            : openFile.position;
        const { node: fileNode } = openFile;
        const availableBytes = Math.max(0, fileNode.content.length - readPosition);
	const bytesToRead = Math.min(length, availableBytes);
        if (bytesToRead > 0) {
            buffer.set(fileNode.content.subarray(readPosition, readPosition + bytesToRead), offset);
            // Only update position if using current position (not absolute position)
            if (position === null || position === undefined || position < 0) {
                openFile.position = readPosition + bytesToRead;
            }
	}
	
        updateTimestamps(fileNode, 'access');
        return bytesToRead;
    }
    read(fd, buffer, offset, length, position, callback) {
        try {
            const bytesRead = this.readSync(fd, buffer, offset, length, position);
            if (callback) {
                // Async-style callback with (error, bytesRead, buffer)
                setImmediate(() => callback(null, bytesRead, buffer));
            }
            return bytesRead;
        } catch (err) {
            if (callback) {
                setImmediate(() => callback(err));
            }
            throw err;
        }
    }
    writeSync(fd, data, offsetOrPos, lengthOrEnc, position) {
        var _a, _b;
        const openFile = this.openFiles.get(fd);
        if (!openFile) {
            throw createFsError('EBADF', `EBADF: bad file descriptor, write`);
        }
        let buffer;
        let writePosition;
        let useAbsolutePosition = false;
        if (typeof data === 'string') {
            const encoding = (_a = lengthOrEnc) !== null && _a !== void 0 ? _a : 'utf8';
            buffer = toUint8Array(data, encoding);
            writePosition = offsetOrPos;
        }
        else {
            const offset = offsetOrPos !== null && offsetOrPos !== void 0 ? offsetOrPos : 0;
            const length = (_b = lengthOrEnc) !== null && _b !== void 0 ? _b : data.length - offset;
            buffer = data.subarray(offset, offset + length);
            writePosition = position;
        }
        // Node.js uses -1 or null to mean "use current position"
        if (writePosition === null || writePosition === undefined || writePosition < 0) {
            writePosition = openFile.position;
        } else {
            useAbsolutePosition = true;
        }
        const { node: fileNode } = openFile;
        const originalContent = fileNode.content;
        const endPosition = writePosition + buffer.length;
        if (endPosition > originalContent.length) {
            const newContent = new Uint8Array(endPosition);
            newContent.set(originalContent);
            newContent.set(buffer, writePosition);
            fileNode.content = newContent;
        }
        else {
            originalContent.set(buffer, writePosition);
        }
        // Only update file position if not using absolute position
        if (!useAbsolutePosition) {
            openFile.position = writePosition + buffer.length;
        }
        updateTimestamps(fileNode, 'modify');
        return buffer.length;
    }
    truncateSync(path, len = 0) {
        const { node, blockedBy, missingParent } = this.walk(path);
        if (missingParent || !node) {
            throw createFsError('ENOENT', `ENOENT: no such file or directory, truncate '${path}'`);
        }
        if (blockedBy || node.type !== 'file') {
            throw createFsError('EISDIR', `EISDIR: illegal operation on a directory, truncate '${path}'`);
        }
        if (len < 0) {
            len = 0;
        }
        if (node.content.length === len)
            return;
        if (node.content.length > len) {
            node.content = node.content.subarray(0, len);
        }
        else {
            const buf = new Uint8Array(len);
            buf.set(node.content);
            node.content = buf;
        }
        updateTimestamps(node, 'modify');
    }
    ftruncateSync(fd, len = 0) {
        const openFile = this.openFiles.get(fd);
        if (!openFile) {
            throw createFsError('EBADF', `EBADF: bad file descriptor, ftruncate`);
        }
        const node = openFile.node;
        if (len < 0) {
            len = 0;
        }
        if (node.content.length === len)
            return;
        if (node.content.length > len) {
            node.content = node.content.subarray(0, len);
        }
        else {
            const buf = new Uint8Array(len);
            buf.set(node.content);
            node.content = buf;
        }
        updateTimestamps(node, 'modify');
        openFile.position = Math.min(openFile.position, len);
    }
    utimesSync(path, atime, mtime) {
        const { node, blockedBy, missingParent } = this.walk(path);
        if (missingParent || !node) {
            throw createFsError('ENOENT', `ENOENT: no such file or directory, utimes '${path}'`);
        }
        if (blockedBy) {
            throw createFsError('ENOTDIR', `ENOTDIR: not a directory, utimes '${path}'`);
        }
        node.atime = atime;
        node.mtime = mtime;
        node.ctime = Date.now();
    }
    futimesSync(fd, atime, mtime) {
        const openFile = this.openFiles.get(fd);
        if (!openFile) {
            throw createFsError('EBADF', `EBADF: bad file descriptor, futimes`);
        }
        const node = openFile.node;
        node.atime = atime;
        node.mtime = mtime;
        node.ctime = Date.now();
    }
    linkSync(existingPath, newPath) {
        const src = this.walk(existingPath);
        if (!src.node) {
            throw createFsError('ENOENT', `ENOENT: no such file or directory, link '${existingPath}'`);
        }
        if (src.node.type !== 'file') {
            throw createFsError('EPERM', `EPERM: operation not permitted, link '${existingPath}'`);
        }
        const dst = this.walk(newPath);
        if (dst.blockedBy) {
            throw createFsError('ENOTDIR', `ENOTDIR: not a directory, link '${newPath}'`);
        }
        if (dst.missingParent || !dst.parent) {
            throw createFsError('ENOENT', `ENOENT: no such file or directory, link '${newPath}'`);
        }
        if (dst.node) {
            throw createFsError('EEXIST', `EEXIST: file already exists, link '${newPath}'`);
        }
        dst.parent.children.set(dst.name, src.node);
        updateDirectoryTimestamp(dst.parent);
    }
    mkdtempSync(prefix) {
        const randomSuffix = () => Math.random().toString(36).slice(2, 8);
        let candidate = '';
        let attempt = 0;
        do {
            candidate = prefix + randomSuffix();
            attempt++;
            if (attempt > 1000) {
                throw createFsError('EMFILE', `EMFILE: too many mkdtemp attempts for prefix '${prefix}'`);
            }
        } while (this.existsSync(candidate));
        this.mkdirSync(candidate);
        return candidate;
	}
	
	writeBuffer(fd, buffer, offset, length, position, kUsePromises) {
		if (kUsePromises !== undefined) {
			return promiseFromSync(() => this.writeBufferSync(fd, buffer, offset, length, position));
		}
		return this.writeBufferSync(fd, buffer, offset, length, position);
	}

	writeBufferSync(fd, buffer, offset, length, position) {
		const fs = this;
		try {
			const openFile = fs.openFiles.get(fd);
			if (!openFile) {
				ctx.errno = -9; // EBADF
				ctx.error = 'EBADF: bad file descriptor, write';
				return;
			}

			// Handle position
			let writePosition;
			if (position === null || position === undefined) {
				writePosition = openFile.position;
			} else {
				writePosition = position;
			}

			const { node: fileNode } = openFile;
			const originalContent = fileNode.content;
			
			// Get the actual buffer slice to write
			const bufferToWrite = buffer.subarray(offset, offset + length);
			const endPosition = writePosition + bufferToWrite.length;

			// Expand or write to content
			if (endPosition > originalContent.length) {
				const newContent = new Uint8Array(endPosition);
				newContent.set(originalContent);
				newContent.set(bufferToWrite, writePosition);
				fileNode.content = newContent;
			} else {
				originalContent.set(bufferToWrite, writePosition);
			}

			// Update position if not explicit
			if (position === null || position === undefined) {
				openFile.position = writePosition + bufferToWrite.length;
			}

			updateTimestamps(fileNode, 'modify');
			return bufferToWrite.length;
		} catch (err) {
			console.error(err);
			return -1;
		}
	}

	writeBuffersSync(fd, buffers, position) {
		const openFile = this.openFiles.get(fd);
		if (!openFile) {
			throw createFsError('EBADF', `EBADF: bad file descriptor, writev`);
		}

		let writePosition;
		if (position === null || position === undefined || position < 0) {
			writePosition = openFile.position;
		} else {
			writePosition = position;
		}

		const { node: fileNode } = openFile;
		let totalWritten = 0;

		for (const buffer of buffers) {
			const bufferToWrite = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
			const endPosition = writePosition + bufferToWrite.length;

			// Expand or write to content
			if (endPosition > fileNode.content.length) {
				const newContent = new Uint8Array(endPosition);
				newContent.set(fileNode.content);
				newContent.set(bufferToWrite, writePosition);
				fileNode.content = newContent;
			} else {
				fileNode.content.set(bufferToWrite, writePosition);
			}

			writePosition += bufferToWrite.length;
			totalWritten += bufferToWrite.length;
		}

		// Update position if not using absolute position
		if (position === null || position === undefined || position < 0) {
			openFile.position = writePosition;
		}

		updateTimestamps(fileNode, 'modify');
		return totalWritten;
	}

	writeFileUtf8(path, data, flags, mode) {
		try {
			// Convert string to UTF-8 bytes
			const bytes = toUint8Array(data, 'utf8');
			
			const result = this.walk(path);
			if (result.blockedBy) {
				throw createFsError('ENOTDIR', `ENOTDIR: not a directory, open '${path}'`);
			}
			if (result.missingParent) {
				throw createFsError('ENOENT', `ENOENT: no such file or directory, open '${path}'`);
			}
			if (!result.parent) {
				throw createFsError('EISDIR', `EISDIR: illegal operation on a directory, open '${path}'`);
			}

			const { parent, node, name } = result;
			if (node && node.type === 'dir') {
				throw createFsError('EISDIR', `EISDIR: illegal operation on a directory, open '${path}'`);
			}

			// Check flags for append mode
			// O_APPEND = 8, check if append flag is set
			const isAppend = (flags & 8) !== 0;
			// O_EXCL = 2048, check if exclusive flag is set
			const isExclusive = (flags & 2048) !== 0;

			if (node && node.type === 'file') {
				// File exists
				if (isExclusive) {
					// wx or wx+ flag - fail if file exists
					throw createFsError('EEXIST', `EEXIST: file already exists, open '${path}'`);
				}
				
				if (isAppend) {
					// Append mode - concatenate new data
					const newContent = new Uint8Array(node.content.length + bytes.length);
					newContent.set(node.content);
					newContent.set(bytes, node.content.length);
					node.content = newContent;
				} else {
					// Write mode - replace content
					node.content = bytes;
				}
				
				if (mode !== undefined) {
					node.mode = mode;
				}
				updateTimestamps(node, 'modify');
				updateDirectoryTimestamp(parent);
				return;
			}

			// File doesn't exist
			if (isExclusive) {
				// This is fine - wx creates the file if it doesn't exist
			}

			// Create new file
			const fileNode = createFileNode(bytes, mode !== undefined ? mode : DEFAULT_FILE_MODE);
			parent.children.set(name, fileNode);
			updateDirectoryTimestamp(parent);
		} catch (err) {
		console.error('writeFileUtf8 error:', err);
		throw err;
	}
}

	// rmSync - synchronous recursive remove
	// Signature: rmSync(path, maxRetries, recursive, retryDelay)
	rmSync(path, maxRetries = 0, recursive = false, retryDelay = 100) {
		const { node, blockedBy, missingParent } = this.walk(path);
		
		// If file doesn't exist, just return (force mode behavior)
		if (missingParent || !node) {
			return;
		}
		
		if (blockedBy) {
			throw createFsError('ENOTDIR', `ENOTDIR: not a directory, rm '${path}'`);
		}
		
		// If it's a directory and recursive is false, throw error
		if (node.type === 'dir' && !recursive) {
			throw createFsError('EISDIR', `EISDIR: illegal operation on a directory, rm '${path}'`);
		}
		
		// Use existing rmSync logic for directories, unlinkSync for files
		if (node.type === 'dir') {
			this.rmdirSync(path, { recursive: true });
		} else {
			this.unlinkSync(path);
		}
	}

	// cpSyncCheckPaths - validates paths before copying
	// Signature: cpSyncCheckPaths(src, dest, dereference, recursive)
	cpSyncCheckPaths(src, dest, dereference = false, recursive = false) {
		const srcResult = this.walk(src);
		
		if (!srcResult.node) {
			throw createFsError('ENOENT', `ENOENT: no such file or directory, stat '${src}'`);
		}
		
		if (srcResult.blockedBy) {
			throw createFsError('ENOTDIR', `ENOTDIR: not a directory, stat '${src}'`);
		}
		
		const destResult = this.walk(dest);
		const srcIsDir = srcResult.node.type === 'dir';
		const destExists = !!destResult.node;
		
		// Check if source is inside destination
		if (srcIsDir && recursive) {
			const srcPath = src.endsWith('/') ? src : src + '/';
			const destPath = dest.endsWith('/') ? dest : dest + '/';
			
			if (destPath.startsWith(srcPath)) {
				throw createFsError('EINVAL', `EINVAL: cannot copy '${src}' to a subdirectory of itself, '${dest}'`);
			}
		}
		
		// If destination exists and is a different type, throw error
		if (destExists) {
			const destIsDir = destResult.node.type === 'dir';
			
			if (srcIsDir && !destIsDir) {
				throw createFsError('ENOTDIR', `ENOTDIR: not a directory, cp '${dest}'`);
			}
			
			if (!srcIsDir && destIsDir) {
				throw createFsError('EISDIR', `EISDIR: illegal operation on a directory, cp '${dest}'`);
			}
		}
		
		return true;
	}

	// cpSync - synchronous recursive copy
	cpSync(src, dest, options = {}) {
		const {
			dereference = false,
			errorOnExist = false,
			filter = null,
			force = true,
			preserveTimestamps = false,
			recursive = false,
			verbatimSymlinks = false
		} = options;
		
		// Apply filter if provided
		if (filter && typeof filter === 'function') {
			if (!filter(src, dest)) {
				return;
			}
		}
		
		// Check paths validity
		this.cpSyncCheckPaths(src, dest, dereference, recursive);
		
		const srcResult = this.walk(src);
		const srcNode = srcResult.node;
		
		if (!srcNode) {
			throw createFsError('ENOENT', `ENOENT: no such file or directory, cp '${src}'`);
		}
		
		// Handle file copy
		if (srcNode.type === 'file') {
			const destResult = this.walk(dest);
			
			if (destResult.node && errorOnExist) {
				throw createFsError('EEXIST', `EEXIST: file already exists, cp '${dest}'`);
			}
			
			if (destResult.node && !force) {
				return; // Skip existing
			}
			
			// Copy the file
			this.writeFileSync(dest, cloneBuffer(srcNode.content), { mode: srcNode.mode });
			
			// Preserve timestamps if requested
			if (preserveTimestamps) {
				const destNode = this.walk(dest).node;
				if (destNode) {
					destNode.atime = srcNode.atime;
					destNode.mtime = srcNode.mtime;
				}
			}
			
			return;
		}
		
		// Handle directory copy
		if (srcNode.type === 'dir') {
			if (!recursive) {
				throw createFsError('EISDIR', `EISDIR: illegal operation on a directory, cp '${src}'`);
			}
			
			// Create destination directory
			const destResult = this.walk(dest);
			if (!destResult.node) {
				this.mkdirSync(dest, { recursive: true, mode: srcNode.mode });
			}
			
			// Copy all children
			for (const [name, childNode] of srcNode.children.entries()) {
				const childSrc = `${src}/${name}`;
				const childDest = `${dest}/${name}`;
				
				// Apply filter to children
				if (filter && typeof filter === 'function') {
					if (!filter(childSrc, childDest)) {
						continue;
					}
				}
				
				this.cpSync(childSrc, childDest, options);
			}
			
			// Preserve timestamps if requested
			if (preserveTimestamps) {
				const destNode = this.walk(dest).node;
				if (destNode) {
					destNode.atime = srcNode.atime;
					destNode.mtime = srcNode.mtime;
				}
			}
		}
	}

	// symlinkSync - create symbolic link
	symlinkSync(target, path, type = 'file') {
		const { parent, node, name, blockedBy, missingParent } = this.walk(path);
		
		if (blockedBy) {
			throw createFsError('ENOTDIR', `ENOTDIR: not a directory, symlink '${path}'`);
		}
		
		if (missingParent) {
			throw createFsError('ENOENT', `ENOENT: no such file or directory, symlink '${path}'`);
		}
		
		if (!parent) {
			throw createFsError('EACCES', `EACCES: permission denied, symlink '${path}'`);
		}
		
		if (node) {
			throw createFsError('EEXIST', `EEXIST: file already exists, symlink '${path}'`);
		}
		
		// Create symlink node
		const symlinkNode = createSymlinkNode(target);
		parent.children.set(name, symlinkNode);
		updateDirectoryTimestamp(parent);
	}

	// opendirSync - opens a directory and returns a DirHandle
	// This is used by the Dir class in Node.js
	opendirSync(path) {
		const { node, blockedBy, missingParent } = this.walk(path);
		
		if (missingParent || !node) {
			throw createFsError('ENOENT', `ENOENT: no such file or directory, opendir '${path}'`);
		}
		
		if (blockedBy || node.type !== 'dir') {
			throw createFsError('ENOTDIR', `ENOTDIR: not a directory, opendir '${path}'`);
		}
		
		// Return a handle object that can be used to read directory entries
		// This mimics the DirHandle from Node.js C++ bindings
		return {
			path,
			node,
			entries: null,
			position: 0,
			
			// Read directory entries
			read(encoding, bufferSize) {
				if (!this.entries) {
					this.entries = Array.from(this.node.children.entries());
				}
				
				if (this.position >= this.entries.length) {
					return null; // EOF
				}
				
				const [name, childNode] = this.entries[this.position];
				this.position++;
				
				return name;
			},
			
			// Close the directory handle
			close() {
				this.entries = null;
				this.position = 0;
			}
		};
	}

	// readBuffers - read into multiple buffers (vectored I/O)
	// Signature: readBuffers(fd, buffers, position)
	readBuffers(fd, buffers, position) {
		const openFile = this.openFiles.get(fd);
		if (!openFile) {
			throw createFsError('EBADF', `EBADF: bad file descriptor, read`);
		}
		
		// Determine read position
		const readPosition = (position !== null && position !== undefined && position >= 0)
			? position
			: openFile.position;
		
		const { node: fileNode } = openFile;
		let totalBytesRead = 0;
		let currentPosition = readPosition;
		
		// Read into each buffer sequentially
		for (const buffer of buffers) {
			const availableBytes = Math.max(0, fileNode.content.length - currentPosition);
			const bytesToRead = Math.min(buffer.length, availableBytes);
			
			if (bytesToRead > 0) {
				buffer.set(fileNode.content.subarray(currentPosition, currentPosition + bytesToRead), 0);
				currentPosition += bytesToRead;
				totalBytesRead += bytesToRead;
			}
			
			// Stop if we've reached EOF
			if (bytesToRead < buffer.length) {
				break;
			}
		}
		
		// Update position if using current position (not absolute position)
		if (position === null || position === undefined || position < 0) {
			openFile.position = currentPosition;
		}
		
		updateTimestamps(fileNode, 'access');
		return totalBytesRead;
	}

	// mkdtemp - create a temporary directory with unique name
	// Signature: mkdtemp(prefix, encoding)
	mkdtemp(prefix, encoding) {
		// Note: encoding parameter is for the return value, not used in our simple implementation
		return this.mkdtempSync(prefix);
	}

// Async wrappers for FSReqCallback pattern
readFileAsync(path, options, req) {
	setImmediate(() => {
		try {
			const result = this.readFileSync(path, options);
			if (req && req.oncomplete) {
				req.oncomplete(null, result);
			}
		} catch (err) {
			if (req && req.oncomplete) {
				req.oncomplete(err);
			}
		}
	});
}

writeFileAsync(path, data, options, req) {
	setImmediate(() => {
		try {
			this.writeFileSync(path, data, options);
			if (req && req.oncomplete) {
				req.oncomplete(null);
			}
		} catch (err) {
			if (req && req.oncomplete) {
				req.oncomplete(err);
			}
		}
	});
}

openAsync(path, flags, mode, req) {
	setImmediate(() => {
		try {
			const fd = this.openSync(path, flags, mode);
			if (req && req.oncomplete) {
				req.oncomplete(null, fd);
			}
		} catch (err) {
			if (req && req.oncomplete) {
				req.oncomplete(err);
			}
		}
	});
}

closeAsync(fd, req) {
	setImmediate(() => {
		try {
			this.closeSync(fd);
			if (req && req.oncomplete) {
				req.oncomplete(null);
			}
		} catch (err) {
			if (req && req.oncomplete) {
				req.oncomplete(err);
			}
		}
	});
}

readAsync(fd, buffer, offset, length, position, req) {
	setImmediate(() => {
		try {
			const bytesRead = this.readSync(fd, buffer, offset, length, position);
			if (req && req.oncomplete) {
				req.oncomplete(null, bytesRead, buffer);
			}
		} catch (err) {
			if (req && req.oncomplete) {
				req.oncomplete(err);
			}
		}
	});
}

writeAsync(fd, buffer, offset, length, position, req) {
	setImmediate(() => {
		try {
			const bytesWritten = this.writeSync(fd, buffer, offset, length, position);
			if (req && req.oncomplete) {
				req.oncomplete(null, bytesWritten);
			}
		} catch (err) {
			if (req && req.oncomplete) {
				req.oncomplete(err);
			}
		}
	});
}

statAsync(path, bigint, req) {
	setImmediate(() => {
		try {
			const stats = this.statSync(path);
			if (req && req.oncomplete) {
				req.oncomplete(null, stats);
			}
		} catch (err) {
			if (req && req.oncomplete) {
				req.oncomplete(err);
			}
		}
	});
}

fstatAsync(fd, bigint, req) {
	setImmediate(() => {
		try {
			const stats = this.fstatSync(fd);
			if (req && req.oncomplete) {
				req.oncomplete(null, stats);
			}
		} catch (err) {
			if (req && req.oncomplete) {
				req.oncomplete(err);
			}
		}
	});
}

lstatAsync(path, bigint, req) {
	setImmediate(() => {
		try {
			const stats = this.lstatSync(path);
			if (req && req.oncomplete) {
				req.oncomplete(null, stats);
			}
		} catch (err) {
			if (req && req.oncomplete) {
				req.oncomplete(err);
			}
		}
	});
}

mkdirAsync(path, options, req) {
	setImmediate(() => {
		try {
			this.mkdirSync(path, options);
			if (req && req.oncomplete) {
				req.oncomplete(null);
			}
		} catch (err) {
			if (req && req.oncomplete) {
				req.oncomplete(err);
			}
		}
	});
}

unlinkAsync(path, req) {
	setImmediate(() => {
		try {
			this.unlinkSync(path);
			if (req && req.oncomplete) {
				req.oncomplete(null);
			}
		} catch (err) {
			if (req && req.oncomplete) {
				req.oncomplete(err);
			}
		}
	});
}

rmdirAsync(path, options, req) {
	setImmediate(() => {
		try {
			this.rmdirSync(path, options);
			if (req && req.oncomplete) {
				req.oncomplete(null);
			}
		} catch (err) {
			if (req && req.oncomplete) {
				req.oncomplete(err);
			}
		}
	});
}

renameAsync(oldPath, newPath, req) {
	setImmediate(() => {
		try {
			this.renameSync(oldPath, newPath);
			if (req && req.oncomplete) {
				req.oncomplete(null);
			}
		} catch (err) {
			if (req && req.oncomplete) {
				req.oncomplete(err);
			}
		}
	});
}
	
}

export function promiseFromSync(syncFn) {
	return new Promise((resolve, reject) => {
		try {
			resolve(syncFn());
		} catch (err) {
			reject(err);
		}
	});
}

// Helper functions
function extractEncoding(options) {
	if (!options) return null;
	if (typeof options === 'string') return options;
	if (typeof options === 'object' && 'encoding' in options) {
		return options.encoding;
	}
	return null;
}

function toUint8Array(data, encoding) {
	if (data instanceof Uint8Array) {
		return data;
	}
	if (typeof data === 'string') {
		if (typeof Buffer !== 'undefined') {
			return Buffer.from(data, encoding || 'utf8');
		}
		// Fallback for environments without Buffer
		const encoder = new TextEncoder();
		return encoder.encode(data);
	}
	if (ArrayBuffer.isView(data)) {
		return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
	}
	throw new Error('Invalid data type');
}

function fromUint8Array(data, encoding) {
	if (!encoding) return data;
	if (typeof Buffer !== 'undefined') {
		return Buffer.from(data).toString(encoding);
	}
	// Fallback for environments without Buffer
	const decoder = new TextDecoder(encoding);
	return decoder.decode(data);
}

function cloneBuffer(buffer) {
	const clone = new Uint8Array(buffer.length);
	clone.set(buffer);
	return clone;
}
