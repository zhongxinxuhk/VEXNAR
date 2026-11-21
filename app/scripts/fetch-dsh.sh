#!/usr/bin/env bash
# Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
# Repository: https://github.com/zhongxinxuhk/VEXNAR
# SPDX-License-Identifier: AGPL-3.0-or-later
#
# Fetch (or verify) the vendored dsh source tree at app/dsh.
# The tree is not committed: it is a pinned upstream checkout used for app-side
# development. Override the tag with DSH_TAG only after updating DSH_COMMIT.
set -euo pipefail

TAG="${DSH_TAG:-dsh-v0.2.2-rc.5}"
COMMIT="9c2670d3bce5275e0d1610272958121af87787bb"
REPO="https://github.com/deepseek-ai/deepseek-harness.git"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="$ROOT/dsh"

if [ -d "$DEST/.git" ]; then
  echo "app/dsh exists; fetching $TAG"
  git -C "$DEST" fetch --depth 1 origin "refs/tags/$TAG:refs/tags/$TAG" || true
  git -C "$DEST" checkout -q "$TAG"
else
  echo "cloning $REPO @ $TAG -> app/dsh"
  git clone --depth 1 --branch "$TAG" "$REPO" "$DEST"
fi

HEAD="$(git -C "$DEST" rev-parse HEAD)"
if [ "$HEAD" != "$COMMIT" ]; then
  echo "warning: app/dsh is at $HEAD, pinned $COMMIT" >&2
  exit 1
fi
echo "app/dsh OK: $TAG ($HEAD)"
