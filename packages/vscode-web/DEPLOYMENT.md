# Deployment Guide

## What You Have

The `dist/` directory contains **all static files** needed to run VS Code in a web browser. This is a complete, self-contained build that requires no server-side processing.

## Directory Size
- Total: ~90-100 MB (uncompressed)
- With gzip: ~30-40 MB

## Deployment Steps

### 1. Build the Static Assets

```bash
npm install
npm run build
```

This creates the `dist/` directory.

### 2. Test Locally

```bash
npm run serve
```

Open `http://localhost:8080` to verify everything works.

### 3. Deploy

Simply upload the entire `dist/` directory to your web server or hosting provider.

## Quick Deploy Examples

### Netlify (Drag & Drop)
1. Go to https://app.netlify.com/drop
2. Drag the `dist/` folder
3. Done! Get your URL

### Vercel
```bash
npm install -g vercel
vercel dist/
```

### GitHub Pages
```bash
cd dist
git init
git add .
git commit -m "Deploy VS Code Web"
git branch -M gh-pages
git remote add origin YOUR_REPO_URL
git push -u origin gh-pages
```

### AWS S3 + CloudFront

```bash
# Install AWS CLI first
aws s3 sync dist/ s3://your-bucket-name/ --acl public-read

# Enable static website hosting in S3 console
# Point CloudFront distribution to the S3 bucket
```

### Docker + nginx

Create `Dockerfile`:
```dockerfile
FROM nginx:alpine
COPY dist/ /usr/share/nginx/html/
EXPOSE 80
```

Build and run:
```bash
docker build -t vscode-web .
docker run -d -p 8080:80 vscode-web
```

### Apache Server

Upload `dist/` to your web root (e.g., `/var/www/html/vscode/`).

Create `.htaccess` in the dist directory:
```apache
Options -Indexes
RewriteEngine On
RewriteBase /vscode/
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule . /vscode/index.html [L]

# Enable compression
<IfModule mod_deflate.c>
    AddOutputFilterByType DEFLATE text/html text/css application/javascript
</IfModule>
```

### Nginx Server

Add to your nginx config:
```nginx
server {
    listen 80;
    server_name vscode.yourdomain.com;

    root /path/to/dist;
    index index.html;

    # Enable gzip
    gzip on;
    gzip_types text/plain text/css application/json application/javascript;
    gzip_min_length 1000;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|woff|woff2|ttf)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

## Important Considerations

### HTTPS Required
For File System Access API to work (opening local files), you need HTTPS or localhost.

### CORS Headers
If serving from a different domain than where assets are loaded, ensure proper CORS headers:
```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Content-Type
```

### MIME Types
Ensure your server serves files with correct MIME types:
- `.js` → `application/javascript`
- `.css` → `text/css`
- `.json` → `application/json`
- `.wasm` → `application/wasm`
- `.html` → `text/html`

### Compression
Enable gzip or brotli compression to reduce transfer size:
- Nginx: `gzip on;`
- Apache: `mod_deflate`
- CDN: Usually enabled by default

## CDN Deployment

### Cloudflare
1. Upload `dist/` to your origin server
2. Add your domain to Cloudflare
3. Enable caching and compression
4. Set cache rules for static assets

### Fastly / AWS CloudFront
1. Upload `dist/` to S3 or origin
2. Create CDN distribution
3. Configure caching policies
4. Enable compression

## Environment Variables

The serve.js script supports:
```bash
PORT=3000 node serve.js
```

## Post-Deployment Checklist

- [ ] Site loads without errors
- [ ] Console shows no 404s
- [ ] Can open files (if using Chrome/Edge)
- [ ] Extensions load properly
- [ ] HTTPS is configured
- [ ] Compression is enabled
- [ ] Cache headers are set

## Updating

To deploy a new version:
```bash
npm run build
# Upload new dist/ directory
```

Your users may need to clear cache or use Ctrl+F5 to see updates.

## Troubleshooting

**Blank screen**: Check browser console, verify MIME types
**404 errors**: Ensure all files are uploaded, check paths
**Can't open files**: Requires HTTPS and Chrome/Edge 86+
**Slow loading**: Enable compression, use CDN

## Production Optimizations

1. **Remove unused extensions** from `dist/extensions/`
2. **Enable Brotli compression** (better than gzip)
3. **Use CDN** for global distribution
4. **Set cache headers** (1 year for assets)
5. **Enable HTTP/2** on your server
6. **Minify** if not already (VS Code assets are pre-minified)
