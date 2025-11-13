# JavaScript Kernel - Repository Guide

## Project Overview

This is an **Nx-powered monorepo** that provides a browser-based JavaScript kernel with VS Code web integration. The kernel simulates a POSIX-like environment entirely in the browser, enabling shell execution, process management, and filesystem operations without any server backend.

**Repository Location:** `/Users/cloudnik/www/Automattic/core/node/web-polyfills/`

---

## Repository Structure

```
/Users/cloudnik/www/Automattic/core/node/web-polyfills/
├── packages/
│   ├── kernel/              # Browser-based POSIX-like kernel (library)
│   ├── web-extensions/      # VS Code web extension (application)
│   └── vscode-web/          # VS Code web dev server (development tool)
├── dist/                    # Global build output directory
│   ├── kernel/              # Built kernel package (~322KB index.js + WASM)
│   └── web-extensions/      # Built VS Code extension (~345KB extension.js)
├── explorations/            # Experimental code (not part of monorepo)
├── nx.json                  # Nx workspace configuration
├── package.json             # Root package with workspace definitions
├── README.md                # Project overview
└── DEVELOPMENT.md           # Detailed development guide
```

---

## Package: @adamziel/kernel

**Location:** `packages/kernel/`
**Type:** Library
**Build Output:** `dist/kernel/`
**Size:** 322KB JS + 3.74MB WASM

### Purpose

A browser-based kernel sandbox that provides a POSIX-like environment using Web Workers. It enables:
- Running shell commands (`cat`, `ls`, `mkdir`, `cp`, etc.)
- Process management with `spawn()` and `spawnSync()`
- Virtual filesystem with in-memory and WASM-based storage
- Bidirectional IPC using MessagePorts
- Interactive shell with readline support

### Key Components

#### 1. Core Kernel (`runtime/core/kernel.ts` - 2131 lines)
- Main `Kernel` class managing environment, processes, and filesystem
- Environment variables (HOME, USER, PATH, TERM)
- Stdin/stdout/stderr plumbing
- Process spawning and lifecycle management

#### 2. Process Management (`runtime/process/`)
- **Worker Controller** (`child/controller.ts`): Process worker lifecycle
- **Spawn Implementation**: Async and sync process creation
- **Stdio Plumbing**: MessagePort-based streams
- **Synchronous Bridge**: SharedArrayBuffer-based sync operations

#### 3. Filesystem (`runtime/fs/`)
- **In-Memory FS**: Fast, volatile storage
- **WasmFS Integration**: 3.6MB WASM for performance-critical ops
- **Serialization**: Import/export filesystem state
- **Nodes**: Files, directories, symlinks

#### 4. BusyBox Commands (`runtime/busybox/`)
Individual command implementations:
- `cat`, `cd`, `cp`, `echo`, `env`, `head`, `ls`, `mkdir`, `mv`, `pwd`
- `rm`, `sh`, `tail`, `touch`, `ln`
- **TTY Shell** (`tty-shell.ts` - 24KB): Advanced shell with:
  - Readline support (Ctrl+A/E/K, arrow keys)
  - Command history (Up/Down arrows)
  - Reverse search (Ctrl+R)
  - Tab completion

#### 5. Shell Execution (`runtime/shell/`)
- **Flash Parser**: Rust WASM parser (140KB) for shell scripts
- **Command Pipeline**: Multi-command execution
- **Pipes and Redirects**: `|`, `>`, `<`, `>>`, `2>&1`

#### 6. IPC System (`runtime/ipc/`)
- **MessagePort Streaming**: Bidirectional async communication
- **Sync Pump Worker**: Enables synchronous operations
- **Message Serialization**: Structured data transfer

### Technology Stack

- **Language**: TypeScript with ESM modules
- **Runtime**: Web Workers for process isolation
- **Performance**: WebAssembly (WasmFS + Flash parser)
- **UI**: React 18.3.1, CodeMirror 6, xterm.js 5.3.0
- **Build**: tsup 8.5.0 (esbuild-based)
- **Testing**: Vitest 1.6.1 + Playwright 1.40.0

### Build Configuration

**File:** `packages/kernel/tsup.config.ts`

**Entry Points:**
- `runtime/index.ts` → `dist/kernel/index.js` (main export)
- `runtime/process/child/controller.ts` → `dist/kernel/workers/process-controller.js`
- `runtime/ipc/sync/pump-worker.ts` → `dist/kernel/workers/pump-worker.js`
- `runtime/wasmfs-worker.ts` → `dist/kernel/workers/wasmfs-worker.js`

**Output Format:** ESM (required for top-level await and `import.meta.url`)

**Post-Build:**
- Copies WASM files to `dist/kernel/`
- Copies `wasmfs-fs.wasm` (3.6MB)
- Copies `flash_wasm_demo_bg.wasm` (140KB)

### Public API Exports

**File:** `packages/kernel/runtime/index.ts`

```typescript
export { Kernel } from './core/kernel';
export { installBusybox } from './busybox/index';
export { ttyShellProgramSource } from './busybox/tty-shell';
export type { KernelSubprocess } from './core/kernel';
// ... other types and utilities
```

