# Changelog

## [0.0.1] - 2025-11-09

### Added
- Initial release
- Kernel filesystem integration via `kernel://` URI scheme
- Terminal integration with tty-shell
- Full busybox command support
- Custom programs support (node, php)
- Commands:
  - `Kernel: Open Terminal`
  - `Kernel: Restart Kernel`

### Features
- InMemoryFileSystem and WasmFS backend support
- Interactive shell with:
  - Command history
  - Tab completion
  - Reverse search (Ctrl+R)
  - Readline editing
- Full filesystem operations in VS Code:
  - Read/write files
  - Create/delete directories
  - Rename/copy files
  - File watching support
