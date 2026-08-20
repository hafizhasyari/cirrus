#!/bin/sh
# Lockstep version sync for Cirrus.
#
# Usage:
#   scripts/bump-version.sh            # re-sync every package.json to the
#                                       # current root VERSION file
#   scripts/bump-version.sh 1.2.0      # write 1.2.0 to VERSION, then sync
#
# The root VERSION file is the single source of truth for all 10 first-party
# services (see CLAUDE.md's "Versioning" section) — this script is the only
# thing that writes into the 7 package.json files' "version" field, so they
# never drift from VERSION between releases.
set -eu
cd "$(dirname "$0")/.."

if [ "${1:-}" != "" ]; then
  printf '%s\n' "$1" > VERSION
fi

VERSION=$(cat VERSION | tr -d '[:space:]')

for f in \
  backend/package.json \
  backend/shared-types/package.json \
  backend/bff/package.json \
  backend/auth/package.json \
  backend/rbac/package.json \
  backend/aggregator/package.json \
  frontend/package.json
do
  VERSION="$VERSION" TARGET="$f" node -e "
    const fs = require('fs');
    const path = process.env.TARGET;
    const pkg = JSON.parse(fs.readFileSync(path, 'utf8'));
    pkg.version = process.env.VERSION;
    fs.writeFileSync(path, JSON.stringify(pkg, null, 2) + '\n');
  "
done

echo "Synced version $VERSION into 7 package.json files."
