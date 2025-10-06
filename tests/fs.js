"use strict";
// Comprehensive tests for Node.js fs module covering sync, callback, and promise APIs.
const fs = require('fs');
const fsp = fs.promises;
const assert = require('assert');

const BASE = `/bin/__fs_tests__base__-${Date.now()}-${Math.random().toString(36).slice(2)}`;
fs.mkdirSync('/bin', { recursive: true });
fs.mkdirSync(BASE, { recursive: true });

const P = (...segments) => [BASE, ...segments].join('/');
const rnd = (len = 8) => Math.random().toString(36).slice(2, 2 + len);
const buf = (value) => typeof value === 'string' ? Buffer.from(value, 'utf8') : Buffer.from(value);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const ensureParent = (fullPath) => {
  const parts = fullPath.split('/');
  if (parts.length <= 1)
    return;
  const dir = parts.slice(0, -1).join('/');
  if (dir)
    fs.mkdirSync(dir, { recursive: true });
};
const writeFile = (relative, contents = '') => {
  const full = P(relative);
  ensureParent(full);
  fs.writeFileSync(full, contents);
  return full;
};
const rmrf = (p) => {
  try {
    if (typeof fs.rmSync === 'function')
      fs.rmSync(p, { recursive: true, force: true, maxRetries: 3 });
    else
      fs.rmdirSync(p, { recursive: true });
  }
  catch (_a) {
    // ignore cleanup issues
  }
};
const hasMethod = (obj, key) => !!obj && typeof obj[key] === 'function';
const itIfHas = (obj, key) => hasMethod(obj, key) ? it : it.skip;
const describeIfHas = (obj, key) => hasMethod(obj, key) ? describe : describe.skip;
const itIfHasAll = (obj, keys) => keys.every((key) => hasMethod(obj, key)) ? it : it.skip;
const itIfHasPromise = (key) => hasMethod(fsp, key) ? it : it.skip;
const itIfHasAllPromises = (keys) => keys.every((key) => hasMethod(fsp, key)) ? it : it.skip;
const isWindows = process.platform === 'win32';
const itPosix = isWindows ? it.skip : it;
const describePosix = isWindows ? describe.skip : describe;
const maybeSymlink = (title, handler) => {
  it(title, async function () {
    const target = P(`symlink-target-${rnd()}`);
    const link = P(`symlink-link-${rnd()}`);
    fs.writeFileSync(target, 'target');
    try {
      fs.symlinkSync(target, link, 'file');
    }
    catch (err) {
      fs.unlinkSync(target);
      if (err && (err.code === 'EPERM' || err.code === 'EACCES' || err.code === 'ENOTSUP' || err.code === 'EOPNOTSUPP')) {
        this.skip();
        return;
      }
      throw err;
    }
    try {
      await handler(target, link);
    }
    finally {
      try {
        fs.unlinkSync(link);
      }
      catch (_a) {
        // ignore
      }
      try {
        fs.unlinkSync(target);
      }
      catch (_b) {
        // ignore
      }
    }
  });
};
const usingFd = (relative, flags, fn) => {
  const full = P(relative);
  ensureParent(full);
  const fd = fs.openSync(full, flags);
  try {
    return fn(fd, full);
  }
  finally {
    fs.closeSync(fd);
  }
};
const usingFdAsync = (relative, flags) => new Promise((resolve, reject) => {
  const full = P(relative);
  ensureParent(full);
  fs.open(full, flags, (err, fd) => {
    if (err)
      reject(err);
    else
      resolve({ fd, path: full });
  });
});
const closeFdAsync = (fd) => new Promise((resolve, reject) => {
  fs.close(fd, (err) => {
    if (err)
      reject(err);
    else
      resolve();
  });
});
const usingHandle = async (relative, flags, fn) => {
  const full = P(relative);
  ensureParent(full);
  const handle = await fsp.open(full, flags);
  try {
    return await fn(handle, full);
  }
  finally {
    await handle.close();
  }
};
after(() => {
  rmrf(BASE);
});

describe('writeFile/readFile family', () => {
  it('writeFileSync supports Buffer, encoding, mode, and flags', () => {
    const file = P(`write-sync-${rnd()}.txt`);
    fs.writeFileSync(file, buf('alpha'), { mode: 0o640 });
    assert.strictEqual(fs.readFileSync(file).equals(buf('alpha')), true);
    fs.writeFileSync(file, 'beta', { encoding: 'utf8', flag: 'w' });
    assert.strictEqual(fs.readFileSync(file, 'utf8'), 'beta');
    const mode = fs.statSync(file).mode & 0o777;
    assert.ok((mode & 0o200) !== 0);
  });

  it('fs.writeFile callback respects mode and append flag', (done) => {
    const file = P(`write-cb-${rnd()}.txt`);
    fs.writeFile(file, 'first', { mode: 0o600 }, (err) => {
      assert.ifError(err);
      fs.writeFile(file, 'second', { flag: 'a', encoding: 'utf8' }, (err2) => {
        assert.ifError(err2);
        assert.strictEqual(fs.readFileSync(file, 'utf8'), 'firstsecond');
        const mode = fs.statSync(file).mode & 0o777;
        assert.ok((mode & 0o400) !== 0);
        done();
      });
    });
  });

  it('fsp.writeFile accepts TypedArray and optional AbortSignal', async function () {
    const file = P(`write-p-${rnd()}.bin`);
    const data = new Uint8Array([1, 2, 3, 4]);
    await fsp.writeFile(file, data);
    const out = await fsp.readFile(file);
    assert.deepStrictEqual(Array.from(out), [1, 2, 3, 4]);

    if (typeof globalThis.AbortController !== 'function')
      return;
    const ac = new globalThis.AbortController();
    const pending = fsp.writeFile(file, 'x'.repeat(1 << 20), { signal: ac.signal });
    ac.abort();
    try {
      await assert.rejects(pending, { name: 'AbortError' });
    }
    catch (err) {
      if (err && err.code === 'ERR_INVALID_ARG_TYPE') {
        this.skip();
        return;
      }
      throw err;
    }
  });

  it('readFileSync returns Buffer by default and string with encoding', () => {
    const file = P(`read-sync-${rnd()}.txt`);
    fs.writeFileSync(file, 'content');
    const raw = fs.readFileSync(file);
    assert.ok(Buffer.isBuffer(raw));
    assert.strictEqual(raw.toString('utf8'), 'content');
    const text = fs.readFileSync(file, { encoding: 'utf8' });
    assert.strictEqual(text, 'content');
  });

  it('fs.readFile callback respects encoding and flags', (done) => {
    const file = P(`read-cb-${rnd()}.txt`);
    fs.writeFileSync(file, `line1
line2`);
    fs.readFile(file, { encoding: 'utf8', flag: 'r' }, (err, value) => {
      assert.ifError(err);
      assert.strictEqual(value, `line1
line2`);
      done();
    });
  });

  it('fsp.readFile honors encoding, flag, and AbortSignal', async function () {
    const file = P(`read-p-${rnd()}.txt`);
    fs.writeFileSync(file, 'payload');
    const text = await fsp.readFile(file, { encoding: 'utf8', flag: 'r' });
    assert.strictEqual(text, 'payload');

    if (typeof globalThis.AbortController !== 'function')
      return;
    const ac = new globalThis.AbortController();
    const pending = fsp.readFile(file, { signal: ac.signal });
    ac.abort();
    try {
      await assert.rejects(pending, { name: 'AbortError' });
    }
    catch (err) {
      if (err && err.code === 'ERR_INVALID_ARG_TYPE') {
        this.skip();
        return;
      }
      throw err;
    }
  });
});

