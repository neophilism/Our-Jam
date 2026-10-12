#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo 'Install Node.js 24 before running Our Jam. No paid account is needed.'
  read -r -p 'Press Return to close.' _
  exit 1
fi
if [ "$(node -p 'Number(process.versions.node.split(".")[0])')" -lt 24 ]; then
  echo 'Our Jam requires Node.js 24 or newer.'
  read -r -p 'Press Return to close.' _
  exit 1
fi
if ! command -v ffmpeg >/dev/null 2>&1 || ! command -v ffprobe >/dev/null 2>&1; then
  echo 'Install FFmpeg to validate and play uploaded songs. With Homebrew already installed: brew install ffmpeg'
  read -r -p 'Press Return to close.' _
  exit 1
fi
if [ ! -d node_modules ]; then npm ci; fi
npm run build
exec node --import tsx scripts/local-rehearsal.ts
