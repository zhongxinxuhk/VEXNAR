#!/usr/bin/env bash
# Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
# Repository: https://github.com/zhongxinxuhk/VEXNAR
# SPDX-License-Identifier: AGPL-3.0-or-later

# Builds a trimmed, static PostgreSQL for macOS arm64 (or the host arch).
#
# Used by .github/workflows/pg-macos.yml and runnable locally:
#   bash scripts/ci/build-pg-macos.sh
#
# Env:
#   PG_VERSION    PostgreSQL version (default 16.16)
#   PG_WORK_DIR   source/build cache (default .pg-build)
#   PG_PREFIX     install prefix (default $PG_WORK_DIR/pg-$PG_VERSION)
#   PG_OUT        output tarball (default dist/pg-darwin-$PG_ARCH.tar.gz)
#   PG_ARCH       expected arch (default host arch)
set -euo pipefail

VERSION="${PG_VERSION:-16.16}"
ARCH="${PG_ARCH:-$(uname -m)}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WORK="${PG_WORK_DIR:-$ROOT/.pg-build}"
PREFIX="${PG_PREFIX:-$WORK/pg-$VERSION}"
OUT="${PG_OUT:-$ROOT/dist/pg-darwin-$ARCH.tar.gz}"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "build-pg-macos.sh: macOS only (found $(uname -s))" >&2
  exit 1
fi
if [[ "$(uname -m)" != "$ARCH" ]]; then
  echo "build-pg-macos.sh: expected $ARCH, running on $(uname -m)" >&2
  exit 1
fi

TARBALL="$WORK/postgresql-$VERSION.tar.bz2"
SHASUM_FILE="$TARBALL.sha256"
SRC="$WORK/postgresql-$VERSION"

mkdir -p "$WORK" "$(dirname "$OUT")"

if [[ ! -f "$TARBALL" ]]; then
  echo "[pg] downloading PostgreSQL $VERSION..."
  curl -fsSL "https://ftp.postgresql.org/pub/source/v$VERSION/postgresql-$VERSION.tar.bz2" -o "$TARBALL"
fi
if [[ ! -f "$SHASUM_FILE" ]]; then
  curl -fsSL "https://ftp.postgresql.org/pub/source/v$VERSION/postgresql-$VERSION.tar.bz2.sha256" -o "$SHASUM_FILE"
fi
(cd "$WORK" && shasum -a 256 -c "$(basename "$SHASUM_FILE")" >/dev/null)

if [[ ! -d "$SRC" ]]; then
  echo "[pg] extracting source..."
  tar -xjf "$TARBALL" -C "$WORK"
fi

cd "$SRC"
if [[ -f Makefile && -f config.status ]]; then
  make distclean >/dev/null 2>&1 || true
fi

echo "[pg] configuring (trimmed, relocatable)..."
./configure \
  --prefix="$PREFIX" \
  --disable-rpath \
  --enable-thread-safety \
  --without-readline \
  --without-zlib \
  --without-icu \
  --without-openssl \
  --without-gssapi \
  --without-ldap \
  --without-pam \
  --without-lz4 \
  --without-zstd \
  --disable-nls \
  >/dev/null

echo "[pg] building..."
make -C src -j"$(sysctl -n hw.ncpu)" all >/dev/null

echo "[pg] installing to $PREFIX..."
rm -rf "$PREFIX"
make -C src install >/dev/null