describe('appendFile family', () => {
  it('appendFileSync appends strings and buffers', () => {
    const file = P(`append-sync-${rnd()}.txt`);
    fs.writeFileSync(file, 'start');
    fs.appendFileSync(file, ' middle');
    fs.appendFileSync(file, buf(' end'));
    assert.strictEqual(fs.readFileSync(file, 'utf8'), 'start middle end');
  });

  it('fs.appendFile callback creates files when missing', (done) => {
    const file = P(`append-cb-${rnd()}.txt`);
    fs.appendFile(file, 'first', (err) => {
      assert.ifError(err);
      fs.appendFile(file, 'second', (err2) => {
        assert.ifError(err2);
        assert.strictEqual(fs.readFileSync(file, 'utf8'), 'firstsecond');
        done();
      });
    });
  });

  it('fsp.appendFile supports TypedArray and flags', async () => {
    const file = P(`append-p-${rnd()}.txt`);
    await fsp.writeFile(file, 'A');
    await fsp.appendFile(file, new Uint8Array([66, 67]));
    await fsp.appendFile(file, '-done', { encoding: 'utf8', flag: 'a' });
    const text = await fsp.readFile(file, 'utf8');
    assert.strictEqual(text, 'ABC-done');
  });
});

describe('file descriptor read/write operations', () => {
  it('readSync and writeSync respect offsets and explicit positions', () => {
    const rel = `fd-sync-${rnd()}.bin`;
    let full;
    usingFd(rel, 'w+', (fd, path) => {
      full = path;
      fs.writeSync(fd, buf('abcdefgh'), 0, 8, 0);
      const segment = Buffer.alloc(3);
      const bytes = fs.readSync(fd, segment, 0, 3, 2);
      assert.strictEqual(bytes, 3);
      assert.strictEqual(segment.toString(), 'cde');
      const wrote = fs.writeSync(fd, buf('XYZ'), 0, 3, 4);
      assert.strictEqual(wrote, 3);
    });
    const contents = fs.readFileSync(full, 'utf8');
    assert.strictEqual(contents.slice(0, 7), 'abcdXYZ');
  });

  it('fs.read callback handles sequential reads with internal offset', (done) => {
    const file = P(`fd-read-cb-${rnd()}.txt`);
    fs.writeFileSync(file, 'abcdef');
    fs.open(file, fs.constants.O_RDONLY, (err, fd) => {
      assert.ifError(err);
      const first = Buffer.alloc(2);
      fs.read(fd, first, 0, 2, null, (err2, bytesRead1) => {
        assert.ifError(err2);
        assert.strictEqual(bytesRead1, 2);
        assert.strictEqual(first.toString(), 'ab');
        const second = Buffer.alloc(2);
        fs.read(fd, second, 0, 2, null, (err3, bytesRead2) => {
          assert.ifError(err3);
          assert.strictEqual(bytesRead2, 2);
          assert.strictEqual(second.toString(), 'cd');
          fs.close(fd, (err4) => {
            assert.ifError(err4);
            done();
          });
        });
      });
    });
  });

  it('fs.write callback writes buffers at explicit positions', (done) => {
    usingFdAsync(`fd-write-cb-${rnd()}.txt`, 'w+').then(({ fd, path }) => {
      fs.write(fd, buf('hello'), 0, 5, 0, (err, written) => {
        if (err) {
          closeFdAsync(fd).then(() => done(err), done);
          return;
        }
        assert.strictEqual(written, 5);
        fs.write(fd, buf(' world'), 0, 6, 5, (err2, written2) => {
          if (err2) {
            closeFdAsync(fd).then(() => done(err2), done);
            return;
          }
          assert.strictEqual(written2, 6);
          closeFdAsync(fd).then(() => {
            assert.strictEqual(fs.readFileSync(path, 'utf8'), 'hello world');
            done();
          }, done);
        });
      });
    }, done);
  });

  it('fsp.read and fsp.write support offsets and positions', async () => {
    let full;
    await usingHandle(`fd-promise-${rnd()}.txt`, 'w+', async (handle, path) => {
      full = path;
      await handle.write(buf('abcdefgh'), 0, 8, 0);
      const tmp = Buffer.alloc(3);
      const { bytesRead } = await handle.read(tmp, 0, 3, 2);
      assert.strictEqual(bytesRead, 3);
      assert.strictEqual(tmp.toString(), 'cde');
      const { bytesWritten } = await handle.write(buf('XYZ'), 0, 3, 4);
      assert.strictEqual(bytesWritten, 3);
      if (typeof handle.datasync === 'function')
        await handle.datasync();
      else if (typeof handle.sync === 'function')
        await handle.sync();
    });
    const contents = fs.readFileSync(full, 'utf8');
    assert.strictEqual(contents.slice(0, 7), 'abcdXYZ');
  });

  it('writevSync and readvSync handle multiple buffers', () => {
    usingFd(`fd-v-sync-${rnd()}.txt`, 'w+', (fd) => {
      const total = fs.writevSync(fd, [buf('AA'), buf('BB'), buf('CC')], 0);
      assert.strictEqual(total, 6);
      const buffers = [Buffer.alloc(2), Buffer.alloc(2), Buffer.alloc(2)];
      const read = fs.readvSync(fd, buffers, 0);
      assert.strictEqual(read, 6);
      assert.deepStrictEqual(buffers.map((b) => b.toString()), ['AA', 'BB', 'CC']);
    });
  });

  itIfHas(fs, 'readv')('fs.readv reads into multiple buffers', (done) => {
    usingFdAsync(`fd-readv-cb-${rnd()}.txt`, 'w+').then(({ fd }) => {
      fs.write(fd, buf('ABCDEFGH'), 0, 8, 0, (err) => {
        if (err) {
          closeFdAsync(fd).then(() => done(err), done);
          return;
        }
        const buffers = [Buffer.alloc(3), Buffer.alloc(3)];
        fs.readv(fd, buffers, 0, (err2, bytesRead, returned) => {
          if (err2) {
            closeFdAsync(fd).then(() => done(err2), done);
            return;
          }
          assert.strictEqual(bytesRead, 6);
          assert.strictEqual(returned[0].toString(), 'ABC');
          assert.strictEqual(returned[1].toString(), 'DEF');
          closeFdAsync(fd).then(() => done(), done);
        });
      });
    }, done);
  });

  itIfHas(fs, 'writev')('fs.writev writes multiple buffers', (done) => {
    usingFdAsync(`fd-writev-cb-${rnd()}.txt`, 'w+').then(({ fd, path }) => {
      fs.writev(fd, [buf('ABC'), buf('DEF')], 0, (err, bytesWritten) => {
        if (err) {
          closeFdAsync(fd).then(() => done(err), done);
          return;
        }
        assert.strictEqual(bytesWritten, 6);
        closeFdAsync(fd).then(() => {
          assert.strictEqual(fs.readFileSync(path, 'utf8'), 'ABCDEF');
          done();
        }, done);
      });
    }, done);
  });

  itIfHasAllPromises(['readv', 'writev'])('fs.promises readv/writev handle multiple buffers', async () => {
    await usingHandle(`fd-readv-p-${rnd()}.txt`, 'w+', async (handle) => {
      await handle.writev([buf('XY'), buf('ZA')], 0);
      const buffers = [Buffer.alloc(2), Buffer.alloc(2)];
      const result = await handle.readv(buffers, 0);
      assert.strictEqual(result.bytesRead, 4);
      assert.deepStrictEqual(result.buffers.map((b) => b.toString()), ['XY', 'ZA']);
    });
  });

  it('operations on closed descriptor fail with EBADF', () => {
    const fd = fs.openSync(P(`fd-ebadf-${rnd()}.txt`), 'w');
    fs.closeSync(fd);
    const target = Buffer.alloc(1);
    assert.throws(() => fs.readSync(fd, target, 0, 1, 0), { code: 'EBADF' });
  });
});

