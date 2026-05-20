#!/bin/sh
set -eu

DB_PATH="${POLIS_DB_PATH:-/app/data/polis.sqlite}"
DB_DIR=$(dirname "$DB_PATH")
mkdir -p "$DB_DIR"

CACHE_DIR="${POLIS_CACHE_DIR:-$DB_DIR/cache}"
mkdir -p "$CACHE_DIR"

exec "$@"
