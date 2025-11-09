# Using the Kernel VS Code Extension

## Overview

This extension integrates the JavaScript kernel into VS Code Web, providing:
- Filesystem access through the `kernel://` URI scheme
- Terminal with full tty-shell support
- Access to busybox commands and custom programs (node, php, etc.)

## Development & Testing

### Build the Extension

```bash
cd web-extensions
npm install
npm run compile
```

### Test in VS Code Desktop

1. Open the `web-extensions` folder in VS Code
2. Press F5 or use "Run > Start Debugging"
3. A new Extension Development Host window will open

### Test in VS Code Web (vscode.dev)

#### Option 1: Using the VS Code Remote Tunnels

```bash
# Install the Remote Tunnels CLI
code tunnel

# Follow the authentication prompts
# Open the provided URL in a browser
```

#### Option 2: Manual Testing

1. Package the extension:
   ```bash
   npm run package
   ```

2. Install in VS Code Web:
   - Open vscode.dev
   - Use the Extensions view
   - Install from VSIX

## Using the Extension

### Open a Terminal

1. Open the Command Palette (`Cmd+Shift+P` or `Ctrl+Shift+P`)
2. Type "Kernel: Open Terminal"
3. Press Enter

You'll get a fully interactive shell with:
- Command history (Up/Down arrows)
- Tab completion for files and commands
- Reverse search (Ctrl+R)
- All busybox commands: ls, cd, cat, mkdir, rm, etc.
- Custom programs: node, php

### Access the Filesystem

The kernel filesystem is available at the `kernel://` URI scheme:

1. Open a file:
   ```
   File > Open File > kernel://home/myfile.txt
   ```

2. Open a folder:
   ```
   File > Open Folder > kernel://home
   ```

3. In the terminal, create files that will appear in the Explorer:
   ```bash
   mkdir /home/myproject
   cd /home/myproject
   echo "console.log('Hello from kernel!');" > hello.js
   ```

4. Files created in VS Code will be accessible from the terminal:
   - Create a new file in VS Code at `kernel://home/test.txt`
   - In the terminal: `cat /home/test.txt`

### Commands Available

- `Kernel: Open Terminal` - Opens a new kernel shell terminal
- `Kernel: Restart Kernel` - Restarts the kernel (clears all state)

## Architecture

### Component Flow

```
VS Code UI
    ↓
Extension (extension.ts)
    ↓
    ├─→ KernelManager (manages kernel lifecycle)
    │       ↓
    │   Kernel Instance (runtime/core/kernel.ts)
    │       ↓
    │       ├─→ InMemoryFileSystem or WasmFS
    │       └─→ Process spawning
    │
    ├─→ KernelFileSystemProvider (VS Code FS bridge)
    │       ↓
    │   Kernel FS operations
    │
    └─→ KernelTerminalProvider (VS Code terminal bridge)
            ↓
        tty-shell process
            ↓
        busybox commands + custom programs
```

### Data Flow

1. **Terminal Input**: User types in VS Code terminal
   - → `KernelTerminalPty.handleInput()`
   - → Kernel process stdin
   - → tty-shell program
   - → Command execution

2. **Terminal Output**: Command produces output
   - → Kernel process stdout/stderr
   - → `MessagePortReadableStream`
   - → `KernelTerminalPty.onDidWrite` event
   - → VS Code terminal display

3. **File Operations**: User edits file in VS Code
   - → `KernelFileSystemProvider.writeFile()`
   - → `kernel.writeFileSync()`
   - → Filesystem backend (InMemory or WasmFS)

4. **File Access from Terminal**: Command reads file
   - → Shell command (e.g., `cat`)
   - → Process controller FS client
   - → Kernel FS RPC
   - → Filesystem backend

## Filesystem Backends

The kernel supports two filesystem backends:

1. **InMemoryFileSystem** (default for SharedArrayBuffer environments)
   - Pure JavaScript implementation
   - Fast, synchronous operations
   - Lost on page refresh

2. **WasmFS** (default when SharedArrayBuffer unavailable)
   - WebAssembly-based filesystem
   - Can be persisted to OPFS
   - Better performance for large files

## Troubleshooting

### Extension doesn't activate

Check the Developer Console:
1. In the Extension Development Host, open: `Help > Toggle Developer Tools`
2. Look for errors in the Console tab
3. Check that the kernel initialized: Look for `[KernelManager] Kernel initialization complete`

### Terminal doesn't work

1. Check that tty-shell is installed:
   - Look for `[KernelManager] Installing busybox...`
2. Verify the terminal process started:
   - Look for `[Terminal] Process exited with code X` (should not appear immediately)

### Filesystem operations fail

1. Verify kernel is initialized:
   ```javascript
   // In the developer console
   console.log(kernelManager.isInitialized())
   ```

2. Check file permissions:
   - Most files should be 0o644 (rw-r--r--)
   - Directories should be 0o755 (rwxr-xr-x)
   - Executables should be 0o755 (rwxr-xr-x)

### import.meta.url errors

Make sure esbuild.js is configured with:
```javascript
format: 'esm',
target: 'es2022',
```

## Known Limitations

1. **No persistence by default**: Files are lost on page refresh
   - WasmFS backend can be configured for OPFS persistence
   - This requires additional setup

2. **Worker limitations**: Some operations may fail in workers
   - SharedArrayBuffer requires specific headers
   - Some browsers have restrictions

3. **Performance**: Large file operations may be slower than native filesystem

## Next Steps

1. Add OPFS persistence for WasmFS backend
2. Implement file watching for better VS Code integration
3. Add support for terminal theming
4. Create VS Code workspace templates
5. Add debugging support for kernel programs
