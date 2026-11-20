#!/usr/bin/env bash
# Builds the Go sidecar (and the static web UI it embeds) for the desktop shell.
#
# Usage: scripts/prepare-sidecar.sh [--release]
#   SKIP_WEB=1  reuse server/webui/dist instead of rebuilding the Next.js app
#
# Tauri's `beforeDevCommand` / `beforeBuildCommand` call this, so the external
# binary always exists before `cargo build` runs.
set -euo pipefail

cd "$(dirname "$0")/.."          # desktop/
DESKTOP="$PWD"
ROOT="$(cd .. && pwd)"
MODE="${1:-debug}"
REQUIRED_GO="$(awk '$1 == "go" { print $2; exit }' "$ROOT/go.mod")"

if ! command -v go >/dev/null 2>&1; then
  echo "[desktop] go not found; install Go >= ${REQUIRED_GO:-the go.mod version}" >&2
  exit 1
fi

# Go 1.21+ may try to download the exact toolchain named in go.mod. Behind a
# proxy with GOSUMDB=off that fails before the build starts, even when a newer
# local toolchain is installed. Use the local toolchain by default; opt back in
# with VEXNAR_ALLOW_TOOLCHAIN_DOWNLOAD=1.
if [[ "${VEXNAR_ALLOW_TOOLCHAIN_DOWNLOAD:-0}" != "1" ]]; then
  export GOTOOLCHAIN=local
fi

GO_VERSION="$(go env GOVERSION 2>/dev/null || true)"
echo "[desktop] go toolchain: ${GO_VERSION:-unknown} (required >= ${REQUIRED_GO:-unknown}, GOTOOLCHAIN=${GOTOOLCHAIN:-auto})"

if [[ "${SKIP_WEB:-0}" != "1" ]]; then
  echo "[desktop] building static web UI..."
  (cd "$ROOT/web" && npm run build:static)
  rm -rf "$ROOT/server/webui/dist"
  mkdir -p "$ROOT/server/webui/dist"
  cp -R "$ROOT/web/out/." "$ROOT/server/webui/dist/"
else
  echo "[desktop] SKIP_WEB=1: reusing server/webui/dist"
  test -f "$ROOT/server/webui/dist/index.html" || {
    echo "[desktop] server/webui/dist/index.html is missing; run without SKIP_WEB=1" >&2
    exit 1
  }
fi

TRIPLE="$(rustc -vV | sed -n 's/^host: //p')"
[[ -n "$TRIPLE" ]] || { echo "[desktop] cannot determine Rust host triple" >&2; exit 1; }

EXT=""
case "$TRIPLE" in
  *windows*) EXT=".exe" ;;
esac

mkdir -p "$DESKTOP/binaries"
OUT="$DESKTOP/binaries/vexnar-$TRIPLE$EXT"
DEV="$DESKTOP/binaries/vexnar$EXT"

BUILD_ARGS=(-tags embedui -trimpath)
if [[ "$MODE" == "--release" ]]; then
  BUILD_ARGS+=(-ldflags "-s -w")
fi

echo "[desktop] building sidecar ($TRIPLE)..."
if ! (cd "$ROOT" && CGO_ENABLED=0 go build "${BUILD_ARGS[@]}" -o "$OUT" ./cmd/vexnar); then
  cat >&2 <<EOF
[desktop] sidecar build failed.
[desktop] Required Go >= ${REQUIRED_GO:-unknown}; local is ${GO_VERSION:-unknown}.
[desktop] If Go tried to download a toolchain and GOSUMDB=off blocked it,
[desktop] install a compatible Go toolchain or set VEXNAR_ALLOW_TOOLCHAIN_DOWNLOAD=1
[desktop] with a working module checksum/proxy configuration.
EOF
  exit 1
fi

# Tauri resolves the triple-suffixed name; the plain copy keeps `cargo run`
# and the smoke mode working without rebuilding the shell.
cp "$OUT" "$DEV"
chmod +x "$OUT" "$DEV"
echo "[desktop] sidecar ready: $OUT"
