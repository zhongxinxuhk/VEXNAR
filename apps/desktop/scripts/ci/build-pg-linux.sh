#!/usr/bin/env bash
# Builds a trimmed, relocatable PostgreSQL for Linux x86_64.
#
# Used by .github/workflows/desktop-electron.yml. Run on the oldest supported
# glibc runner (ubuntu-22.04) so the bundled server stays compatible.
set -euo pipefail

VERSION="${PG_VERSION:-16.16}"
ARCH="${PG_ARCH:-x64}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WORK="${PG_WORK_DIR:-$ROOT/.pg-build-linux}"
PREFIX="${PG_PREFIX:-$WORK/pg-$VERSION}"
OUT="${PG_OUT:-$ROOT/dist/pg-linux-$ARCH.tar.gz}"

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "build-pg-linux.sh: Linux only (found $(uname -s))" >&2
  exit 1
fi

TARBALL="$WORK/postgresql-$VERSION.tar.bz2"
SHASUM_FILE="$TARBALL.sha256"
SRC="$WORK/postgresql-$VERSION"

mkdir -p "$WORK" "$(dirname "$OUT")"

if [[ ! -f "$TARBALL" ]]; then
  echo "[pg-linux] downloading PostgreSQL $VERSION..."
  curl -fsSL "https://ftp.postgresql.org/pub/source/v$VERSION/postgresql-$VERSION.tar.bz2" -o "$TARBALL"
fi
if [[ ! -f "$SHASUM_FILE" ]]; then
  curl -fsSL "https://ftp.postgresql.org/pub/source/v$VERSION/postgresql-$VERSION.tar.bz2.sha256" -o "$SHASUM_FILE"
fi
(cd "$WORK" && sha256sum -c "$(basename "$SHASUM_FILE")" >/dev/null)

if [[ ! -d "$SRC" ]]; then
  tar -xjf "$TARBALL" -C "$WORK"
fi

cd "$SRC"
if [[ -f Makefile && -f config.status ]]; then
  make distclean >/dev/null 2>&1 || true
fi

echo "[pg-linux] configuring (trimmed, relocatable)..."
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

echo "[pg-linux] building..."
make -C src -j"$(nproc)" all >/dev/null

echo "[pg-linux] installing to $PREFIX..."
rm -rf "$PREFIX"
make -C src install >/dev/null

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
rm -f "$PREFIX/lib"/*.la "$PREFIX/lib"/*.pc

echo "[pg-linux] checking dynamic dependencies..."
if command -v ldd >/dev/null; then
  for f in "$PREFIX"/bin/* "$PREFIX"/lib/*.so*; do
    [[ -f "$f" ]] || continue
    if ldd "$f" 2>/dev/null | grep -E "$PREFIX|/opt/homebrew|/usr/local" >/dev/null; then
      echo "[pg-linux] non-portable dependency in $f:" >&2
      ldd "$f" >&2
      exit 1
    fi
  done
fi

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

export LD_LIBRARY_PATH="$PREFIX/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"

echo "[pg-linux] smoke test on port $PORT..."
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

cat > "$PREFIX/pg.version.json" <<EOF
{
  "version": "$VERSION",
  "os": "linux",
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
(cd "$(dirname "$OUT")" && sha256sum "$(basename "$OUT")" > "$(basename "$OUT").sha256")
echo "[pg-linux] wrote $OUT ($(du -h "$OUT" | awk '{print $1}'))"
