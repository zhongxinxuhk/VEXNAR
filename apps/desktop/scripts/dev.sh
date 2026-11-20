#!/usr/bin/env bash
# Deterministic dev launcher for the Electron (Codex-style) desktop shell.
#
# electron-vite starts Electron immediately; the main process then needs a
# PostgreSQL runtime. Resolve it up front so a missing runtime fails with a
# useful message instead of a native error dialog after the window opens.
set -euo pipefail

cd "$(dirname "$0")/.."          # apps/desktop
DESKTOP="$PWD"
ROOT="$(cd ../.. && pwd)"

if [[ ! -x "$DESKTOP/node_modules/.bin/electron-vite" ]]; then
  echo "[desktop] node_modules is incomplete; run: npm install" >&2
  exit 1
fi

HAS_PG=0

if [[ -n "${VEXNAR_PG_DSN:-}" ]]; then
  echo "[desktop] external PostgreSQL: VEXNAR_PG_DSN"
  HAS_PG=1
fi

if [[ -n "${VEXNAR_PG_BIN:-}" ]]; then
  if [[ ! -x "$VEXNAR_PG_BIN/initdb" ]]; then
    echo "[desktop] VEXNAR_PG_BIN does not contain initdb: $VEXNAR_PG_BIN" >&2
    exit 1
  fi
  echo "[desktop] portable PostgreSQL: $VEXNAR_PG_BIN"
  HAS_PG=1
fi

if [[ "$HAS_PG" == "0" ]]; then
  for candidate in \
    "$DESKTOP/resources/pg/bin" \
    "$ROOT/.pg-build/pg-16.16/bin" \
    "$ROOT/.pg-build/stage/pg/bin"
  do
    if [[ -x "$candidate/initdb" ]]; then
      export VEXNAR_PG_BIN="$candidate"
      echo "[desktop] portable PostgreSQL: $candidate"
      HAS_PG=1
      break
    fi
  done
fi

if [[ "$HAS_PG" == "0" ]]; then
  cat >&2 <<'EOF'
[desktop] PostgreSQL runtime not found.

Provide one of:
  - apps/desktop/resources/pg/bin (CI/local package layout)
  - repository .pg-build/pg-16.16/bin (local build)
  - VEXNAR_PG_BIN=/path/to/postgres/bin
  - VEXNAR_PG_DSN=postgres://user:pass@127.0.0.1:5432/vexnar

Then run `npm run dev` again.
EOF
  exit 1
fi

echo "[desktop] starting Electron dev shell..."
exec "$DESKTOP/node_modules/.bin/electron-vite" dev "$@"