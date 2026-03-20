#!/usr/bin/env bash
set -euo pipefail

REPO="eigencore/openfin"
BIN_NAME="openfin"
INSTALL_DIR="${OPENFIN_INSTALL_DIR:-$HOME/.local/bin}"

# Detect platform
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)

case "$OS" in
  darwin) PLATFORM="darwin" ;;
  linux)  PLATFORM="linux" ;;
  *)
    echo "Unsupported OS: $OS"
    exit 1
    ;;
esac

case "$ARCH" in
  x86_64 | amd64) CPU="x64" ;;
  arm64 | aarch64) CPU="arm64" ;;
  *)
    echo "Unsupported architecture: $ARCH"
    exit 1
    ;;
esac

ASSET_NAME="${BIN_NAME}-${PLATFORM}-${CPU}"

# Fetch latest release version
echo "Fetching latest openfin release..."
LATEST=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" | grep '"tag_name"' | sed -E 's/.*"tag_name": *"([^"]+)".*/\1/')

if [ -z "$LATEST" ]; then
  echo "Could not determine latest release."
  exit 1
fi

echo "Installing openfin ${LATEST} (${PLATFORM}-${CPU})..."

DOWNLOAD_URL="https://github.com/${REPO}/releases/download/${LATEST}/${ASSET_NAME}"

mkdir -p "$INSTALL_DIR"
DEST="$INSTALL_DIR/$BIN_NAME"

curl -fsSL "$DOWNLOAD_URL" -o "$DEST"
chmod +x "$DEST"

echo ""
echo "openfin installed to $DEST"

# Check if INSTALL_DIR is in PATH
if ! echo "$PATH" | grep -q "$INSTALL_DIR"; then
  echo ""
  echo "Add the following to your shell profile (~/.zshrc or ~/.bashrc):"
  echo "  export PATH=\"\$PATH:$INSTALL_DIR\""
fi

echo ""
echo "Run: openfin --help"
