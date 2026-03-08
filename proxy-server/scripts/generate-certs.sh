#!/usr/bin/env bash
set -euo pipefail

# Usage: ./generate-certs.sh <server-ip> [additional-hosts...]
# Example: ./generate-certs.sh 45.1.2.3
# Example: ./generate-certs.sh 45.1.2.3 proxy.example.com

if [ $# -lt 1 ]; then
  echo "usage: $0 <server-ip> [additional-hosts...]"
  echo "  generates TLS certs for proxy-server and the root CA for clients"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OUT_DIR="$SCRIPT_DIR/../certs"
mkdir -p "$OUT_DIR"

# Check mkcert is installed
if ! command -v mkcert &>/dev/null; then
  echo "mkcert not found. install it first:"
  echo "  curl -JLO https://github.com/FiloSottile/mkcert/releases/latest/download/mkcert-v*-linux-amd64"
  exit 1
fi

# Generate root CA if it doesn't exist yet
mkcert -install 2>/dev/null || true

# Generate server cert for the provided hosts/IPs
mkcert -cert-file "$OUT_DIR/cert.pem" -key-file "$OUT_DIR/key.pem" "$@" localhost 127.0.0.1 ::1

# Copy root CA for clients
CA_ROOT="$(mkcert -CAROOT)"
cp "$CA_ROOT/rootCA.pem" "$OUT_DIR/rootCA.pem"

echo ""
echo "=== generated files in $OUT_DIR ==="
echo "  cert.pem    - server certificate (stays on proxy-server)"
echo "  key.pem     - server private key (stays on proxy-server)"
echo "  rootCA.pem  - root CA (copy to rss-proxy host)"
echo ""
echo "on the rss-proxy host, set:"
echo "  NODE_EXTRA_CA_CERTS=/path/to/rootCA.pem"
