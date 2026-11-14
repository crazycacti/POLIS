#!/usr/bin/env sh
set -eu

DEST="assets/fonts"
mkdir -p "$DEST"

copy_if_exists() {
  if [ -f "$1" ]; then
    cp "$1" "$DEST/$(basename "$1")"
    echo "copied $1"
    return 0
  fi
  return 1
}

REGULAR=""
BOLD=""
for candidate in \
  /usr/share/fonts/truetype/dejavu/DejaVuSans.ttf \
  /usr/share/fonts/TTF/DejaVuSans.ttf \
  /opt/homebrew/share/fonts/dejavu-sans-fonts/DejaVuSans.ttf \
  /Library/Fonts/DejaVuSans.ttf; do
  if copy_if_exists "$candidate"; then
    REGULAR=1
    break
  fi
done

for candidate in \
  /usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf \
  /usr/share/fonts/TTF/DejaVuSans-Bold.ttf \
  /opt/homebrew/share/fonts/dejavu-sans-fonts/DejaVuSans-Bold.ttf \
  /Library/Fonts/DejaVuSans-Bold.ttf; do
  if copy_if_exists "$candidate"; then
    BOLD=1
    break
  fi
done

if [ -z "${REGULAR:-}" ] || [ -z "${BOLD:-}" ]; then
  echo "DejaVu fonts not found. Install fonts-dejavu-core (Linux) or font-dejavu (Homebrew)." >&2
  exit 1
fi
