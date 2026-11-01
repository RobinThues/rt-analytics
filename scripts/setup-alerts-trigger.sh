#!/usr/bin/env bash
# Creates the Cloud Scheduler job that starts the Alerts workflow every 15 minutes, because GitHub's own schedule
# doesn't start it (docs/DECISIONS.md). Run it again with a new token when the token expires.
# It asks for the token, so the token stays out of the shell history. It needs a fine-grained GitHub token for this repo
# only, with Actions read and write.
# Usage: scripts/setup-alerts-trigger.sh
set -euo pipefail

project=robin-thues
location=europe-west3
job=rt-analytics-alerts
schedule="3,18,33,48 * * * *"
workflow_url=https://api.github.com/repos/RobinThues/rt-analytics/actions/workflows/alerts.yml

read -rsp "GitHub token: " token
echo
if [ -z "$token" ]; then
  echo "No token given." >&2
  exit 1
fi

# The header goes through stdin, so the token isn't in curl's arguments.
code=$(curl -sS -o /dev/null -w '%{http_code}' -H @- "$workflow_url" <<<"Authorization: Bearer $token")
if [ "$code" != "200" ]; then
  echo "GitHub answered $code. Check that the token is for this repo and has Actions read and write." >&2
  exit 1
fi
echo "Token can read the workflow."

gcloud services enable cloudscheduler.googleapis.com --project "$project"

# --format=none: gcloud would otherwise print the job with its headers, and so the token.
if gcloud scheduler jobs describe "$job" --project "$project" --location "$location" --format='value(name)' >/dev/null 2>&1; then
  gcloud scheduler jobs update http "$job" --project "$project" --location "$location" --schedule "$schedule" \
    --uri "$workflow_url/dispatches" --http-method POST --message-body '{"ref":"main"}' \
    --update-headers "Accept=application/vnd.github+json,Authorization=Bearer $token,User-Agent=rt-analytics-alerts" \
    --format=none
  echo "Updated job $job."
else
  gcloud scheduler jobs create http "$job" --project "$project" --location "$location" --schedule "$schedule" \
    --uri "$workflow_url/dispatches" --http-method POST --message-body '{"ref":"main"}' \
    --headers "Accept=application/vnd.github+json,Authorization=Bearer $token,User-Agent=rt-analytics-alerts" \
    --format=none
  echo "Created job $job."
fi

gcloud scheduler jobs run "$job" --project "$project" --location "$location" --format=none
echo "Started one test run. Done."
