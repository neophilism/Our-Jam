#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
DEVICE="$(xcrun simctl list devices available -j | python3 -c 'import json,sys; d=json.load(sys.stdin); a=[x for k,v in d["devices"].items() if ".iOS-" in k for x in v if "iPhone" in x["name"] and x.get("isAvailable",True)]; print(a[0]["udid"] if a else "")')"
if [ -z "$DEVICE" ]; then echo 'No iOS runtime is installed on this runner.' >&2; exit 1; fi
xcrun simctl boot "$DEVICE"
xcrun simctl bootstatus "$DEVICE" -b
xcrun simctl install "$DEVICE" build/Build/Products/Release-iphonesimulator/OurJam.app
xcrun simctl launch "$DEVICE" com.neophilism.ourjam.rehearsal
sleep 3
xcrun simctl io "$DEVICE" screenshot "artifacts/native-launch-$(uname -m).png"
xcrun simctl terminate "$DEVICE" com.neophilism.ourjam.rehearsal
xcrun simctl shutdown "$DEVICE"
