#!/usr/bin/env zsh
set -euo pipefail

SRC_DIR="$(cd "$(dirname "$0")" && pwd)"
DEST_DIR="$HOME/.gemini/config/plugins/matrix-bridge"

echo "正在同步插件文件至: $DEST_DIR ..."
mkdir -p "$DEST_DIR"
cp -R "$SRC_DIR/plugin.json" "$SRC_DIR/README.md" "$SRC_DIR/assets" "$SRC_DIR/rules" "$SRC_DIR/skills" "$SRC_DIR/sidecars" "$DEST_DIR/"

node --check "$DEST_DIR/sidecars/matrix_console/main.mjs"
node --check "$DEST_DIR/sidecars/matrix_console/app.js"

echo "正在热重启 Matrix Bridge Sidecar ..."
pkill -f "matrix_console/main.mjs" 2>/dev/null || true
pkill -f "matrix-bridge/sidecars/matrix_console" 2>/dev/null || true

echo "✅ Matrix Bridge 插件同步完成！"
