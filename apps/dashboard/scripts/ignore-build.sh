#!/usr/bin/env bash
# Vercel "Ignored Build Step" for the dashboard (spec section 10). Vercel runs it inside apps/dashboard.
# Exit 0 skips the build, exit 1 builds. Any other code fails the deployment, so never return git's 128.
if [ -z "${VERCEL_GIT_PREVIOUS_SHA:-}" ]; then
  exit 1 # first deployment of this branch
fi
if ! git cat-file -e "${VERCEL_GIT_PREVIOUS_SHA}^{commit}" 2>/dev/null; then
  exit 1 # previous commit is older than Vercel's shallow clone
fi
if git diff --quiet "$VERCEL_GIT_PREVIOUS_SHA" HEAD -- ':/apps/dashboard' ':/packages/rt-analytics' ':/package-lock.json'; then
  exit 0
fi
exit 1