### Development Workflow

#### Running Tests
```bash
npm test                    # Run kernel tests in browser
npm run test:smoke         # Run smoke tests
```

**IMPORTANT:** Always run tests in a **web browser**, NEVER in Node.js. The kernel uses Web Workers and browser APIs that don't exist in Node.

#### Building
```bash
npm run build:kernel       # Build kernel only
npm run build              # Build all packages
```

#### Development Server
```bash
npm run dev                # Start Vite dev server
```

---

## Package: kernel-vscode-extension

**Location:** `packages/web-extensions/`
**Type:** Application (VS Code Extension)
**Build Output:** `packages/web-extensions/dist/`
**Size:** 345KB bundled

### Purpose

VS Code web extension that integrates the kernel with VS Code, providing:
- Filesystem access via `kernel://` URI scheme
- Terminal integration with interactive shell
- Commands for opening terminals and restarting kernel

### Key Components

#### 1. Extension Entry (`src/extension.ts` - 82 lines)
- **Activation**: `onStartupFinished` event
- **Providers**: FileSystem and Terminal
- **Commands**:
  - `kernel.openTerminal` - Opens interactive terminal
  - `kernel.restart` - Restarts kernel instance

#### 2. Kernel Manager (`src/kernelManager.ts` - 77 lines)
- Initializes Kernel instance
- Sets up environment:
  ```
  HOME=/home
  USER=user
  PATH=/bin:/usr/bin
  TERM=xterm-256color
  ```
- Creates directory structure: `/home`, `/tmp`, `/usr/bin`, `/etc`, `/var`
- Installs busybox commands
- Manages kernel lifecycle (restart, dispose)

#### 3. Filesystem Provider (`src/kernelFileSystemProvider.ts` - 214 lines)
- Implements `vscode.FileSystemProvider` API
- Bridges VS Code operations to kernel filesystem
- Supported operations:
  - `stat` - Get file metadata
  - `readDirectory` - List directory contents
  - `createDirectory` - Create directories
  - `readFile` - Read file contents
  - `writeFile` - Write file contents
  - `delete` - Delete files/directories
  - `rename` - Rename/move files
  - `copy` - Copy files
- File change events with 5ms debounce batching
- URI mapping: `kernel://home/file.txt` → `/home/file.txt`

#### 4. Terminal Provider (`src/kernelTerminalProvider.ts` - 186 lines)
- Implements `vscode.Pseudoterminal` API
- Spawns tty-shell process using `kernel.spawn()`
- Bridges stdio between VS Code terminal and shell
- Features:
  - Readline support (Ctrl+A/E/K)
  - Command history (Up/Down arrows)
  - Reverse search (Ctrl+R)
  - Tab completion

### Build Configuration

**File:** `packages/web-extensions/esbuild.js`

**Build Process:**
1. Entry: `src/extension.ts`
2. Bundle with esbuild
3. Output: `packages/web-extensions/dist/extension.js` (345KB)
4. Format: CommonJS (required by VS Code)
5. Platform: Browser
6. Target: ES2022
7. External: `vscode` (provided by VS Code runtime)
8. Plugin: Copies WASM files from `dist/kernel/` to `packages/web-extensions/dist/`

**Watch Mode:** `npm run dev` enables auto-rebuild on changes

### VS Code Integration

**Manifest:** `packages/web-extensions/package.json`

```json
{
  "name": "kernel-vscode-extension",
  "displayName": "JavaScript Kernel",
  "publisher": "automattic",
  "engines": { "vscode": "^1.94.0" },
  "browser": "./dist/extension.js",
  "activationEvents": ["onStartupFinished"]
}
```

**Commands:**
- `kernel.openTerminal` - Open Terminal
- `kernel.restart` - Restart Kernel

---

## Package: vscode-web

**Location:** `packages/vscode-web/`
**Type:** Development Tool
**Purpose:** Serves VS Code for Web at `http://localhost:3958` for extension testing

### Usage

```bash
npm run dev                 # Serves VS Code with extension loaded
```

**Features:**
- Full VS Code web UI (~92MB build)
- Extension Host for running extensions
- DevTools integration for debugging
- Hot reload (refresh browser after extension changes)

---

## Monorepo Architecture

### Dependency Graph

```
web-extensions (application)
    ↓ depends on
kernel (library)
    ↓ builds to
dist/kernel/
    ↓ consumed by
packages/web-extensions/dist/
```

### Build System (Nx)

**Configuration:** `nx.json`

**Features:**
- **Smart Caching**: Build artifacts cached in `.nx/cache/`
- **Dependency Management**: Builds dependencies first (`^build`)
- **Parallel Execution**: Up to 3 concurrent tasks
- **Affected Commands**: Only build/test changed packages

**Commands:**
```bash
npm run build              # Build all packages
npm run build:kernel       # Build kernel only
npm run build:extension    # Build extension (includes kernel)
npm run dev                # Watch mode + VS Code dev server
npm run test:all           # Run all tests
npm run affected:build     # Build only changed packages
npm run graph              # Visualize dependencies
npm run clean              # Clear cache and artifacts
```