describe('descriptor metadata and flushing', () => {
  it('fstatSync returns Stats with numeric fields', () => {
    usingFd(`fstat-sync-${rnd()}.txt`, 'w+', (fd) => {
      fs.writeSync(fd, buf('stat'), 0, 4, 0);
      const stats = fs.fstatSync(fd);
      assert.strictEqual(stats.isFile(), true);
      assert.ok(typeof stats.size === 'number');
      assert.ok(stats.mtime instanceof Date);
    });
  });

  it('fs.fstat callback returns Stats', (done) => {
    usingFdAsync(`fstat-cb-${rnd()}.txt`, 'w+').then(({ fd }) => {
      fs.fstat(fd, (err, stats) => {
        if (err) {
          closeFdAsync(fd).then(() => done(err), done);
          return;
        }
        assert.strictEqual(stats.isFile(), true);
        closeFdAsync(fd).then(() => done(), done);
      });
    }, done);
  });

  it('fsp.fstat resolves Stats', async () => {
    const { fd } = await usingFdAsync(`fstat-p-${rnd()}.txt`, 'w+');
    try {
      const stats = await fsp.fstat(fd);
      assert.strictEqual(stats.isFile(), true);
    }
    finally {
      await closeFdAsync(fd);
    }
  });

  it('fs.ftruncateSync shrinks file size', () => {
    let full;
    usingFd(`ftruncate-sync-${rnd()}.txt`, 'w+', (fd, path) => {
      full = path;
      fs.writeSync(fd, buf('123456'), 0, 6, 0);
      fs.ftruncateSync(fd, 3);
    });
    assert.strictEqual(fs.statSync(full).size, 3);
  });

  it('fs.ftruncate callback reduces file size', (done) => {
    usingFdAsync(`ftruncate-cb-${rnd()}.txt`, 'w+').then(({ fd, path }) => {
      fs.write(fd, buf('abcdef'), 0, 6, 0, (err) => {
        if (err) {
          closeFdAsync(fd).then(() => done(err), done);
          return;
        }
        fs.ftruncate(fd, 2, (err2) => {
          if (err2) {
            closeFdAsync(fd).then(() => done(err2), done);
            return;
          }
          closeFdAsync(fd).then(() => {
            assert.strictEqual(fs.statSync(path).size, 2);
            done();
          }, done);
        });
      });
    }, done);
  });

  it('fsp.ftruncate shrinks files', async () => {
    const { fd, path } = await usingFdAsync(`ftruncate-p-${rnd()}.txt`, 'w+');
    try {
      await fsp.write(fd, buf('ABCDEFG'), 0, 7, 0);
      await fsp.ftruncate(fd, 4);
    }
    finally {
      await closeFdAsync(fd);
    }
    assert.strictEqual(fs.statSync(path).size, 4);
  });

  it('fs.fsyncSync and fs.fsync flush descriptors', (done) => {
    usingFdAsync(`fsync-${rnd()}.txt`, 'w+').then(({ fd }) => {
      fs.write(fd, buf('data'), 0, 4, 0, (err) => {
        if (err) {
          closeFdAsync(fd).then(() => done(err), done);
          return;
        }
        fs.fsyncSync(fd);
        fs.fsync(fd, (err2) => {
          closeFdAsync(fd).then(() => done(err2), done);
        });
      });
    }, done);
  });

  itIfHas(fs, 'fdatasync')('fs.fdatasync flushes data', (done) => {
    usingFdAsync(`fdatasync-cb-${rnd()}.txt`, 'w+').then(({ fd }) => {
      fs.write(fd, buf('data'), 0, 4, 0, (err) => {
        if (err) {
          closeFdAsync(fd).then(() => done(err), done);
          return;
        }
        fs.fdatasync(fd, (err2) => {
          closeFdAsync(fd).then(() => done(err2), done);
        });
      });
    }, done);
  });

  itIfHas(fs, 'fdatasyncSync')('fs.fdatasyncSync flushes data', () => {
    usingFd(`fdatasync-sync-${rnd()}.txt`, 'w+', (fd) => {
      fs.writeSync(fd, buf('data'), 0, 4, 0);
      fs.fdatasyncSync(fd);
    });
  });
});

describe('stat and lstat family', () => {
  it('statSync returns Stats with helpers', () => {
    const file = writeFile(`stat-sync-${rnd()}.txt`, 'x');
    const stats = fs.statSync(file);
    assert.strictEqual(stats.isFile(), true);
    assert.ok(stats.size >= 1);
  });

  it('statSync supports bigint option', () => {
    const file = writeFile(`stat-big-${rnd()}.txt`, 'x');
    const stats = fs.statSync(file, { bigint: true });
    assert.strictEqual(typeof stats.size, 'bigint');
  });

  it('statSync with throwIfNoEntry:false returns undefined for missing path', () => {
    const missing = P(`stat-missing-${rnd()}.txt`);
    const stats = fs.statSync(missing, { throwIfNoEntry: false });
    assert.strictEqual(stats, undefined);
  });

  it('fs.stat callback returns Stats', (done) => {
    const file = writeFile(`stat-cb-${rnd()}.txt`, 'cb');
    fs.stat(file, (err, stats) => {
      assert.ifError(err);
      assert.strictEqual(stats.isFile(), true);
      done();
    });
  });

  it('fsp.stat returns Stats', async () => {
    const file = writeFile(`stat-p-${rnd()}.txt`, 'p');
    const stats = await fsp.stat(file);
    assert.strictEqual(stats.isFile(), true);
  });

  maybeSymlink('lstat identifies symlink separately from stat', async (target, link) => {
    const lstat = fs.lstatSync(link);
    const stat = fs.statSync(link);
    assert.strictEqual(lstat.isSymbolicLink(), true);
    assert.strictEqual(stat.isFile(), true);
    assert.strictEqual(fs.readFileSync(link, 'utf8'), 'target');
  });

  itIfHasPromise('lstat')('fsp.lstat returns Stats', async () => {
    const file = writeFile(`stat-lstat-${rnd()}.txt`, 'x');
    const stats = await fsp.lstat(file);
    assert.strictEqual(stats.isFile(), true);
  });

  itIfHas(fs, 'statfsSync')('statfsSync returns filesystem information', () => {
    const info = fs.statfsSync(BASE);
    assert.ok(info);
    assert.ok(typeof info.type === 'number' || typeof info.type === 'bigint');
  });

  itIfHasPromise('statfs')('fsp.statfs returns filesystem information', async () => {
    const info = await fsp.statfs(BASE);
    assert.ok(info);
    assert.ok(typeof info.blocks === 'number' || typeof info.blocks === 'bigint');
  });
});

