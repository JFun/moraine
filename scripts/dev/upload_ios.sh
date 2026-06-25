#!/usr/bin/env bash
# Build a Release archive of Moraine and upload it to App Store Connect (TestFlight).
# One-shot: copies the latest web bundle, archives Release, exports + uploads via Xcode's
# stored Apple ID (no API key / app-specific password needed).
#
# BEFORE each upload bump CURRENT_PROJECT_VERSION in ios/App/App.xcodeproj/project.pbxproj
# (BOTH the Debug and Release target configs) so (MARKETING_VERSION, CURRENT_PROJECT_VERSION)
# is unique in ASC — this script does NOT auto-bump.
#
# Prereqs (all currently satisfied):
#   - ASC app record exists for bundle com.jfun.moraine (Apple ID 6784094990).
#   - Apple ID tbcql1986@gmail.com signed into Xcode > Settings > Accounts with App Store
#     Connect access for the PAID team Y3T546NP6T ("Qili Chen"). The free personal team
#     N9DH28SYTB CANNOT publish — DEVELOPMENT_TEAM + teamID below must be the paid team.
#   - GoogleService-Info.plist present at ios/App/App/ and in the App target.
#   - Info.plist has UIRequiresFullScreen + ITSAppUsesNonExemptEncryption=false.
#   - AppIcon 1024 has NO alpha channel (App Store silently blanks alpha icons).
set -euo pipefail
cd "$(dirname "$0")/../.."
TEAM_ID="Y3T546NP6T"
ARCHIVE="build/Moraine.xcarchive"
EXPORT_OPTS="build/ExportOptions.plist"

echo "==> syncing web assets into the iOS bundle"
npx cap copy ios

echo "==> archiving Release"
xcodebuild archive \
  -project ios/App/App.xcodeproj \
  -scheme App \
  -configuration Release \
  -destination "generic/platform=iOS" \
  -archivePath "$ARCHIVE" \
  -allowProvisioningUpdates

echo "==> archive team (must be $TEAM_ID, the paid team):"
plutil -extract ApplicationProperties.Team raw "$ARCHIVE/Info.plist"

cat > "$EXPORT_OPTS" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key><string>app-store-connect</string>
  <key>destination</key><string>upload</string>
  <key>teamID</key><string>$TEAM_ID</string>
  <key>signingStyle</key><string>automatic</string>
  <key>uploadSymbols</key><true/>
  <key>stripSwiftSymbols</key><true/>
</dict>
</plist>
PLIST

echo "==> exporting + uploading to App Store Connect"
xcodebuild -exportArchive \
  -archivePath "$ARCHIVE" \
  -exportOptionsPlist "$EXPORT_OPTS" \
  -exportPath build/export \
  -allowProvisioningUpdates
# Success ends with: Progress 88%: Upload succeeded.  /  ** EXPORT SUCCEEDED **
# dSYM warnings for FirebaseAnalytics/GoogleAppMeasurement/GoogleAdsOnDeviceConversion are harmless.
