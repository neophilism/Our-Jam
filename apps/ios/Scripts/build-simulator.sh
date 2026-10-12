#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [ "$(uname -s)" != Darwin ]; then echo 'A Mac with Xcode is required to compile the iOS application.' >&2; exit 1; fi
xcodebuild -version
python3 Scripts/project.py
swift test
xcodebuild -project OurJam.xcodeproj -scheme OurJam -configuration Release \
  -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath build CODE_SIGNING_ALLOWED=NO ONLY_ACTIVE_ARCH=YES \
  ARCHS="$(uname -m)" build
mkdir -p artifacts
ARCH="$(uname -m)"
ditto -c -k --keepParent build/Build/Products/Release-iphonesimulator/OurJam.app "artifacts/OurJam-simulator-${ARCH}.zip"
printf 'Architecture: %s\nBundle: com.neophilism.ourjam.rehearsal\nUnsigned simulator artifact, not an IPA or TestFlight upload.\n' "$ARCH" > artifacts/BUILD-INFO.txt
xcodebuild -version >> artifacts/BUILD-INFO.txt
shasum -a 256 "artifacts/OurJam-simulator-${ARCH}.zip" > "artifacts/SHA256SUMS-${ARCH}.txt"
