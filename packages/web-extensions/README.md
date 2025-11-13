# JavaScript Kernel VS Code Extension

This VS Code web extension integrates the JavaScript kernel with VS Code, providing:

1. **Kernel Filesystem Integration** - Access kernel filesystem through VS Code's file explorer using the `kernel://` URI scheme
2. **Terminal Integration** - Run the tty-shell in VS Code's integrated terminal
3. **Process Management** - Spawn and manage kernel processes

## Features

### Filesystem Provider

The extension registers a `kernel://` filesystem provider that allows you to:
- Browse the kernel filesystem in VS Code's Explorer
- Create, read, update, and delete files and directories
- Copy and rename files
- All operations are synchronized with the kernel's in-memory or WASMFS backend

### Terminal Integration

Open a kernel shell terminal with:
- Command: `Kernel: Open Terminal`
- Full readline support (history, tab completion, etc.)
- Access to busybox commands and custom programs

### Commands

- `Kernel: Open Terminal` - Opens a new terminal with the kernel shell
- `Kernel: Restart Kernel` - Restarts the kernel instance

## Development

```bash
# Install dependencies
npm install

# Compile the extension
npm run compile

# Watch for changes
npm run watch

# Package the extension
npm run package
```

## Usage in VS Code Web

1. Build the extension: `npm run compile`
2. The extension will activate on startup and initialize the kernel
3. Use the `kernel://` scheme to access kernel files
4. Open terminals to interact with the shell

## Architecture

```
extension.ts              - Main extension activation and registration
kernelManager.ts          - Manages kernel lifecycle and initialization
kernelFileSystemProvider.ts - VS Code FileSystemProvider implementation
kernelTerminalProvider.ts - VS Code Terminal integration with tty-shell
```

The extension uses the kernel from `../../runtime/core/kernel.ts` and integrates:
- Busybox commands from `../../runtime/busybox/`
- Custom programs from `../../app/programs/`
- The tty-shell from `../../runtime/busybox/tty-shell.ts`
