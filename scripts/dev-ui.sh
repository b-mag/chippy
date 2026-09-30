#!/usr/bin/env bash
set -o pipefail
cd "$(dirname "$0")/.."
mkdir -p logs
npm --prefix frontend start 2>&1 | tee logs/dev-ui.log
exit "${PIPESTATUS[0]}"