describePosix('permissions', () => {
  it('chmodSync sets permissions', () => {
    const file = writeFile(`chmod-sync-${rnd()}.sh`, 'echo');
    fs.chmodSync(file, 0o754);
    const mode = fs.statSync(file).mode & 0o777;
    assert.strictEqual(mode, 0o754);
  });

  it('fs.chmod callback updates permissions', (done) => {
    const file = writeFile(`chmod-cb-${rnd()}.txt`, 'x');
    fs.chmod(file, 0o640, (err) => {
      assert.ifError(err);
      const mode = fs.statSync(file).mode & 0o777;
      assert.strictEqual(mode, 0o640);
      done();
    });
  });

  it('fsp.chmod updates permissions', async () => {
    const file = writeFile(`chmod-p-${rnd()}.txt`, 'p');
    await fsp.chmod(file, 0o600);
    const mode = fs.statSync(file).mode & 0o777;
    assert.strictEqual(mode, 0o600);
  });

  it('fchmodSync updates permissions via descriptor', () => {
    usingFd(`fchmod-sync-${rnd()}.txt`, 'w+', (fd) => {
      fs.fchmodSync(fd, 0o700);
      const mode = fs.fstatSync(fd).mode & 0o777;
      assert.strictEqual(mode, 0o700);
    });
  });

  it('fs.fchmod callback updates descriptor permissions', (done) => {
    usingFdAsync(`fchmod-cb-${rnd()}.txt`, 'w+').then(({ fd }) => {
      fs.fchmod(fd, 0o744, (err) => {
        if (err) {
          closeFdAsync(fd).then(() => done(err), done);
          return;
        }
        const mode = fs.fstatSync(fd).mode & 0o777;
        assert.strictEqual(mode, 0o744);
        closeFdAsync(fd).then(() => done(), done);
      });
    }, done);
  });

  itIfHasPromise('fchmod')('fsp.fchmod updates descriptor permissions', async () => {
    const { fd } = await usingFdAsync(`fchmod-p-${rnd()}.txt`, 'w+');
    try {
      await fsp.fchmod(fd, 0o755);
      const mode = fs.fstatSync(fd).mode & 0o777;
      assert.strictEqual(mode, 0o755);
    }
    finally {
      await closeFdAsync(fd);
    }
  });
});

describe('directory management', () => {
  it('mkdirSync creates nested directories with recursive flag', () => {
    const nested = P(`dirs/${rnd()}/sub/deeper`);
    fs.mkdirSync(nested, { recursive: true });
    assert.strictEqual(fs.statSync(nested).isDirectory(), true);
  });

  it('fs.mkdir callback handles recursive creation and mode', (done) => {
    const nested = P(`dirs-cb/${rnd()}/a/b`);
    fs.mkdir(nested, { recursive: true, mode: 0o750 }, (err) => {
      assert.ifError(err);
      const mode = fs.statSync(nested).mode & 0o777;
      assert.ok((mode & 0o400) !== 0);
      done();
    });
  });

  it('fsp.mkdir returns created path when recursive', async () => {
    const nested = P(`dirs-p/${rnd()}/child`);
    const created = await fsp.mkdir(nested, { recursive: true });
    assert.ok(created === undefined || typeof created === 'string');
    const second = await fsp.mkdir(nested, { recursive: true });
    assert.strictEqual(second, undefined);
    assert.strictEqual(fs.existsSync(nested), true);
  });

  it('mkdtempSync creates unique directories', () => {
    const prefix = P(`mkdtemp-sync-${rnd()}-`);
    const dir1 = fs.mkdtempSync(prefix);
    const dir2 = fs.mkdtempSync(prefix);
    assert.notStrictEqual(dir1, dir2);
    fs.rmdirSync(dir1);
    fs.rmdirSync(dir2);
  });

  it('fs.mkdtemp callback creates unique directories', (done) => {
    const prefix = P(`mkdtemp-cb-${rnd()}-`);
    fs.mkdtemp(prefix, (err, dir) => {
      assert.ifError(err);
      assert.ok(dir.startsWith(prefix));
      fs.rmdir(dir, (rmErr) => {
        assert.ifError(rmErr);
        done();
      });
    });
  });

  it('fsp.mkdtemp creates unique directories', async () => {
    const prefix = P(`mkdtemp-p-${rnd()}-`);
    const dir = await fsp.mkdtemp(prefix);
    assert.ok(dir.startsWith(prefix));
    if (typeof fsp.rm === 'function')
      await fsp.rm(dir, { recursive: true, force: true });
    else
      await fsp.rmdir(dir);
  });

  it('readdirSync supports encoding and withFileTypes', () => {
    const dir = P(`readdir-sync-${rnd()}`);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(`${dir}/file.txt`, 'x');
    fs.mkdirSync(`${dir}/sub`);
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    assert.strictEqual(entries.some((e) => e.isFile() && e.name === 'file.txt'), true);
    assert.strictEqual(entries.some((e) => e.isDirectory() && e.name === 'sub'), true);
    const names = fs.readdirSync(dir, { encoding: 'utf8' });
    assert.ok(Array.isArray(names));
  });

  it('fs.readdir callback returns Dirent objects when requested', (done) => {
    const dir = P(`readdir-cb-${rnd()}`);
    fs.mkdirSync(dir);
    fs.writeFileSync(`${dir}/a.txt`, 'x');
    fs.readdir(dir, { withFileTypes: true }, (err, items) => {
      assert.ifError(err);
      assert.strictEqual(items.some((d) => d.isFile() && d.name === 'a.txt'), true);
      done();
    });
  });

  it('fsp.readdir returns Dirent array', async () => {
    const dir = P(`readdir-p-${rnd()}`);
    fs.mkdirSync(dir);
    fs.writeFileSync(`${dir}/b.txt`, 'x');
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    assert.strictEqual(entries.some((d) => d.name === 'b.txt'), true);
  });

  it('opendirSync iterates entries', () => {
    const dir = P(`opendir-sync-${rnd()}`);
    fs.mkdirSync(dir);
    fs.writeFileSync(`${dir}/file.txt`, 'x');
    fs.mkdirSync(`${dir}/folder`);
    const handle = fs.opendirSync(dir);
    const names = [];
    let entry;
    while ((entry = handle.readSync()) !== null)
      names.push(entry.name);
    handle.closeSync();
    assert.ok(names.includes('file.txt'));
    assert.ok(names.includes('folder'));
  });

  it('fs.opendir callback reads entries', (done) => {
    const dir = P(`opendir-cb-${rnd()}`);
    fs.mkdirSync(dir);
    fs.writeFileSync(`${dir}/file.txt`, 'x');
    fs.opendir(dir, (err, dirHandle) => {
      assert.ifError(err);
      dirHandle.read((err2, entry) => {
        assert.ifError(err2);
        assert.ok(entry);
        dirHandle.close((err3) => {
          assert.ifError(err3);
          done();
        });
      });
    });
  });

  it('fsp.opendir async iterator yields entries', async () => {
    const dir = P(`opendir-p-${rnd()}`);
    fs.mkdirSync(dir);
    fs.writeFileSync(`${dir}/one.txt`, '1');
    fs.writeFileSync(`${dir}/two.txt`, '2');
    const handle = await fsp.opendir(dir);
    const names = [];
    for await (const entry of handle)
      names.push(entry.name);
    await handle.close();
    assert.ok(names.includes('one.txt'));
    assert.ok(names.includes('two.txt'));
  });
});