### Package Resolution

- **Development**: `@adamziel/kernel` uses workspace protocol (`"*"`)
- **Build**: esbuild alias resolves to `../kernel` source
- **Production**: Extension bundles kernel code into single file

---

## Development Guidelines

### Code Style

- Prefer concise solutions that reuse existing system parts
- Refactor slightly when needed for reusability
- **Never** produce markdown files explaining changes unless explicitly asked
- **Never** produce test/run scripts unless explicitly asked

### Testing Requirements

**CRITICAL**: Always run ALL unit tests using a **web browser**. NEVER run them in Node.js. They will fail in Node.

```bash
npm test                   # Runs in browser via Vitest + Playwright
```

### IPC Best Practices

**NEVER EVER EVER SKIP THE NEED FOR BIDIRECTIONAL IPC**

- Keep working until bidirectional IPC works correctly
- Write tests for IPC functionality
- Run tests and verify results
- Fix issues immediately
- Never implement workarounds for IPC - just get it working properly

The kernel's MessagePort-based IPC system is fundamental to its operation. Shortcuts or workarounds will cause cascading failures.

---

## Key Files Reference

### Kernel Package

| File | Purpose | Size |
|------|---------|------|
| `packages/kernel/package.json` | Package manifest | 90 lines |
| `packages/kernel/tsup.config.ts` | Build configuration | 74 lines |
| `packages/kernel/runtime/index.ts` | Public API exports | 27 lines |
| `packages/kernel/runtime/core/kernel.ts` | Main kernel implementation | 2131 lines |
| `packages/kernel/runtime/busybox/index.ts` | BusyBox installer | ~2KB |
| `packages/kernel/runtime/busybox/tty-shell.ts` | Advanced shell | 24KB |
| `packages/kernel/runtime/process/child/controller.ts` | Process worker | 50KB |

### Web Extensions Package

| File | Purpose | Size |
|------|---------|------|
| `packages/web-extensions/package.json` | Extension manifest | 53 lines |
| `packages/web-extensions/esbuild.js` | Build script | 94 lines |
| `packages/web-extensions/src/extension.ts` | Entry point | 82 lines |
| `packages/web-extensions/src/kernelManager.ts` | Kernel lifecycle | 77 lines |
| `packages/web-extensions/src/kernelFileSystemProvider.ts` | FS bridge | 214 lines |
| `packages/web-extensions/src/kernelTerminalProvider.ts` | Terminal bridge | 186 lines |
| `packages/web-extensions/IMPLEMENTATION.md` | Architecture docs | 449 lines |

### Build Output

| Location | Contents | Size |
|----------|----------|------|
| `dist/kernel/index.js` | Main kernel bundle | 322KB |
| `dist/kernel/workers/` | Worker bundles | - |
| `dist/kernel/flash_wasm_demo_bg.wasm` | Shell parser | 140KB |
| `dist/kernel/wasmfs-fs.wasm` | Filesystem | 3.6MB |
| `packages/web-extensions/dist/extension.js` | Bundled extension | 345KB |

---

## Common Development Tasks

### Adding a New BusyBox Command

1. Create command file in `packages/kernel/runtime/busybox/`
2. Export from `packages/kernel/runtime/busybox/index.ts`
3. Run `npm test` to verify
4. Build with `npm run build:kernel`

### Modifying Extension Behavior

1. Edit files in `packages/web-extensions/src/`
2. Run `npm run dev` (auto-rebuilds on save)
3. Reload browser to test changes

### Debugging Extension Issues

1. Check browser DevTools Console tab
2. Examine extension activation in Output panel
3. Use VS Code's "Developer: Show Running Extensions" command
4. Check filesystem operations in Extension Host log

### Running Specific Tests

```bash
npm test                   # All kernel tests
npm run test:smoke         # Smoke tests only
npm run test:all           # All packages
```

---

## Troubleshooting

### Build Issues

**Problem**: "Module not found" errors
**Solution**: Run `npm install` at root level to sync workspaces

**Problem**: Nx cache issues
**Solution**: `npm run clean` to clear cache

### Runtime Issues

**Problem**: "import.meta.url is not defined"
**Solution**: Kernel must be built as ESM, check `tsup.config.ts` format

**Problem**: WASM files not loading
**Solution**: Check esbuild plugin copied WASM to `packages/web-extensions/dist/`

### Extension Issues

**Problem**: "ESM modules are not supported"
**Solution**: Extension must be built as CommonJS, check `esbuild.js` format

**Problem**: Extension not activating
**Solution**: Check `activationEvents` in `package.json`, ensure `onStartupFinished`

---

## Additional Documentation

- `README.md` - Project overview and quick start
- `DEVELOPMENT.md` - Detailed development workflow
- `packages/web-extensions/IMPLEMENTATION.md` - Extension architecture
- `packages/kernel/README.md` - Kernel usage guide
