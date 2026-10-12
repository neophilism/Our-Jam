#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
failed() {
  local status=$?
  if [ "$status" -ne 0 ]; then
    printf '\nOur Jam did not start. The error is shown above; saved shows and audio were not reset.\n'
    if [ -t 0 ]; then read -r -p 'Press Return to close.' _; fi
  fi
  exit "$status"
}
trap failed EXIT
if ! command -v node >/dev/null 2>&1; then
  echo 'Install Node.js 24 before running Our Jam. No paid account is needed.'
  exit 1
fi
node scripts/local-setup.mjs prepare
NODE_ENV=development npm run build
# The local entry point ignores provider credentials and always applies hard $0 limits.
NODE_ENV=development node --import tsx scripts/local-rehearsal.ts
