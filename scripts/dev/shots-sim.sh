#!/usr/bin/env bash
# App Store screenshots from the iOS Simulator — REAL WKWebView, bundled (capacitor://) load.
# The bundled load is what makes safe-area insets resolve correctly (the HUD sits below the
# status bar / Dynamic Island); loading a dev-server URL instead leaves safe-area at 0 and the
# HUD collides with the status bar. State is driven via window.__SHOT__ injected into the
# bundled index.html (the harness in game.js reads it; inert for real users, no query string).
#
# Build the sim app first:
#   npx cap copy ios
#   xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug \
#     -destination 'generic/platform=iOS Simulator' -derivedDataPath build/sim-derived \
#     CODE_SIGNING_ALLOWED=NO build
# Then:  bash scripts/dev/shots-sim.sh
set -uo pipefail
ROOT="/Users/qili/git/moraine"
APP="$ROOT/build/sim-derived/Build/Products/Debug-iphonesimulator/App.app"
IDX="$APP/public/index.html"
BID="com.jfun.moraine"
# device table: "udid|slot|settle"  (slot = output dir under screenshots/appstore)
DEVICES=(
  "C26638E4-6243-42FA-8697-9D936F31B2F8|iphone-6.9|3.0"   # iPhone 17 Pro Max -> 1320x2868 (6.9")
  "96C80A83-19F1-4D74-8544-66670723874F|iphone-6.5|3.0"   # iPhone 11 Pro Max -> 1242x2688 (6.5", notch)
  "B6C44B7F-8125-476D-AABF-D9D5B97AA696|ipad-13|5.0"      # iPad Pro 13" M5    -> 2064x2752 (13"); slower to paint, needs longer settle
)
FILTER="${1:-}"   # optional: capture only this slot (e.g. `shots-sim.sh iphone-6.5`)

[ -f "$IDX.orig" ] || cp "$IDX" "$IDX.orig"

inject () {  # $1 = shot query, e.g. "shot=play&b=rapids"
  python3 - "$IDX" "$1" <<'PY'
import sys
idx, shot = sys.argv[1], sys.argv[2]
html = open(idx+".orig").read().replace('<head>', '<head><script>window.__SHOT__=%r;</script>' % shot, 1)
open(idx,"w").write(html)
PY
}

cleanbar () {  # $1 = udid — Apple marketing status bar: 9:41, full bars, full battery NO charging bolt
  xcrun simctl status_bar "$1" override --time "9:41" --dataNetwork wifi \
    --wifiMode active --wifiBars 3 --cellularMode active --cellularBars 4 \
    --batteryState discharging --batteryLevel 100 2>/dev/null || true
}

capture () {  # $1=udid  $2=slot  $3=settle-seconds
  local UDID="$1" SLOT="$2" SETTLE="$3"
  local OUT="$ROOT/screenshots/appstore/$SLOT"
  mkdir -p "$OUT"
  xcrun simctl boot "$UDID" 2>/dev/null || true
  xcrun simctl bootstatus "$UDID" -b
  cleanbar "$UDID"
  for spec in "01-play:shot=play&b=rapids" "02-perfect:shot=win&b=rapids&s=3" \
              "03-levels:shot=levels" "04-challenge:shot=play&b=double" "05-howto:shot=howto"; do
    local name="${spec%%:*}" q="${spec#*:}"
    inject "$q"
    # uninstall first so each shot is a guaranteed-fresh process + WebKit state
    # (install-over can foreground a not-fully-terminated instance -> stale frame).
    xcrun simctl uninstall "$UDID" "$BID" >/dev/null 2>&1 || true
    xcrun simctl install "$UDID" "$APP" >/dev/null
    xcrun simctl launch "$UDID" "$BID" >/dev/null
    sleep "$SETTLE"
    cleanbar "$UDID"
    xcrun simctl io "$UDID" screenshot "$OUT/$name.png" >/dev/null 2>&1
    echo "  $SLOT/$name.png"
  done
  # Work around an iPad-13"-sim WKWebView artifact: a stray spinner-like gray arc in the
  # EXTREME bottom-right corner of every iPad shot. It is NOT a DOM element (verified via a
  # live Chrome inspection at iPad size), NOT on the bare home screen, and absent on iPhone
  # sims — almost certainly an iPad-Pro-13"-sim rendering quirk in dead corner space. Paint
  # it out by mirroring the clean bottom-LEFT corner (bg is a vertical gradient, so it matches
  # seamlessly). Verify on a REAL iPad whether the arc exists there at all (may be sim-only).
  if [ "$SLOT" = "ipad-13" ]; then
    python3 - "$OUT" <<'PY'
import sys, glob
from PIL import Image
for p in glob.glob(sys.argv[1] + "/*.png"):
    im = Image.open(p).convert("RGB")
    L = im.crop((0, 2600, 204, 2752)).transpose(Image.FLIP_LEFT_RIGHT)
    im.paste(L, (1860, 2600)); im.save(p)
PY
  fi
}

for row in "${DEVICES[@]}"; do
  IFS='|' read -r udid slot settle <<< "$row"
  [ -n "$FILTER" ] && [ "$FILTER" != "$slot" ] && continue
  capture "$udid" "$slot" "$settle"
done
cp "$IDX.orig" "$IDX"          # restore pristine bundle (no injected global)
echo done
