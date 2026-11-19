#!/usr/bin/env bash
# Wrapper around the repository-level macOS PG build script.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
export PG_OUT="${PG_OUT:-$ROOT/dist/pg-darwin-arm64.tar.gz}"
exec bash "$ROOT/../../scripts/ci/build-pg-macos.sh"