describe('copy, move, and linking', () => {
  it('renameSync moves files', () => {
    const src = writeFile(`rename-sync-${rnd()}.txt`, 'data');
    const dest = P(`rename-sync-dest-${rnd()}.txt`);
    fs.renameSync(src, dest);
    assert.strictEqual(fs.readFileSync(dest, 'utf8'), 'data');
    assert.strictEqual(fs.existsSync(src), false);
  });

  it('fs.rename callback moves files', (done) => {
    const src = writeFile(`rename-cb-${rnd()}.txt`, 'cb');
    const dest = P(`rename-cb-dest-${rnd()}.txt`);
    fs.rename(src, dest, (err) => {
      assert.ifError(err);
      assert.strictEqual(fs.readFileSync(dest, 'utf8'), 'cb');
      done();
    });
  });

  it('fsp.rename moves files', async () => {
    const src = writeFile(`rename-p-${rnd()}.txt`, 'promise');
    const dest = P(`rename-p-dest-${rnd()}.txt`);
    await fsp.rename(src, dest);
    assert.strictEqual(await fsp.readFile(dest, 'utf8'), 'promise');
  });

  it('copyFileSync copies files and COPYFILE_EXCL blocks overwrite', () => {
    const src = writeFile(`copy-sync-${rnd()}.txt`, 'copy');
    const dest = P(`copy-sync-dest-${rnd()}.txt`);
    fs.copyFileSync(src, dest);
    assert.strictEqual(fs.readFileSync(dest, 'utf8'), 'copy');
    assert.throws(() => fs.copyFileSync(src, dest, fs.constants.COPYFILE_EXCL), { code: 'EEXIST' });
  });

  it('fs.copyFile callback copies files', (done) => {
    const src = writeFile(`copy-cb-${rnd()}.txt`, 'cb');
    const dest = P(`copy-cb-dest-${rnd()}.txt`);
    fs.copyFile(src, dest, (err) => {
      assert.ifError(err);
      assert.strictEqual(fs.readFileSync(dest, 'utf8'), 'cb');
      done();
    });
  });

  it('fsp.copyFile copies files', async () => {
    const src = writeFile(`copy-p-${rnd()}.txt`, 'promise');
    const dest = P(`copy-p-dest-${rnd()}.txt`);
    await fsp.copyFile(src, dest);
    assert.strictEqual(await fsp.readFile(dest, 'utf8'), 'promise');
  });

  itIfHas(fs, 'cpSync')('cpSync recursively copies directories', () => {
    const src = P(`cp-sync-src-${rnd()}`);
    fs.mkdirSync(`${src}/sub`, { recursive: true });
    fs.writeFileSync(`${src}/sub/file.txt`, 'cp');
    const dest = P(`cp-sync-dest-${rnd()}`);
    fs.cpSync(src, dest, { recursive: true });
    assert.strictEqual(fs.readFileSync(`${dest}/sub/file.txt`, 'utf8'), 'cp');
  });

  itIfHas(fs, 'cp')('fs.cp callback recursively copies directories', (done) => {
    const src = P(`cp-cb-src-${rnd()}`);
    fs.mkdirSync(`${src}/nested`, { recursive: true });
    fs.writeFileSync(`${src}/nested/file.txt`, 'cp');
    const dest = P(`cp-cb-dest-${rnd()}`);
    fs.cp(src, dest, { recursive: true }, (err) => {
      assert.ifError(err);
      assert.strictEqual(fs.readFileSync(`${dest}/nested/file.txt`, 'utf8'), 'cp');
      done();
    });
  });

  itIfHasPromise('cp')('fsp.cp recursively copies directories', async () => {
    const src = P(`cp-p-src-${rnd()}`);
    fs.mkdirSync(`${src}/nested`, { recursive: true });
    fs.writeFileSync(`${src}/nested/file.txt`, 'cp');
    const dest = P(`cp-p-dest-${rnd()}`);
    await fsp.cp(src, dest, { recursive: true });
    assert.strictEqual(await fsp.readFile(`${dest}/nested/file.txt`, 'utf8'), 'cp');
  });

  it('linkSync creates hard links', () => {
    const src = writeFile(`link-sync-${rnd()}.txt`, 'hard');
    const dest = P(`link-sync-dest-${rnd()}.txt`);
    fs.linkSync(src, dest);
    fs.unlinkSync(src);
    assert.strictEqual(fs.readFileSync(dest, 'utf8'), 'hard');
  });

  it('fs.link callback creates hard links', (done) => {
    const src = writeFile(`link-cb-${rnd()}.txt`, 'cb');
    const dest = P(`link-cb-dest-${rnd()}.txt`);
    fs.link(src, dest, (err) => {
      assert.ifError(err);
      fs.unlinkSync(src);
      assert.strictEqual(fs.readFileSync(dest, 'utf8'), 'cb');
      done();
    });
  });

  it('fsp.link creates hard links', async () => {
    const src = writeFile(`link-p-${rnd()}.txt`, 'promise');
    const dest = P(`link-p-dest-${rnd()}.txt`);
    await fsp.link(src, dest);
    await fsp.unlink(src);
    assert.strictEqual(await fsp.readFile(dest, 'utf8'), 'promise');
  });

  maybeSymlink('readlinkSync and realpathSync resolve symlinks', async (target, link) => {
    const readlink = fs.readlinkSync(link);
    assert.ok(typeof readlink === 'string' && readlink.length > 0);
    const rp = fs.realpathSync(link);
    assert.ok(rp.endsWith(target));
    assert.strictEqual(fs.readFileSync(link, 'utf8'), 'target');
  });

  maybeSymlink('fs.readlink callback resolves symlink path', async (_target, link) => {
    await new Promise((resolve, reject) => {
      fs.readlink(link, (err, result) => {
        if (err)
          reject(err);
        else {
          assert.ok(result.length > 0);
          resolve();
        }
      });
    });
  });

  maybeSymlink('fsp.readlink resolves symlink path', async (_target, link) => {
    const result = await fsp.readlink(link);
    assert.ok(typeof result === 'string' && result.length > 0);
  });

  it('fs.symlink callback creates symbolic links', function (done) {
    const target = writeFile(`symlink-cb-target-${rnd()}.txt`, 'link');
    const link = P(`symlink-cb-${rnd()}.lnk`);
    fs.symlink(target, link, 'file', (err) => {
      if (err) {
        fs.unlinkSync(target);
        if (err.code === 'EPERM' || err.code === 'EACCES' || err.code === 'ENOTSUP') {
          this.skip();
          return;
        }
        done(err);
        return;
      }
      assert.strictEqual(fs.readFileSync(link, 'utf8'), 'link');
      fs.unlink(link, (rmErr) => {
        fs.unlinkSync(target);
        assert.ifError(rmErr);
        done();
      });
    });
  });

  it('fsp.symlink creates symbolic links', async function () {
    const target = writeFile(`symlink-p-target-${rnd()}.txt`, 'link');
    const link = P(`symlink-p-${rnd()}.lnk`);
    try {
      await fsp.symlink(target, link, 'file');
    }
    catch (err) {
      await fsp.unlink(target);
      if (err && (err.code === 'EPERM' || err.code === 'EACCES' || err.code === 'ENOTSUP')) {
        this.skip();
        return;
      }
      throw err;
    }
    try {
      assert.strictEqual(await fsp.readFile(link, 'utf8'), 'link');
    }
    finally {
      await fsp.unlink(link).catch(() => {});
      await fsp.unlink(target).catch(() => {});
    }
  });

  it('realpathSync resolves absolute path and native variant if present', () => {
    const file = writeFile(`realpath-sync-${rnd()}.txt`, 'rp');
    const rp = fs.realpathSync(file);
    assert.ok(rp.includes('/'));
    if (fs.realpathSync.native) {
      const native = fs.realpathSync.native(file);
      assert.strictEqual(typeof native, 'string');
    }
  });

  it('fs.realpath callback resolves path', (done) => {
    const file = writeFile(`realpath-cb-${rnd()}.txt`, 'rp');
    fs.realpath(file, (err, resolved) => {
      assert.ifError(err);
      assert.strictEqual(typeof resolved, 'string');
      done();
    });
  });

  it('fsp.realpath resolves promise', async () => {
    const file = writeFile(`realpath-p-${rnd()}.txt`, 'rp');
    const resolved = await fsp.realpath(file);
    assert.strictEqual(typeof resolved, 'string');
  });
});

