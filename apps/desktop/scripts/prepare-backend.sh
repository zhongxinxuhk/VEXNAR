#!/usr/bin/env bash
# Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
# Repository: https://github.com/zhongxinxuhk/VEXNAR
# SPDX-License-Identifier: AGPL-3.0-or-later

# Builds the Go sidecar embedded by the Electron app. The sidecar only serves the
# API/gateway; Electron renders its own UI, so the embedded web UI is not needed.
set -euo pipefail

cd "$(dirname "$0")/.."          # apps/desktop
DESKTOP="$PWD"
ROOT="$(cd ../.. && pwd)"
OUT_DIR="$DESKTOP/resources/vexnar"
BIN="$OUT_DIR/vexnar"
if [[ "${OS:-}" == "Windows_NT" ]]; then
  BIN="$OUT_DIR/vexnar.exe"
fi

command -v go >/dev/null 2>&1 || {
  echo "[backend] go not found; install Go $(awk '$1 == "go" { print $2; exit }' "$ROOT/go.mod") or newer" >&2
  exit 1
}
if [[ "${VEXNAR_ALLOW_TOOLCHAIN_DOWNLOAD:-0}" != "1" ]]; then
  export GOTOOLCHAIN=local
fi
mkdir -p "$OUT_DIR"
echo "[backend] building Go sidecar..."
(
  cd "$ROOT"
  CGO_ENABLED=0 go build \
    -trimpath \
    -ldflags "-s -w" \
    -o "$BIN" \
    ./cmd/vexnar
)
chmod +x "$BIN"

# The Go engine resolves skills from VEXNAR_SKILL_DIR; package the repository
# skills so a packaged install behaves like the server distribution.
if [[ -d "$ROOT/skills" ]]; then
  rm -rf "$DESKTOP/resources/skills"
  mkdir -p "$DESKTOP/resources/skills"
  cp -R "$ROOT/skills/." "$DESKTOP/resources/skills/"
fi
echo "[backend] $BIN"
