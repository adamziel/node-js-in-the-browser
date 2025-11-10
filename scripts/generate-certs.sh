#!/usr/bin/env bash
set -euo pipefail

CERT_DIR="packages/vscode-web/certs"
CERT_FILE="$CERT_DIR/vscode.localhost.pem"
KEY_FILE="$CERT_DIR/vscode.localhost-key.pem"

if ! command -v mkcert >/dev/null 2>&1; then
	echo "[certs] mkcert is required. Install it from https://github.com/FiloSottile/mkcert" >&2
	exit 1
fi

mkdir -p "$CERT_DIR"

echo "[certs] Installing local CA (if not already installed)..."
mkcert -install >/dev/null

echo "[certs] Generating certificate for vscode.localhost and *.vscode.localhost ..."
mkcert -cert-file "$CERT_FILE" -key-file "$KEY_FILE" \
	"vscode.localhost" "*.vscode.localhost"

echo "[certs] Certificates written to $CERT_FILE and $KEY_FILE"
