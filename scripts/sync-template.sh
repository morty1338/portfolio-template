#!/usr/bin/env bash
# Pulls code updates from the portfolio template into a site built from it.
# Each side writes only its own content folder (content/ here, content-demo/ in the template),
# so the merge only touches code.
#
# Usage:
#   scripts/sync-template.sh           merge template/main, then install, test and build
#   scripts/sync-template.sh --check   list code that differs from the template (should be empty;
#                                      code changes belong in the template, not in the site)
set -euo pipefail

REMOTE="${TEMPLATE_REMOTE:-template}"
if ! git remote get-url "$REMOTE" >/dev/null 2>&1; then
  echo "No '$REMOTE' remote. Add it once: git remote add $REMOTE <template repo URL>" >&2
  exit 1
fi
git fetch --quiet "$REMOTE"

code_diff() { git diff --stat "$REMOTE/main" HEAD -- . ':(exclude)content'; }

if [[ "${1:-}" == "--check" ]]; then
  if [[ -z "$(code_diff)" ]]; then
    echo "✓ code is identical to $REMOTE/main"
    exit 0
  fi
  echo "Code that differs from $REMOTE/main (move these changes to the template):"
  code_diff
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "The working tree has uncommitted changes. Commit or stash them first." >&2
  exit 1
fi

git merge --no-edit "$REMOTE/main"
npm ci --ignore-scripts
npx vitest run
# The demo content must stay free of this site's data, too.
CONTENT_DIR=content-demo npx vitest run tests/unit/no-instance-data.test.ts
npm run build
echo "✓ synced with $REMOTE/main. Review (git log -1 --stat), then push."
