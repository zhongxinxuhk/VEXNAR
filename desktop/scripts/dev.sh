#!/usr/bin/env bash
# Builds the Go sidecar (and, unless SKIP_WEB=1, the static web UI) before
# starting Tauri. Tauri's beforeDevCommand runs concurrently with the Rust dev
# process, so a slow web build can let the app start with a stale sidecar.
# Keeping this step synchronous makes `npm run dev` and GoLand run
# configurations deterministic.
set -euo pipefail

cd "$(dirname "$0")/.."          # desktop/

bash scripts/prepare-sidecar.sh

TAURI_BIN="$PWD/node_modules/.bin/tauri"
if [[ ! -x "$TAURI_BIN" ]]; then
  echo "[desktop] @tauri-apps/cli missing; run npm install first" >&2
  exit 1
fi

exec "$TAURI_BIN" dev "$@"
