#!/bin/bash
set -uo pipefail
cd "$(dirname "$0")"
status=0
if command -v node >/dev/null 2>&1; then
  node scripts/local-setup.mjs check || status=$?
else
  echo 'NEEDED - Install Node.js 24, then run this check again.'
  status=1
fi
if [ -t 0 ]; then printf '\n'; read -r -p 'Press Return to close.' _; fi
exit "$status"
