#!/usr/bin/env bash
# Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
# Repository: https://github.com/zhongxinxuhk/VEXNAR
# SPDX-License-Identifier: AGPL-3.0-or-later

# Installs a prebuilt trimmed PostgreSQL into desktop/resources/pg.
#
# Usage:
#   scripts/fetch-pg.sh [tarball-or-url]
# Default source: ../dist/pg-darwin-arm64.tar.gz (produced by
# scripts/ci/build-pg-macos.sh). In CI, download the pg-darwin-arm64 artifact
# first and pass its path.
set -euo pipefail

cd "$(dirname "$0")/.."          # desktop/
SRC="${1:-../dist/pg-darwin-arm64.tar.gz}"
DEST="resources/pg"
TMP="$(mktemp -d)"
cleanup() { rm -r "$TMP" 2>/dev/null || true; }
trap cleanup EXIT

if [[ "$SRC" == http://* || "$SRC" == https://* ]]; then
  curl -fsSL "$SRC" -o "$TMP/pg.tar.gz"
else
  cp "$SRC" "$TMP/pg.tar.gz"
fi

tar -xzf "$TMP/pg.tar.gz" -C "$TMP"
test -x "$TMP/pg/bin/initdb" || {
  echo "fetch-pg: $SRC does not contain pg/bin/initdb" >&2
  exit 1
}

mkdir -p "$DEST"
find "$DEST" -mindepth 1 -delete
cp -R "$TMP/pg/." "$DEST/"
printf '%s\n' "# Keep this file in git; PG contents are ignored." > "$DEST/.keep"
echo "fetch-pg: installed $(cat "$DEST/pg.version.json" 2>/dev/null || echo "$SRC")"