describe('removal and truncation', () => {
  it('unlinkSync removes files', () => {
    const file = writeFile(`unlink-sync-${rnd()}.txt`, 'x');
    fs.unlinkSync(file);
    assert.strictEqual(fs.existsSync(file), false);
  });

  it('fs.unlink callback removes files', (done) => {
    const file = writeFile(`unlink-cb-${rnd()}.txt`, 'cb');
    fs.unlink(file, (err) => {
      assert.ifError(err);
      assert.strictEqual(fs.existsSync(file), false);
      done();
    });
  });

  it('fsp.unlink removes files', async () => {
    const file = writeFile(`unlink-p-${rnd()}.txt`, 'p');
    await fsp.unlink(file);
    assert.strictEqual(fs.existsSync(file), false);
  });

  it('rmSync removes directories recursively', () => {
    const dir = P(`rm-sync-${rnd()}`);
    fs.mkdirSync(`${dir}/nested`, { recursive: true });
    fs.writeFileSync(`${dir}/nested/file.txt`, 'x');
    if (typeof fs.rmSync === 'function')
      fs.rmSync(dir, { recursive: true, force: true });
    else
      fs.rmdirSync(dir, { recursive: true });
    assert.strictEqual(fs.existsSync(dir), false);
  });

  it('fs.rm callback removes directories recursively', function (done) {
    if (typeof fs.rm !== 'function') {
      this.skip();
      return;
    }
    const dir = P(`rm-cb-${rnd()}`);
    fs.mkdirSync(`${dir}/nested`, { recursive: true });
    fs.rm(dir, { recursive: true, force: true }, (err) => {
      assert.ifError(err);
      done();
    });
  });

  itIfHasPromise('rm')('fsp.rm removes directories recursively', async () => {
    const dir = P(`rm-p-${rnd()}`);
    fs.mkdirSync(`${dir}/nested`, { recursive: true });
    await fsp.rm(dir, { recursive: true, force: true });
    assert.strictEqual(fs.existsSync(dir), false);
  });

  it('rmdirSync removes empty directories and errors on non-empty ones', () => {
    const dir = P(`rmdir-sync-${rnd()}`);
    fs.mkdirSync(dir);
    fs.rmdirSync(dir);
    const dir2 = P(`rmdir-sync-nonempty-${rnd()}`);
    fs.mkdirSync(dir2);
    fs.writeFileSync(`${dir2}/file.txt`, 'x');
    let caught = false;
    try {
      fs.rmdirSync(dir2);
    }
    catch (err) {
      caught = true;
      assert.ok(err && (err.code === 'ENOTEMPTY' || err.code === 'EEXIST'));
    }
    assert.strictEqual(caught, true);
    if (typeof fs.rmSync === 'function')
      fs.rmSync(dir2, { recursive: true, force: true });
    else
      fs.rmdirSync(dir2, { recursive: true });
  });

  it('fs.rmdir callback removes empty directories', (done) => {
    const dir = P(`rmdir-cb-${rnd()}`);
    fs.mkdirSync(dir);
    fs.rmdir(dir, (err) => {
      assert.ifError(err);
      done();
    });
  });

  itIfHasPromise('rmdir')('fsp.rmdir removes empty directories', async () => {
    const dir = P(`rmdir-p-${rnd()}`);
    fs.mkdirSync(dir);
    await fsp.rmdir(dir);
    assert.strictEqual(fs.existsSync(dir), false);
  });

  it('truncateSync reduces file size', () => {
    const file = writeFile(`truncate-sync-${rnd()}.txt`, 'abcdef');
    fs.truncateSync(file, 2);
    assert.strictEqual(fs.readFileSync(file, 'utf8'), 'ab');
  });

  it('fs.truncate callback reduces file size', (done) => {
    const file = writeFile(`truncate-cb-${rnd()}.txt`, 'abcdef');
    fs.truncate(file, 3, (err) => {
      assert.ifError(err);
      assert.strictEqual(fs.readFileSync(file, 'utf8'), 'abc');
      done();
    });
  });

  it('fsp.truncate reduces file size', async () => {
    const file = writeFile(`truncate-p-${rnd()}.txt`, 'abcdef');
    await fsp.truncate(file, 4);
    assert.strictEqual(await fsp.readFile(file, 'utf8'), 'abcd');
  });
});

