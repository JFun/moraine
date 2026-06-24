#!/usr/bin/env bash
# App Store screenshots from the live web preview via headless Chrome.
# Preview must be running:  python3 -m http.server 4173 -d web
# Usage: scripts/dev/shots.sh <cssW> <cssH> <scale> <outDir>
#   iPhone 6.5":  scripts/dev/shots.sh 414 896 3 screenshots/appstore/iphone-6.5   -> 1242x2688
#   iPad 13":     scripts/dev/shots.sh 1024 1366 2 screenshots/appstore/ipad-13    -> 2048x2732
set -euo pipefail
cd "$(dirname "$0")/../.."
W="${1:-414}"; H="${2:-896}"; SCALE="${3:-3}"; OUT="${4:-screenshots/appstore/iphone-6.5}"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
mkdir -p "$OUT"
shoot(){ "$CHROME" --headless=new --disable-gpu --hide-scrollbars \
  --force-device-scale-factor="$SCALE" --window-size="$W,$H" --virtual-time-budget=1600 \
  --screenshot="$OUT/$1.png" "http://localhost:4173/?$2" >/dev/null 2>&1; echo "  $1.png"; }
echo "shooting -> $OUT  ($((W*SCALE))x$((H*SCALE)))"
shoot 01-play      "shot=play&b=rapids"
shoot 02-perfect   "shot=win&b=rapids&s=3"
shoot 03-levels    "shot=levels"
shoot 04-challenge "shot=play&b=double"
shoot 05-howto     "shot=howto"
echo "done"
