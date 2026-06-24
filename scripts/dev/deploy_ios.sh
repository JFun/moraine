#!/usr/bin/env bash
# One-shot deploy to the paired iPhone: sync web → build → install → launch.
# Part of the edit → self-test → deploy loop. Run after web/ changes.
#   scripts/dev/deploy_ios.sh
set -euo pipefail
cd "$(dirname "$0")/../.."

DEVICE_ID="B7CC8868-E918-5043-A37E-32AC17F755E7"   # iPhone 13 Pro (paired). Re-run `xcrun devicectl list devices` if stale.
BUNDLE_ID="com.jfun.moraine"
APP="build/derived/Build/Products/Debug-iphoneos/App.app"

echo "— sync web payload —"
npx cap sync ios >/dev/null

echo "— build —"
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug \
  -destination 'generic/platform=iOS' \
  -derivedDataPath build/derived \
  -allowProvisioningUpdates build 2>&1 | tail -1

# devicectl occasionally drops the first connection ("Connection reset by peer") — retry once.
install_app(){ xcrun devicectl device install app --device "$DEVICE_ID" "$APP" 2>&1 | tail -3; }
echo "— install —"
install_app || { echo "  transient failure — retrying…"; install_app; }

echo "— launch —"
xcrun devicectl device process launch --device "$DEVICE_ID" "$BUNDLE_ID" 2>&1 | tail -1
echo "✓ deployed to device"