describe('timestamp updates', () => {
  it('utimesSync updates atime and mtime', () => {
    const file = writeFile(`utimes-sync-${rnd()}.txt`, 'x');
    const at = new Date(2001, 0, 1);
    const mt = new Date(2002, 0, 1);
    fs.utimesSync(file, at, mt);
    const stats = fs.statSync(file);
    assert.ok(Math.abs(stats.atime.getTime() - at.getTime()) < 5000);
    assert.ok(Math.abs(stats.mtime.getTime() - mt.getTime()) < 5000);
  });

  it('fs.utimes callback updates timestamps', (done) => {
    const file = writeFile(`utimes-cb-${rnd()}.txt`, 'x');
    const at = new Date(2003, 0, 1);
    const mt = new Date(2004, 0, 1);
    fs.utimes(file, at, mt, (err) => {
      assert.ifError(err);
      const stats = fs.statSync(file);
      assert.ok(Math.abs(stats.atime.getTime() - at.getTime()) < 5000);
      assert.ok(Math.abs(stats.mtime.getTime() - mt.getTime()) < 5000);
      done();
    });
  });

  it('fsp.utimes updates timestamps', async () => {
    const file = writeFile(`utimes-p-${rnd()}.txt`, 'x');
    const at = new Date(2005, 0, 1);
    const mt = new Date(2006, 0, 1);
    await fsp.utimes(file, at, mt);
    const stats = fs.statSync(file);
    assert.ok(Math.abs(stats.atime.getTime() - at.getTime()) < 5000);
    assert.ok(Math.abs(stats.mtime.getTime() - mt.getTime()) < 5000);
  });

  it('futimesSync updates descriptor timestamps', () => {
    usingFd(`futimes-sync-${rnd()}.txt`, 'w+', (fd) => {
      const when = new Date(2007, 0, 1);
      fs.futimesSync(fd, when, when);
      const stats = fs.fstatSync(fd);
      assert.ok(Math.abs(stats.atime.getTime() - when.getTime()) < 5000);
    });
  });

  it('fs.futimes callback updates descriptor timestamps', (done) => {
    usingFdAsync(`futimes-cb-${rnd()}.txt`, 'w+').then(({ fd }) => {
      const when = new Date(2008, 0, 1);
      fs.futimes(fd, when, when, (err) => {
        if (err) {
          closeFdAsync(fd).then(() => done(err), done);
          return;
        }
        const stats = fs.fstatSync(fd);
        assert.ok(Math.abs(stats.atime.getTime() - when.getTime()) < 5000);
        closeFdAsync(fd).then(() => done(), done);
      });
    }, done);
  });

  itIfHasPromise('futimes')('fsp.futimes updates descriptor timestamps', async () => {
    const { fd } = await usingFdAsync(`futimes-p-${rnd()}.txt`, 'w+');
    const when = new Date(2009, 0, 1);
    try {
      await fsp.futimes(fd, when, when);
      const stats = fs.fstatSync(fd);
      assert.ok(Math.abs(stats.atime.getTime() - when.getTime()) < 5000);
    }
    finally {
      await closeFdAsync(fd);
    }
  });

  itIfHas(fs, 'lutimesSync')('lutimesSync updates symbolic link timestamps', function () {
    const target = writeFile(`lutimes-sync-target-${rnd()}.txt`, 'link');
    const link = P(`lutimes-sync-${rnd()}.lnk`);
    try {
      fs.symlinkSync(target, link);
    }
    catch (err) {
      fs.unlinkSync(target);
      if (err && (err.code === 'EPERM' || err.code === 'ENOTSUP' || err.code === 'EACCES')) {
        this.skip();
        return;
      }
      throw err;
    }
    const when = new Date(2010, 0, 1);
    fs.lutimesSync(link, when, when);
    const stats = fs.lstatSync(link);
    assert.ok(Math.abs(stats.atime.getTime() - when.getTime()) < 5000);
    fs.unlinkSync(link);
    fs.unlinkSync(target);
  });

  itIfHasPromise('lutimes')('fsp.lutimes updates symbolic link timestamps', async function () {
    const target = writeFile(`lutimes-p-target-${rnd()}.txt`, 'link');
    const link = P(`lutimes-p-${rnd()}.lnk`);
    try {
      await fsp.symlink(target, link);
    }
    catch (err) {
      await fsp.unlink(target);
      if (err && (err.code === 'EPERM' || err.code === 'ENOTSUP' || err.code === 'EACCES')) {
        this.skip();
        return;
      }
      throw err;
    }
    const when = new Date(2011, 0, 1);
    try {
      await fsp.lutimes(link, when, when);
      const stats = fs.lstatSync(link);
      assert.ok(Math.abs(stats.atime.getTime() - when.getTime()) < 5000);
    }
    finally {
      await fsp.unlink(link).catch(() => {});
      await fsp.unlink(target).catch(() => {});
    }
  });
});

describe('streams', () => {
  it('createReadStream with start/end yields exact range', (done) => {
    const file = writeFile(`stream-read-${rnd()}.txt`, '0123456789');
    const chunks = [];
    const rs = fs.createReadStream(file, { start: 2, end: 6 });
    rs.on('data', (chunk) => chunks.push(chunk));
    rs.on('error', done);
    rs.on('end', () => {
      assert.strictEqual(Buffer.concat(chunks).toString(), '23456');
      done();
    });
  });

  it('createReadStream with encoding emits strings', (done) => {
    const file = writeFile(`stream-read-encoding-${rnd()}.txt`, `hello
world`);
    const rs = fs.createReadStream(file, { encoding: 'utf8' });
    const data = [];
    rs.on('data', (chunk) => data.push(chunk));
    rs.on('error', done);
    rs.on('end', () => {
      assert.strictEqual(data.join(''), `hello
world`);
      done();
    });
  });

  it('createWriteStream writes data and emits finish and close', (done) => {
    const file = P(`stream-write-${rnd()}.txt`);
    const ws = fs.createWriteStream(file);
    ws.on('finish', () => {
      assert.strictEqual(fs.readFileSync(file, 'utf8'), 'abc');
    });
    ws.on('close', () => {
      assert.strictEqual(fs.readFileSync(file, 'utf8'), 'abc');
      done();
    });
    ws.on('error', done);
    ws.write('a');
    ws.write('b');
    ws.end('c');
  });

  it('createWriteStream with start overwrites at specific offset', (done) => {
    const file = writeFile(`stream-write-start-${rnd()}.txt`, '012345');
    const ws = fs.createWriteStream(file, { start: 2 });
    ws.on('error', done);
    ws.end('XX', () => {
      assert.strictEqual(fs.readFileSync(file, 'utf8'), '01XX45');
      done();
    });
  });
});

describe('fs watchers', () => {
  it('fs.watch detects file changes', async function () {
    this.timeout(4000);
    const file = writeFile(`watch-${rnd()}.txt`, 'base');
    let watcher;
    try {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('watch timeout')), 3000);
        watcher = fs.watch(file, { persistent: false }, (eventType) => {
          if (eventType === 'change') {
            clearTimeout(timer);
            resolve();
          }
        });
        watcher.on('error', reject);
        setTimeout(() => {
          try {
            fs.appendFileSync(file, 'update');
          }
          catch (err) {
            reject(err);
          }
        }, 50);
      });
    }
    finally {
      if (watcher)
        watcher.close();
    }
  });

  it('fs.watch on directory reports filenames with encoding', async function () {
    this.timeout(4000);
    const dir = P(`watch-dir-${rnd()}`);
    fs.mkdirSync(dir);
    let watcher;
    try {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('watch dir timeout')), 3000);
        watcher = fs.watch(dir, { persistent: false, encoding: 'utf8' }, (_event, filename) => {
          if (filename && filename.endsWith('.txt')) {
            clearTimeout(timer);
            resolve();
          }
        });
        watcher.on('error', reject);
        setTimeout(() => {
          try {
            fs.writeFileSync(`${dir}/file.txt`, 'x');
          }
          catch (err) {
            reject(err);
          }
        }, 50);
      });
    }
    finally {
      if (watcher)
        watcher.close();
    }
  });

  it('fs.watchFile and unwatchFile respond to changes', async function () {
    this.timeout(4000);
    const file = writeFile(`watchfile-${rnd()}.txt`, 'x');
    await new Promise((resolve, reject) => {
      const listener = (curr, prev) => {
        if (curr.mtimeMs !== prev.mtimeMs) {
          fs.unwatchFile(file, listener);
          resolve();
        }
      };
      fs.watchFile(file, { interval: 50 }, listener);
      setTimeout(() => {
        try {
          fs.appendFileSync(file, 'update');
        }
        catch (err) {
          reject(err);
        }
      }, 80);
      setTimeout(() => reject(new Error('watchFile timeout')), 3000);
    });
  });
});

