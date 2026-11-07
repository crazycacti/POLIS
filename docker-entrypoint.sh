#!/bin/sh
set -eu

DB_PATH="${POLIS_DB_PATH:-/app/data/polis.sqlite}"
DB_DIR=$(dirname "$DB_PATH")
mkdir -p "$DB_DIR"

CACHE_DIR="${POLIS_CACHE_DIR:-$DB_DIR/cache}"
mkdir -p "$CACHE_DIR"

if [ "$(id -u)" = "0" ]; then
  # Data written by older images is owned by root; hand it to the app user before dropping root.
  find "$DB_DIR" "$CACHE_DIR" ! -user bun -exec chown bun:bun {} +
  exec setpriv --reuid=bun --regid=bun --init-groups -- "$@"
fi

exec "$@"
