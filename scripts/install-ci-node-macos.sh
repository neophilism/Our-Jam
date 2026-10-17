#!/bin/bash
set -euo pipefail

# A job-private upstream Node distribution avoids Homebrew's mutable bottle
# dependency graph. Keep the same Node 24 line as the application CI executor.
test "$(uname -s)" = Darwin
test "$(uname -m)" = arm64
test -n "${BASH_ENV:-}"
ourjam_node_version=24.21.0
ourjam_archive="node-v${ourjam_node_version}-darwin-arm64.tar.gz"
ourjam_distribution="https://nodejs.org/dist/v${ourjam_node_version}"
ourjam_install_dir=$(mktemp -d "${TMPDIR:-/tmp}/ourjam-node.XXXXXX")
cd "$ourjam_install_dir"
curl --fail --silent --show-error --location --proto '=https' --proto-redir '=https' \
  --connect-timeout 15 --max-time 180 --retry 2 \
  "$ourjam_distribution/$ourjam_archive" -o "$ourjam_archive"
curl --fail --silent --show-error --location --proto '=https' --proto-redir '=https' \
  --connect-timeout 15 --max-time 60 --retry 2 \
  "$ourjam_distribution/SHASUMS256.txt" -o SHASUMS256.txt
ourjam_expected_sha=$(awk -v name="$ourjam_archive" '$2 == name { print $1; count++ } END { if (count != 1) exit 1 }' SHASUMS256.txt)
[[ "$ourjam_expected_sha" =~ ^[a-f0-9]{64}$ ]]
printf '%s  %s\n' "$ourjam_expected_sha" "$ourjam_archive" | shasum -a 256 -c -
tar -xzf "$ourjam_archive" --strip-components=1
test "$(./bin/node --version)" = "v$ourjam_node_version"
printf 'export PATH=%q:$PATH\n' "$ourjam_install_dir/bin" >> "$BASH_ENV"
export PATH="$ourjam_install_dir/bin:$PATH"
node --version
npm --version
