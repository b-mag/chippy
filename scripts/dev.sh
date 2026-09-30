#!/usr/bin/env bash
set -o pipefail
cd "$(dirname "$0")/.."
mkdir -p logs

ui_url="http://localhost:4200"
api_url="http://localhost:8080"
wait_seconds=120

echo "Starting Spring Boot on $api_url and Angular on $ui_url"
mvn -pl chippy-api spring-boot:run > >(tee logs/dev-api.log) 2>&1 &
api_pid=$!
npm --prefix frontend start > >(tee logs/dev-ui.log) 2>&1 &
ui_pid=$!
echo "API pid $api_pid, UI pid $ui_pid. Logs: logs/dev-api.log and logs/dev-ui.log"
echo "Waiting for $ui_url ..."

ready=0
deadline=$((SECONDS + wait_seconds))
while (( SECONDS < deadline )); do
  if curl -fsS --max-time 2 "$ui_url" >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 1
done

if (( ready )); then
  echo "Opening $ui_url"
  if command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$ui_url" >/dev/null 2>&1 || true
  elif command -v open >/dev/null 2>&1; then
    open "$ui_url" >/dev/null 2>&1 || true
  else
    echo "No browser opener found. Open $ui_url manually."
  fi
else
  echo "Timed out waiting for $ui_url after ${wait_seconds}s. Open it manually when ready." >&2
fi

trap 'kill $api_pid $ui_pid 2>/dev/null' INT TERM
wait
