# VS Code for Web - Static Build

A self-hosted VS Code for Web with **static assets** that can be deployed to any web server, CDN, or static hosting service.

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Build Static Assets
```bash
npm run build
```

This will download VS Code Web assets and create a `dist/` directory with all static files ready for deployment.

### 3. Serve Locally
```bash
npm run serve
```

Then open `http://localhost:8080` in your browser.

## Project Structure

```
vscode-web/
├── dist/                  # Built static files (deploy this!)
│   ├── index.html        # Entry point
│   ├── out/              # VS Code compiled code
│   ├── extensions/       # Built-in extensions
│   ├── node_modules/     # Runtime dependencies
│   ├── favicon.ico
│   ├── manifest.json
│   └── ...
├── build.js              # Build script
├── serve.js              # Local development server
├── package.json
└── README.md
```

## Deployment Options

### Option 1: Static File Server (nginx, Apache, etc.)

Upload the `dist/` directory to your web server and serve it as static files.

**Nginx example:**
```nginx
server {
    listen 80;
    server_name your-domain.com;
    root /path/to/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # Enable MIME types
    include mime.types;
}
```

**Apache example (.htaccess):**
```apache
RewriteEngine On
RewriteBase /
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule . /index.html [L]
```

### Option 2: CDN / Static Hosting

Deploy the `dist/` folder to any static hosting service:

- **Netlify**: Drag and drop the `dist/` folder
- **Vercel**: `vercel dist/`
- **GitHub Pages**: Push `dist/` to gh-pages branch
- **AWS S3 + CloudFront**: Upload to S3 bucket
- **Azure Static Web Apps**: Deploy dist/ directory
- **Google Cloud Storage**: Upload as static website

### Option 3: Docker

Create a `Dockerfile`:
```dockerfile
FROM nginx:alpine
COPY dist/ /usr/share/nginx/html/
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

Build and run:
```bash
docker build -t vscode-web .
docker run -p 8080:80 vscode-web
```

### Option 4: Node.js Server

Use the included serve script:
```bash
PORT=3000 node serve.js
```

## Available Scripts

- `npm run build` - Build static assets to dist/
- `npm run serve` - Serve the dist/ folder locally
- `npm run dev` - Run with @vscode/test-web dev server (Insiders)
- `npm run dev:stable` - Run with @vscode/test-web dev server (Stable)
- `npm run dev:insiders` - Run with @vscode/test-web dev server (Insiders)

## Features

- Fully static assets - no server-side processing required
- Works with any web server or CDN
- File System Access API support (Chrome/Edge)
- Progressive Web App (PWA) capabilities
- Offline support (via service workers)
- Extension support (with web limitations)

## Important Notes

### Browser Compatibility
- **Best experience**: Chrome, Edge (Chromium-based)
- **File System Access**: Requires Chrome 86+ or Edge 86+
- **Other browsers**: Firefox, Safari (with limitations)

### File System Access
The web version uses the browser's File System Access API to open local files and folders. This requires:
1. Chromium-based browser (Chrome, Edge, etc.)
2. User permission to access files
3. HTTPS connection (or localhost for development)

### Limitations
- Some VS Code features requiring native binaries won't work
- Terminal features are limited to web-based shells
- Some extensions may not be compatible with the web version
- No native file system access in browsers without File System Access API

## Updating VS Code

To update to the latest VS Code version:

1. Delete the `.vscode-test-web/` cache directory
2. Run `npm run build` again

This will download the latest VS Code version and rebuild the static assets.

## Size Considerations

The `dist/` directory is approximately **150-200 MB** due to:
- VS Code core (~50MB)
- Built-in extensions (~100MB)
- Runtime dependencies (~30MB)

For production deployments, consider:
- Enabling gzip/brotli compression on your server
- Using a CDN for faster delivery
- Removing unused extensions from `dist/extensions/`

## Customization

### Disable Telemetry
Telemetry is disabled by default in the `index.html` configuration:
```javascript
"productConfiguration":{"enableTelemetry":false}
```

### Configure Default Workspace
Edit the `data-settings` in `dist/index.html`:
```html
<meta id="vscode-workbench-web-configuration"
  data-settings='{"workspaceUri":{"scheme":"tmp","path":"/default.code-workspace"}}'>
```

### Add Custom Extensions
Place extension folders in `dist/extensions/` and rebuild.

## Troubleshooting

**Issue**: Blank screen or loading errors
- Check browser console for errors
- Ensure all files are served with correct MIME types
- Verify CORS headers if serving from different domain

**Issue**: Can't open files
- File System Access API requires HTTPS or localhost
- Check browser compatibility (Chrome/Edge 86+)
- Grant file access permissions when prompted

**Issue**: Extensions not loading
- Some extensions require server-side components
- Check extension compatibility with web version
- Review browser console for extension errors

## License

This project uses VS Code (MIT License). See the original [VS Code repository](https://github.com/microsoft/vscode) for details.

## Credits

Built using:
- [VS Code](https://github.com/microsoft/vscode) by Microsoft
- [@vscode/test-web](https://www.npmjs.com/package/@vscode/test-web) for asset distribution
