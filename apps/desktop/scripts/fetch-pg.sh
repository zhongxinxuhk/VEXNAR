#!/usr/bin/env bash
# Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
# Repository: https://github.com/zhongxinxuhk/VEXNAR
# SPDX-License-Identifier: AGPL-3.0-or-later

# Installs a trimmed portable PostgreSQL into apps/desktop/resources/pg.
#
# Usage:
#   bash scripts/fetch-pg.sh [tarball-or-url]
# Default: ../../dist/pg-darwin-arm64.tar.gz
#
# CI normally downloads the platform artifact produced by
# .github/workflows/desktop-electron.yml and extracts it into resources/pg.
set -euo pipefail

cd "$(dirname "$0")/.."
SRC="${1:-../../dist/pg-darwin-arm64.tar.gz}"
DEST="resources/pg"
TMP="$(mktemp -d)"

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

# Move the old tree aside instead of deleting it; the temporary directory is
# cleaned by the OS and this keeps the script safe to run in restricted shells.
if [[ -d "$DEST" ]]; then
  mv "$DEST" "$TMP/previous"
fi
mkdir -p "$DEST"
cp -R "$TMP/pg/." "$DEST/"
printf '%s\n' "# Keep this file in git; PG contents are ignored." > "$DEST/.keep"
echo "fetch-pg: installed $(cat "$DEST/pg.version.json" 2>/dev/null || echo "$SRC")"
