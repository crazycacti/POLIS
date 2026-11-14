#!/usr/bin/env sh
set -eu

DEST="assets/fonts"
ZIP_URL="https://github.com/dejavu-fonts/dejavu-fonts/releases/download/version_2_37/dejavu-fonts-ttf-2.37.zip"

if [ -f "$DEST/DejaVuSans.ttf" ] && [ -f "$DEST/DejaVuSans-Bold.ttf" ]; then
  echo "overlay fonts already present"
  exit 0
fi

mkdir -p "$DEST"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "fetching DejaVu TTF bundle"
curl -fsSL "$ZIP_URL" -o "$TMP/dejavu.zip"
unzip -q "$TMP/dejavu.zip" -d "$TMP/extract"

REGULAR="$(find "$TMP/extract" -name 'DejaVuSans.ttf' | head -n 1)"
BOLD="$(find "$TMP/extract" -name 'DejaVuSans-Bold.ttf' | head -n 1)"

if [ -z "$REGULAR" ] || [ -z "$BOLD" ]; then
  echo "DejaVuSans.ttf or DejaVuSans-Bold.ttf missing from bundle" >&2
  exit 1
fi

cp "$REGULAR" "$DEST/DejaVuSans.ttf"
cp "$BOLD" "$DEST/DejaVuSans-Bold.ttf"
echo "installed overlay fonts in $DEST"
