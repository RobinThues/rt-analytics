#!/usr/bin/env bash
# Vercel "Ignored Build Step" for the dashboard (spec section 10). Vercel runs it inside apps/dashboard.
# Exit 0 skips the build; any other exit code builds.
if [ -z "${VERCEL_GIT_PREVIOUS_SHA:-}" ]; then
  exit 1 # first deployment of this branch
fi
git diff --quiet "$VERCEL_GIT_PREVIOUS_SHA" HEAD -- ':/apps/dashboard' ':/packages/rt-analytics' ':/package-lock.json'