# Trim: keep the server, initdb/pg_ctl, and the few client tools the desktop
# client uses. Everything else is contrib, headers, static archives or docs.
KEEP_BINS="postgres initdb pg_ctl psql createdb pg_dump pg_restore pg_isready"
for f in "$PREFIX"/bin/*; do
  name="$(basename "$f")"
  case " $KEEP_BINS " in
    *" $name "*) ;;
    *) rm -f "$f" ;;
  esac
done
rm -rf "$PREFIX/include" "$PREFIX/share/doc" "$PREFIX/share/man" "$PREFIX/lib/pkgconfig"
find "$PREFIX/lib" -maxdepth 1 -type f -name '*.a' -delete
# Keep only libpq at the top level; ecpg/pgtypes are not used by the client.
find "$PREFIX/lib" -maxdepth 1 -type f -name '*.dylib' ! -name 'libpq.5.dylib' -delete
# Drop symlinks whose targets were trimmed (Tauri refuses dangling entries).
for link in "$PREFIX"/lib/*.dylib; do
  [[ -L "$link" ]] || continue
  if [[ "$(basename "$(readlink "$link")")" != "libpq.5.dylib" ]]; then
    rm -f "$link"
  fi
done
rm -f "$PREFIX/lib"/*.la "$PREFIX/lib"/*.pc
if [[ -e "$PREFIX/lib/libecpg.dylib" ]]; then rm -f "$PREFIX/lib/libecpg"*.dylib; fi
if [[ -e "$PREFIX/lib/libpgtypes.dylib" ]]; then rm -f "$PREFIX/lib/libpgtypes"*.dylib; fi
# initdb creates text-search dictionaries that load built-in modules
# ($libdir/dict_snowball), so keep everything src/ installed and only drop
# the pgxs build scaffolding.
if [[ -d "$PREFIX/lib/postgresql" ]]; then
  rm -rf "$PREFIX/lib/postgresql/pgxs"
fi

# PostgreSQL is not built with -static; make the install relocatable by
# rewriting absolute install names to paths relative to each binary.
patch_binary() {
  local f="$1" rel="$2"
  local dep
  while IFS= read -r dep; do
    [[ -z "$dep" ]] && continue
    case "$dep" in
      "$PREFIX"/*) install_name_tool -change "$dep" "$rel/${dep#"$PREFIX/"}" "$f" ;;
    esac
  done < <(otool -L "$f" | tail -n +2 | sed -E 's/^[[:space:]]+//; s/ \(compatibility version.*$//')
  codesign --force --sign - "$f" >/dev/null 2>&1 || true
}

for f in "$PREFIX"/bin/*; do
  patch_binary "$f" '@executable_path/..'
done
for lib in "$PREFIX"/lib/*.dylib; do
  [[ -L "$lib" ]] && continue
  install_name_tool -id "@loader_path/$(basename "$lib")" "$lib"
  patch_binary "$lib" '@loader_path'
done
if [[ -d "$PREFIX/lib/postgresql" ]]; then
  for mod in "$PREFIX"/lib/postgresql/*; do
    [[ -f "$mod" ]] || continue
    patch_binary "$mod" '@loader_path/..'
  done
fi

# Fail the build if any binary still points at a build-machine prefix.
echo "[pg] checking dynamic dependencies..."
for f in "$PREFIX"/bin/*; do
  if otool -L "$f" | tail -n +2 | grep -E "$PREFIX|$WORK|/opt/homebrew|/usr/local" >/dev/null; then
    echo "[pg] non-portable dependency in $f:" >&2
    otool -L "$f" >&2
    exit 1
  fi
done
for f in "$PREFIX"/lib/*.dylib "$PREFIX"/lib/postgresql/*; do
  [[ -f "$f" ]] || continue
  if otool -L "$f" | tail -n +2 | grep -E "$PREFIX|$WORK|/opt/homebrew|/usr/local" >/dev/null; then
    echo "[pg] non-portable dependency in $f:" >&2
    otool -L "$f" >&2
    exit 1
  fi
done

# Smoke test: initdb → start → create database → query → stop, all from the
# trimmed install. This catches missing share files before CI uploads it.
SMOKE="$(mktemp -d)"
cleanup() {
  if [[ -f "$SMOKE/data/postmaster.pid" ]]; then
    "$PREFIX/bin/pg_ctl" -D "$SMOKE/data" -m immediate stop >/dev/null 2>&1 || true
  fi
  rm -rf "$SMOKE"
}
trap cleanup EXIT

PASSWORD="smoke-$(date +%s)-$$"
printf '%s' "$PASSWORD" > "$SMOKE/pwfile"
PORT="$(python3 - <<'PY'
import socket
s = socket.socket()
s.bind(("127.0.0.1", 0))
print(s.getsockname()[1])
s.close()
PY
)"

echo "[pg] smoke test on port $PORT..."
"$PREFIX/bin/initdb" -D "$SMOKE/data" -U vexnar \
  --auth-local=trust --auth-host=scram-sha-256 \
  --pwfile="$SMOKE/pwfile" --encoding=UTF8 --locale=C >/dev/null
"$PREFIX/bin/pg_ctl" -D "$SMOKE/data" -w -t 30 \
  -o "-p $PORT -c listen_addresses=127.0.0.1 -c unix_socket_directories=$SMOKE" \
  start >/dev/null
PGPASSWORD="$PASSWORD" "$PREFIX/bin/createdb" -h 127.0.0.1 -p "$PORT" -U vexnar vexnar
PGPASSWORD="$PASSWORD" "$PREFIX/bin/psql" -h 127.0.0.1 -p "$PORT" -U vexnar -d vexnar \
  -tAc "select 'ok'" | grep -qx ok
"$PREFIX/bin/pg_ctl" -D "$SMOKE/data" -m fast -w stop >/dev/null

# Package as pg/ so the client can extract it straight into resources/pg.
cat > "$PREFIX/pg.version.json" <<EOF
{
  "version": "$VERSION",
  "os": "darwin",
  "arch": "$ARCH",
  "static": false,
  "relocatable": true,
  "built_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

STAGE="$WORK/stage"
rm -rf "$STAGE"
mkdir -p "$STAGE"
cp -R "$PREFIX" "$STAGE/pg"
tar -C "$STAGE" -czf "$OUT" pg
(cd "$(dirname "$OUT")" && shasum -a 256 "$(basename "$OUT")" > "$(basename "$OUT").sha256")
SIZE="$(du -h "$OUT" | awk '{print $1}')"
echo "[pg] wrote $OUT ($SIZE)"
