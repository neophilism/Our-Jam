#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [ "$(uname -s)" != Darwin ]; then echo 'Launch this on a Mac with Xcode and an installed iOS Simulator runtime.' >&2; exit 1; fi
APP="${OURJAM_APP_PATH:-$PWD/build/Build/Products/Release-iphonesimulator/OurJam.app}"
if [ ! -d "$APP" ]; then bash Scripts/build-simulator.sh; fi
DEVICE="$(xcrun simctl list devices available -j | python3 -c 'import json,sys; d=json.load(sys.stdin); a=[x for k,v in d["devices"].items() if ".iOS-" in k for x in v if "iPhone" in x["name"] and x.get("isAvailable",True)]; b=[x for x in a if x["state"]=="Booted"]; print((b or a)[0]["udid"] if a else "")')"
if [ -z "$DEVICE" ]; then echo 'Install an iOS Simulator runtime in Xcode Settings > Components.' >&2; exit 1; fi
STATE="$(xcrun simctl list devices available -j | python3 -c 'import json,sys; print(next(x["state"] for v in json.load(sys.stdin)["devices"].values() for x in v if x["udid"]==sys.argv[1]))' "$DEVICE")"
if [ "$STATE" != Booted ]; then xcrun simctl boot "$DEVICE"; fi
open -a Simulator
xcrun simctl bootstatus "$DEVICE" -b
xcrun simctl install "$DEVICE" "$APP"
xcrun simctl launch "$DEVICE" com.neophilism.ourjam.rehearsal
printf '\nEnter the real server address and event code in the app.\nOpen the same server at /performer and /screen/EVENT-CODE in separate browser windows.\n'
