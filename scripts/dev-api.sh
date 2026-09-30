#!/usr/bin/env bash
set -o pipefail
cd "$(dirname "$0")/.."
mkdir -p logs
mvn -pl chippy-api spring-boot:run 2>&1 | tee logs/dev-api.log
exit "${PIPESTATUS[0]}"
