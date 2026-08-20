#!/usr/bin/env bash
set -euo pipefail

# Run as root only after verifying the actual Chromium process command line and
# sandbox process tree. The scanner account must not be able to write this file.
: "${EVIDENCE_PATH:=/run/siteprobe/chromium-sandbox.verified}"
install -o root -g root -m 0444 /dev/stdin "$EVIDENCE_PATH" <<< 'enabled'
