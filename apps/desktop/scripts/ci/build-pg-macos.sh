#!/usr/bin/env bash
# Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
# Repository: https://github.com/zhongxinxuhk/VEXNAR
# SPDX-License-Identifier: AGPL-3.0-or-later

# Wrapper around the repository-level macOS PG build script.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
export PG_OUT="${PG_OUT:-$ROOT/dist/pg-darwin-arm64.tar.gz}"
exec bash "$ROOT/../../scripts/ci/build-pg-macos.sh"
