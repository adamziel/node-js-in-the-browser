# Quick Start Guide

## Installation & Setup

### 1. Build the Extension

```bash
cd web-extensions
npm install
npm run compile
```

Expected output:
```
Build complete!
```

Check that `dist/extension.js` exists (~158KB).

### 2. Test in VS Code

#### Option A: Debug from Source

1. Open the `web-extensions` folder in VS Code
2. Press **F5** (or Run > Start Debugging)
3. A new "Extension Development Host" window opens

#### Option B: Package and Install

```bash
# Package the extension
npm run package

# This creates: kernel-vscode-extension-0.0.1.vsix
```

Then install in VS Code:
1. Open Extensions view (Ctrl+Shift+X)
2. Click "..." menu → "Install from VSIX..."
3. Select the .vsix file

## First Steps

### Open a Terminal

1. Press **Cmd+Shift+P** (or Ctrl+Shift+P on Windows/Linux)
2. Type: `Kernel: Open Terminal`
3. Press Enter

You should see:
```
/$
```

### Try Basic Commands

```bash
# List files
ls /

# Create a directory
mkdir /home/demo

# Change directory
cd /home/demo

# Create a file
echo "Hello from kernel!" > hello.txt

# Read the file
cat hello.txt

# List with details
ls -la
```

### Access Files in VS Code

1. Open Command Palette (Cmd+Shift+P)
2. Type: `File: Open File...`
3. Enter: `kernel://home/demo/hello.txt`
4. The file opens in the editor!

Or use the Explorer:
1. File > Open Folder
2. Enter: `kernel://home`
3. Browse the filesystem in the Explorer pane

### Create Files in VS Code

1. In Explorer, right-click in the kernel:// folder
2. Select "New File"
3. Name it: `test.txt`
4. Type some content and save

Then in the terminal:
```bash
cat /home/test.txt
# Shows the content you typed!
```

## Available Commands

The kernel comes with full busybox commands:

| Command | Description | Example |
|---------|-------------|---------|
| `ls` | List directory | `ls -la /home` |
| `cd` | Change directory | `cd /tmp` |
| `pwd` | Print working directory | `pwd` |
| `cat` | Display file contents | `cat file.txt` |
| `echo` | Print text | `echo "hello" > file.txt` |
| `mkdir` | Create directory | `mkdir -p /a/b/c` |
| `rm` | Remove file | `rm file.txt` |
| `rmdir` | Remove directory | `rmdir /tmp/test` |
| `cp` | Copy file | `cp src.txt dst.txt` |
| `mv` | Move/rename file | `mv old.txt new.txt` |
| `touch` | Create empty file | `touch newfile.txt` |
| `ln` | Create link | `ln -s target link` |
| `head` | Show first lines | `head -n 5 file.txt` |
| `tail` | Show last lines | `tail -n 10 file.txt` |
| `env` | Show environment | `env` |

Plus custom programs:
- `node` - Node.js runtime
- `php` - PHP runtime
- `tty-shell` - Interactive shell (auto-launched)

## Keyboard Shortcuts (in Terminal)

| Keys | Action |
|------|--------|
| **Up/Down** | Navigate command history |
| **Tab** | Auto-complete files/commands |
| **Ctrl+R** | Reverse search history |
| **Ctrl+A** | Move to start of line |
| **Ctrl+E** | Move to end of line |
| **Ctrl+U** | Delete to start of line |
| **Ctrl+K** | Delete to end of line |
| **Ctrl+W** | Delete word backward |
| **Ctrl+L** | Clear screen |
| **Ctrl+C** | Interrupt current command |
| **Ctrl+D** | Exit shell (when line empty) |

## Example Workflows

### Create a Project

```bash
# Create project structure
mkdir -p /home/myproject/src
cd /home/myproject

# Create files
echo "console.log('Hello!');" > src/index.js
echo '{ "name": "myproject" }' > package.json

# View the structure
ls -R
```

Then open `kernel://home/myproject` in VS Code and edit the files!

### Work with Text Files

```bash
# Create a multi-line file
cat > /home/notes.txt
Line 1
Line 2
Line 3
^D  # Press Ctrl+D to finish

# View it
cat /home/notes.txt

# View first 2 lines
head -n 2 /home/notes.txt

# Append to it
echo "Line 4" >> /home/notes.txt
```

### Explore the Filesystem

```bash
# See what's installed
ls -la /bin

# Check the PATH
env | grep PATH

# Find all .txt files (using shell wildcards)
ls *.txt
ls **/*.txt
```

## Troubleshooting

### Terminal Doesn't Open

1. Check the Developer Console:
   - In VS Code: `Help > Toggle Developer Tools`
   - Look for errors in Console tab

2. Verify kernel initialized:
   - Look for: `[KernelManager] Kernel initialization complete`

3. Try restarting:
   - Cmd+Shift+P → `Kernel: Restart Kernel`

### Files Don't Appear in Explorer

1. Make sure you're using the `kernel://` scheme
2. Try refreshing: Right-click folder → Refresh
3. Check the file was created:
   ```bash
   ls -la /path/to/file
   ```

### Command Not Found

1. Check PATH:
   ```bash
   env | grep PATH
   ```

2. Check if executable exists:
   ```bash
   ls -la /bin/commandname
   ```

3. Verify it's executable:
   ```bash
   # Should show 'x' in permissions
   ls -l /bin/ls
   # Output: -rwxr-xr-x ... /bin/ls
   ```

### Extension Won't Activate

1. Check `dist/extension.js` exists:
   ```bash
   ls -lh dist/extension.js
   ```

2. Rebuild if needed:
   ```bash
   npm run compile
   ```

3. Check for build errors in the terminal output

## What's Next?

- **Read USAGE.md** for detailed usage instructions
- **Read IMPLEMENTATION.md** for technical details
- **Read README.md** for feature overview
- **Explore the codebase** in `src/` directory

## Getting Help

- Check the console logs (Help > Toggle Developer Tools)
- Look for `[KernelManager]`, `[Terminal]`, and `[kernel]` prefixed messages
- Read the error messages carefully - they usually indicate what went wrong

## Example Session

Here's a complete example showing the power of the integration:

```bash
# In terminal:
$ mkdir /home/website
$ cd /home/website
$ echo "<h1>Hello World</h1>" > index.html
$ echo "body { background: #333; color: white; }" > style.css
$ ls -la

# Now in VS Code:
# 1. File > Open Folder > kernel://home/website
# 2. Edit index.html in VS Code
# 3. Add: <link rel="stylesheet" href="style.css">

# Back in terminal:
$ cat index.html
# Shows your edits from VS Code!

# Create a README
$ echo "# My Website" > README.md

# The README.md appears in VS Code Explorer immediately!
```

This demonstrates seamless bidirectional integration between the terminal and VS Code.

Enjoy using the JavaScript Kernel!
