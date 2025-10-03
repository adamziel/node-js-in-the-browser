"use strict";

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
        return false;
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
		if (this.fd !== undefined) {
			this.fs.closeSync(this.fd);
			this.fd = undefined;
		}
	}

	read(buffer, offset, length, position) {
		if (this.fd === undefined) {
			throw new Error('EBADF: bad file descriptor, read');
		}
		return this.fs.readSync(this.fd, buffer, offset, length, position);
	}

	write(buffer, offset, length, position) {
		if (this.fd === undefined) {
			throw new Error('EBADF: bad file descriptor, write');
		}
		return this.fs.writeSync(this.fd, buffer, offset, length, position);
	}

	writev(buffers, position) {
		if (this.fd === undefined) {
			throw new Error('EBADF: bad file descriptor, writev');
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
			throw new Error('EBADF: bad file descriptor, readv');
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
			throw new Error('EBADF: bad file descriptor, fstat');
		}
		const openFile = this.fs.openFiles.get(this.fd);
		if (!openFile) {
			throw new Error('EBADF: bad file descriptor, fstat');
		}
		return new Stats(openFile.node);
	}

	truncate(len = 0) {
		if (this.fd === undefined) {
			throw new Error('EBADF: bad file descriptor, ftruncate');
		}
		return this.fs.ftruncateSync(this.fd, len);
	}

	utimes(atime, mtime) {
		if (this.fd === undefined) {
			throw new Error('EBADF: bad file descriptor, futimes');
		}
		return this.fs.futimesSync(this.fd, atime, mtime);
	}

	chmod(mode) {
		if (this.fd === undefined) {
			throw new Error('EBADF: bad file descriptor, fchmod');
		}
		const openFile = this.fs.openFiles.get(this.fd);
		if (!openFile) {
			throw new Error('EBADF: bad file descriptor, fchmod');
		}
		openFile.node.mode = mode;
	}

	chown(uid, gid) {
		if (this.fd === undefined) {
			throw new Error('EBADF: bad file descriptor, fchown');
		}
		// No-op in browser environment, but don't throw
	}

	datasync() {
		if (this.fd === undefined) {
			throw new Error('EBADF: bad file descriptor, fdatasync');
		}
		// No-op in memory filesystem (always synced)
	}

	sync() {
		if (this.fd === undefined) {
			throw new Error('EBADF: bad file descriptor, fsync');
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
                    throw new Error(`ENOENT: no such file or directory, mkdir '${path}'`);
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
                throw new Error(`ENOTDIR: not a directory, mkdir '${path}'`);
            }
            current = next;
        }
        if (!recursive && !createdAny) {
            throw new Error(`EEXIST: file already exists, mkdir '${path}'`);
        }
        return firstCreatedPath;
    }
    readFileSync(path, options) {
        const { node, blockedBy, missingParent } = this.walk(path);
        if (missingParent) {
            throw new Error(`ENOENT: no such file or directory, open '${path}'`);
        }
        if (blockedBy) {
            throw new Error(`ENOTDIR: not a directory, open '${path}'`);
        }
        if (!node || node.type !== 'file') {
            throw new Error(`ENOENT: no such file or directory, open '${path}'`);
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
            throw new Error(`ENOTDIR: not a directory, open '${path}'`);
        }
        if (result.missingParent) {
            throw new Error(`ENOENT: no such file or directory, open '${path}'`);
        }
        if (!result.parent) {
            throw new Error(`EISDIR: illegal operation on a directory, open '${path}'`);
        }
        const { parent, node, name } = result;
        if (node && node.type === 'dir') {
            throw new Error(`EISDIR: illegal operation on a directory, open '${path}'`);
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
            throw new Error(`ENOENT: no such file or directory, scandir '${path}'`);
        }
        if (blockedBy) {
            throw new Error(`ENOTDIR: not a directory, scandir '${path}'`);
        }
        if (!node) {
            throw new Error(`ENOENT: no such file or directory, scandir '${path}'`);
        }
        if (node.type !== 'dir') {
            throw new Error(`ENOTDIR: not a directory, scandir '${path}'`);
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
        return entries;
    }
    statSync(path) {
        const { node, blockedBy, missingParent } = this.walk(path);
        if (missingParent) {
            throw new Error(`ENOENT: no such file or directory, stat '${path}'`);
        }
        if (blockedBy) {
            throw new Error(`ENOTDIR: not a directory, stat '${path}'`);
        }
        if (!node) {
            throw new Error(`ENOENT: no such file or directory, stat '${path}'`);
        }
        return new Stats(node);
    }
    lstatSync(path) {
        return this.statSync(path);
    }
    unlinkSync(path) {
        const result = this.walk(path);
        const { parent, node, name, blockedBy, missingParent } = result;
        if (missingParent) {
            throw new Error(`ENOENT: no such file or directory, unlink '${path}'`);
        }
        if (blockedBy) {
            throw new Error(`ENOTDIR: not a directory, unlink '${path}'`);
        }
        if (!node) {
            throw new Error(`ENOENT: no such file or directory, unlink '${path}'`);
        }
        if (node.type !== 'file') {
            throw new Error(`EPERM: operation not permitted, unlink '${path}'`);
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
            throw new Error(`ENOENT: no such file or directory, rmdir '${path}'`);
        }
        if (blockedBy) {
            throw new Error(`ENOTDIR: not a directory, rmdir '${path}'`);
        }
        if (!node) {
            throw new Error(`ENOENT: no such file or directory, rmdir '${path}'`);
        }
        if (node.type !== 'dir') {
            throw new Error(`ENOTDIR: not a directory, rmdir '${path}'`);
        }
        const recursive = (_a = options === null || options === void 0 ? void 0 : options.recursive) !== null && _a !== void 0 ? _a : false;
        if (!recursive && node.children.size > 0) {
            throw new Error(`ENOTEMPTY: directory not empty, rmdir '${path}'`);
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
            throw new Error(`ENOENT: no such file or directory, rm '${path}'`);
        }
        if (blockedBy) {
            throw new Error(`ENOTDIR: not a directory, rm '${path}'`);
        }
        if (!node) {
            if (options === null || options === void 0 ? void 0 : options.force) {
                return;
            }
            throw new Error(`ENOENT: no such file or directory, rm '${path}'`);
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
            throw new Error(`ENOENT: no such file or directory, rename '${oldPath}'`);
        }
        if (!oldResult.parent) {
            throw new Error(`EPERM: operation not permitted, rename '${oldPath}'`);
        }
        const newResult = this.walk(newPath);
        if (newResult.blockedBy) {
            throw new Error(`ENOTDIR: not a directory, rename '${newPath}'`);
        }
        if (newResult.missingParent) {
            throw new Error(`ENOENT: no such file or directory, rename '${newPath}'`);
        }
        if (newResult.node) {
            throw new Error(`EEXIST: file already exists, rename '${newPath}'`);
        }
        if (!newResult.parent) {
            throw new Error(`ENOENT: no such file or directory, rename '${newPath}'`);
        }
        oldResult.parent.children.delete(oldResult.name);
        newResult.parent.children.set(newResult.name, oldResult.node);
        updateDirectoryTimestamp(oldResult.parent);
        updateDirectoryTimestamp(newResult.parent);
    }
    copyFileSync(src, dest) {
        const { node, blockedBy, missingParent } = this.walk(src);
        if (missingParent || blockedBy) {
            throw new Error(`ENOENT: no such file or directory, copy '${src}'`);
        }
        if (!node || node.type !== 'file') {
            throw new Error(`ENOENT: no such file or directory, copy '${src}'`);
        }
        this.writeFileSync(dest, cloneBuffer(node.content));
    }
    appendFileSync(path, data, options) {
        var _a;
        const encoding = (_a = extractEncoding(options)) !== null && _a !== void 0 ? _a : (typeof data === 'string' ? 'utf8' : null);
        const bytes = toUint8Array(data, encoding);
        const { parent, node, name, blockedBy, missingParent } = this.walk(path);
        if (blockedBy) {
            throw new Error(`ENOTDIR: not a directory, open '${path}'`);
        }
        if (missingParent) {
            throw new Error(`ENOENT: no such file or directory, open '${path}'`);
        }
        if (!parent) {
            // This case should ideally not be hit for a valid non-root path
            throw new Error(`EACCES: permission denied, open '${path}'`);
        }
        if (node) {
            if (node.type === 'dir') {
                throw new Error(`EISDIR: illegal operation on a directory, open '${path}'`);
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
            throw new Error(`ENOTDIR: not a directory, open '${path}'`);
        }
        if (existingNode && existingNode.type === 'dir') {
            throw new Error(`EISDIR: illegal operation on a directory, open '${path}'`);
        }
        const f = parseOpenFlags(flags);
        let fileNode;
        if (existingNode) {
            if (existingNode.type !== 'file') {
                throw new Error(`EISDIR: illegal operation on a directory, open '${path}'`);
            }
            fileNode = existingNode;
            if (f.truncate) {
                fileNode.content = new Uint8Array(0);
                updateTimestamps(fileNode, 'modify');
            }
            if (f.exclusive && f.create) {
                throw new Error(`EEXIST: file already exists, open '${path}'`);
            }
        }
        else {
            if (!parent) {
                throw new Error(`EACCES: permission denied, open '${path}'`);
            }
            if (!f.create) {
                // need existing file for read or write without create
                if (missingParent || !parent.children.has(name)) {
                    throw new Error(`ENOENT: no such file or directory, open '${path}'`);
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
		const FileHandle = globalThis.coreModules["fs"].FileHandle;
		const fd = this.openSync(path, flags, mode);
		const internalHandle = new InternalFileHandle(fd, this);
		const handle = new FileHandle(internalHandle);
		if(usePromises === globalThis.internalModules.fs.kUsePromises) {
			return new Promise((resolve, reject) => {
				resolve(handle);
			});
		}
		return handle;
	}
    closeSync(fd) {
        if (!this.openFiles.has(fd)) {
            throw new Error(`EBADF: bad file descriptor, close`);
        }
        this.openFiles.delete(fd);
    }
    readSync(fd, buffer, offset, length, position) {
        const openFile = this.openFiles.get(fd);
        if (!openFile) {
            throw new Error(`EBADF: bad file descriptor, read`);
        }
        const readPosition = position !== null && position !== undefined
            ? position
            : openFile.position;
        const { node: fileNode } = openFile;
        const availableBytes = Math.max(0, fileNode.content.length - readPosition);
        const bytesToRead = Math.min(length, availableBytes);
        if (bytesToRead > 0) {
            buffer.set(fileNode.content.subarray(readPosition, readPosition + bytesToRead), offset);
            if (position === null || position === undefined) {
                openFile.position = readPosition + bytesToRead;
            }
        }
        updateTimestamps(fileNode, 'access');
        return bytesToRead;
    }
    writeSync(fd, data, offsetOrPos, lengthOrEnc, position) {
        var _a, _b;
        const openFile = this.openFiles.get(fd);
        if (!openFile) {
            throw new Error(`EBADF: bad file descriptor, write`);
        }
        let buffer;
        let writePosition;
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
        if (writePosition === null || writePosition === undefined) {
            writePosition = openFile.position;
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
        openFile.position = writePosition + buffer.length;
        updateTimestamps(fileNode, 'modify');
        return buffer.length;
    }
    truncateSync(path, len = 0) {
        const { node, blockedBy, missingParent } = this.walk(path);
        if (missingParent || !node) {
            throw new Error(`ENOENT: no such file or directory, truncate '${path}'`);
        }
        if (blockedBy || node.type !== 'file') {
            throw new Error(`EISDIR: illegal operation on a directory, truncate '${path}'`);
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
            throw new Error(`EBADF: bad file descriptor, ftruncate`);
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
            throw new Error(`ENOENT: no such file or directory, utimes '${path}'`);
        }
        if (blockedBy) {
            throw new Error(`ENOTDIR: not a directory, utimes '${path}'`);
        }
        node.atime = atime;
        node.mtime = mtime;
        node.ctime = Date.now();
    }
    futimesSync(fd, atime, mtime) {
        const openFile = this.openFiles.get(fd);
        if (!openFile) {
            throw new Error(`EBADF: bad file descriptor, futimes`);
        }
        const node = openFile.node;
        node.atime = atime;
        node.mtime = mtime;
        node.ctime = Date.now();
    }
    linkSync(existingPath, newPath) {
        const src = this.walk(existingPath);
        if (!src.node) {
            throw new Error(`ENOENT: no such file or directory, link '${existingPath}'`);
        }
        if (src.node.type !== 'file') {
            throw new Error(`EPERM: operation not permitted, link '${existingPath}'`);
        }
        const dst = this.walk(newPath);
        if (dst.blockedBy) {
            throw new Error(`ENOTDIR: not a directory, link '${newPath}'`);
        }
        if (dst.missingParent || !dst.parent) {
            throw new Error(`ENOENT: no such file or directory, link '${newPath}'`);
        }
        if (dst.node) {
            throw new Error(`EEXIST: file already exists, link '${newPath}'`);
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
                throw new Error(`EMFILE: too many mkdtemp attempts for prefix '${prefix}'`);
            }
        } while (this.existsSync(candidate));
        this.mkdirSync(candidate);
        return candidate;
	}
	
	writeBuffer(fd, buffer, offset, length, position, unused, ctx) {
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

			// Store result in context
			if (ctx !== undefined) {
				// ctx.errno = 0;
				// ctx.bytesWritten = bufferToWrite.length;
			}
			return bufferToWrite.length;
		} catch (err) {
			if(ctx !== undefined) {
				// ctx.errno = -1;
				// ctx.error = err.message;
			}
			console.error(err);
			return -1;
		}
	}

	writeFileUtf8(path, data, mode) {
		try {
			// Convert string to UTF-8 bytes
			const bytes = toUint8Array(data, 'utf8');
			
			const result = this.walk(path);
			if (result.blockedBy) {
				throw new Error(`ENOTDIR: not a directory, open '${path}'`);
			}
			if (result.missingParent) {
				throw new Error(`ENOENT: no such file or directory, open '${path}'`);
			}
			if (!result.parent) {
				throw new Error(`EISDIR: illegal operation on a directory, open '${path}'`);
			}

			const { parent, node, name } = result;
			if (node && node.type === 'dir') {
				throw new Error(`EISDIR: illegal operation on a directory, open '${path}'`);
			}

			if (node && node.type === 'file') {
				// Update existing file
				node.content = bytes;
				if (mode !== undefined) {
					node.mode = mode;
				}
				updateTimestamps(node, 'modify');
				updateDirectoryTimestamp(parent);
				return;
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