describe('fs.promises FileHandle API', () => {
  it('FileHandle write/read/truncate lifecycle', async () => {
    await usingHandle(`fh-cycle-${rnd()}.txt`, 'w+', async (handle) => {
      await handle.writeFile('hello');
      const buffer = Buffer.alloc(5);
      await handle.read(buffer, 0, 5, 0);
      assert.strictEqual(buffer.toString(), 'hello');
      await handle.truncate(3);
      const stats = await handle.stat();
      assert.strictEqual(stats.size, 3);
    });
  });

  it('FileHandle appendFile and readFile convenience methods', async () => {
    await usingHandle(`fh-append-${rnd()}.txt`, 'w+', async (handle) => {
      await handle.appendFile('first');
      await handle.appendFile(Buffer.from('second'));
      const content = await handle.readFile({ encoding: 'utf8' });
      assert.strictEqual(content, 'firstsecond');
    });
  });

  itIfHasAllPromises(['readv', 'writev'])('FileHandle readv/writev support scatter/gather', async () => {
    await usingHandle(`fh-readv-${rnd()}.txt`, 'w+', async (handle) => {
      await handle.writev([buf('AA'), buf('BB'), buf('CC')], 0);
      const buffers = [Buffer.alloc(2), Buffer.alloc(2), Buffer.alloc(2)];
      const { bytesRead, buffers: returned } = await handle.readv(buffers, 0);
      assert.strictEqual(bytesRead, 6);
      assert.deepStrictEqual(returned.map((b) => b.toString()), ['AA', 'BB', 'CC']);
    });
  });

  it('FileHandle sync/datasync and utimes function if available', async () => {
    await usingHandle(`fh-sync-${rnd()}.txt`, 'w+', async (handle) => {
      await handle.writeFile('data');
      if (typeof handle.sync === 'function')
        await handle.sync();
      if (typeof handle.datasync === 'function')
        await handle.datasync();
      if (typeof handle.utimes === 'function') {
        const when = new Date(2012, 0, 1);
        await handle.utimes(when, when);
        const stats = await handle.stat();
        assert.ok(Math.abs(stats.atime.getTime() - when.getTime()) < 5000);
      }
    });
  });
});

describe('misc utilities and constants', () => {
  it('existsSync reflects presence', () => {
    const file = P(`exists-${rnd()}.txt`);
    assert.strictEqual(fs.existsSync(file), false);
    fs.writeFileSync(file, '');
    assert.strictEqual(fs.existsSync(file), true);
  });

  it('fs.exists callback reports presence', (done) => {
    const file = P(`exists-cb-${rnd()}.txt`);
    fs.writeFileSync(file, '');
    fs.exists(file, (exists) => {
      assert.strictEqual(exists, true);
      done();
    });
  });

  it('accessSync and fs.access enforce permissions', (done) => {
    const file = P(`access-${rnd()}.txt`);
    fs.writeFileSync(file, 'x');
    fs.accessSync(file, fs.constants.R_OK);
    fs.access(file, fs.constants.F_OK, (err) => {
      assert.ifError(err);
      fs.access(P(`missing-${rnd()}.txt`), fs.constants.F_OK, (missingErr) => {
        assert.ok(missingErr);
        done();
      });
    });
  });

  it('fsp.access resolves and rejects appropriately', async () => {
    const file = P(`access-p-${rnd()}.txt`);
    await fsp.writeFile(file, 'x');
    await fsp.access(file, fs.constants.R_OK);
    await assert.rejects(fsp.access(P(`missing-${rnd()}.txt`)), { code: 'ENOENT' });
  });

  it('fs.constants expose expected flags', () => {
    assert.ok(typeof fs.constants.O_RDONLY === 'number');
    assert.ok(typeof fs.constants.F_OK === 'number');
    assert.ok((fs.constants.O_RDONLY & fs.constants.O_WRONLY) !== undefined);
  });

  it('fs.readFile accepts numeric file descriptors', (done) => {
    const file = P(`read-fd-${rnd()}.txt`);
    fs.writeFileSync(file, 'fd');
    fs.open(file, 'r', (err, fd) => {
      assert.ifError(err);
      fs.readFile(fd, 'utf8', (err2, content) => {
        assert.ifError(err2);
        assert.strictEqual(content, 'fd');
        fs.close(fd, (err3) => {
          assert.ifError(err3);
          done();
        });
      });
    });
  });
});

describe('error handling scenarios', () => {
  it('writeFile with flag wx fails when target exists', () => {
    const file = writeFile(`wx-${rnd()}.txt`, '');
    assert.throws(() => fs.writeFileSync(file, 'data', { flag: 'wx' }), { code: 'EEXIST' });
  });

  it('openSync with "r" on missing file throws ENOENT', () => {
    const file = P(`open-missing-${rnd()}.txt`);
    assert.throws(() => fs.openSync(file, 'r'), { code: 'ENOENT' });
  });

  it('fs.open callback reports errors', (done) => {
    fs.open(P(`open-error-${rnd()}.txt`), 'r', (err) => {
      assert.ok(err);
      assert.strictEqual(err.code, 'ENOENT');
      done();
    });
  });

  it('mkdirSync without recursive fails when parent is missing', () => {
    const dir = P(`missing-parent-${rnd()}/child`);
    assert.throws(() => fs.mkdirSync(dir), { code: 'ENOENT' });
  });

  it('fsp.rename rejects for missing source', async () => {
    const src = P(`rename-missing-${rnd()}.txt`);
    const dest = P(`rename-missing-dest-${rnd()}.txt`);
    await assert.rejects(fsp.rename(src, dest), { code: 'ENOENT' });
  });

  it('fs.copyFile with COPYFILE_EXCL errors when destination exists', (done) => {
    const src = writeFile(`copy-excl-src-${rnd()}.txt`, 'data');
    const dest = writeFile(`copy-excl-dest-${rnd()}.txt`, 'existing');
    fs.copyFile(src, dest, fs.constants.COPYFILE_EXCL, (err) => {
      assert.ok(err);
      assert.strictEqual(err.code, 'EEXIST');
      done();
    });
  });

  it('fsp.readFile rejects when path is a directory', async () => {
    const dir = P(`read-dir-${rnd()}`);
    fs.mkdirSync(dir);
    await assert.rejects(fsp.readFile(dir), (err) => typeof err?.code === 'string');
  });

  it('fs.rm without force on missing path rejects', function (done) {
    if (typeof fs.rm !== 'function') {
      this.skip();
      return;
    }
    fs.rm(P(`rm-missing-${rnd()}`), { recursive: false, force: false }, (err) => {
      assert.ok(err);
      assert.strictEqual(err.code, 'ENOENT');
      done();
    });
  });

  itIfHasPromise('rm')('fsp.rm rejects on missing path when force is false', async () => {
    await assert.rejects(fsp.rm(P(`rm-missing-p-${rnd()}`)), { code: 'ENOENT' });
  });
});
