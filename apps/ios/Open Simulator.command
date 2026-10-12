#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
if ! xcrun --find simctl >/dev/null 2>&1; then
  echo 'Install Xcode and an iOS Simulator runtime, then select Xcode in Settings > Locations > Command Line Tools.'
  read -r -p 'Press Return to close.' _
  exit 1
fi
APP="${1:-$PWD/OurJam.app}"
if [ ! -d "$APP" ]; then
  echo 'Extract OurJam-Simulator.zip so OurJam.app is beside this script, or pass its path as the first argument.'
  read -r -p 'Press Return to close.' _
  exit 1
fi
DEVICE=$(xcrun simctl list devices available -j | python3 -c 'import json,sys; d=json.load(sys.stdin); ids=[v["udid"] for k,vs in d["devices"].items() if "iOS" in k for v in vs if v["name"].startswith("iPhone")]; print(ids[0] if ids else "")')
if [ -z "$DEVICE" ]; then
  echo 'No available iPhone Simulator was found. Add one in Xcode > Settings > Components.'
  read -r -p 'Press Return to close.' _
  exit 1
fi
open -a Simulator
xcrun simctl boot "$DEVICE" 2>/dev/null || true
xcrun simctl bootstatus "$DEVICE" -b
xcrun simctl install "$DEVICE" "$APP"
xcrun simctl launch "$DEVICE" com.neophilism.ourjam
