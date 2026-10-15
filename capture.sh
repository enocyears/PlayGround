#!/usr/bin/env bash
# Capture desktop + mobile screenshots of the exact preview URL.
# Output goes to CAPTURE_DIR (outside the source tree); the app is left running.
# Exit 75 = temporary navigation/browser infrastructure failure.
# Exit 1  = script usage error or rendering defect.
set -euo pipefail
cd "$(dirname "$0")"

: "${CAPTURE_URL:?Set CAPTURE_URL to the exact preview URL.}"
: "${CAPTURE_DIR:?Set CAPTURE_DIR to the screenshot output directory.}"
: "${RUNTIME_DIR:?Set RUNTIME_DIR to the runtime scripts directory.}"
if [ -z "${CAPTURE_READY_SELECTOR:-}" ]; then
  CAPTURE_READY_SELECTOR="text=Reserva tu corte"
  export CAPTURE_READY_SELECTOR
fi

/usr/bin/time -p mkdir -p "$CAPTURE_DIR"
/usr/bin/time -p node "$RUNTIME_DIR/scripts/default-capture.mjs"
/usr/bin/time -p test -f "$CAPTURE_DIR/final-desktop.png"
/usr/bin/time -p test -f "$CAPTURE_DIR/final-mobile.png"
