#!/usr/bin/env bash
set -o pipefail
cd "$(dirname "$0")/.."
mkdir -p logs
if ! command -v mvn >/dev/null 2>&1; then
  echo "Maven was not found on PATH." | tee logs/build.log
  exit 1
fi
mvn -B package 2>&1 | tee logs/build.log
exit "${PIPESTATUS[0]}"
