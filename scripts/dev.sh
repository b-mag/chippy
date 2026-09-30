#!/usr/bin/env bash
set -o pipefail
cd "$(dirname "$0")/.."
mkdir -p logs
echo "Starting Spring Boot on http://localhost:8080 and Angular on http://localhost:4200"
mvn -pl chippy-api spring-boot:run > >(tee logs/dev-api.log) 2>&1 &
api_pid=$!
npm --prefix frontend start > >(tee logs/dev-ui.log) 2>&1 &
ui_pid=$!
echo "API pid $api_pid, UI pid $ui_pid. Logs: logs/dev-api.log and logs/dev-ui.log"
trap 'kill $api_pid $ui_pid 2>/dev/null' INT TERM
wait
