#!/usr/bin/env bash
# Runs `go vet` across the collectors Go workspace.
# Skips (exit 0) if the `go` toolchain isn't installed locally — see
# gofmt-check.sh for why this isn't a hard requirement today.
set -euo pipefail

if ! command -v go >/dev/null 2>&1; then
  echo "go-vet-check: no local Go toolchain found, skipping" >&2
  exit 0
fi

cd "$(dirname "$0")/../backend/collectors"

# `go vet ./...`/`all` don't work from the go.work root itself (see CLAUDE.md's
# note on the same issue for `go build`) — `all` also pulls in every
# dependency's own packages/tests, which is noise, not our code. Vet each
# workspace module on its own instead, where `./...` correctly scopes to just
# that module's packages.
modules=$(awk '/^use \(/{flag=1; next} /^\)/{flag=0} flag {print $1}' go.work)
status=0
for m in $modules; do
  if out=$(cd "$m" && go vet ./... 2>&1); then
    continue
  fi
  # `go vet` on this Go toolchain also surfaces findings located inside
  # third-party dependency source under the module cache (e.g. a diagnostic
  # whose file path is .../pkg/mod/google.golang.org/protobuf@.../decode.go)
  # — verified via a from-scratch minimal reproduction, not specific to this
  # repo. Those aren't ours to fix and shouldn't block a commit; only fail on
  # a diagnostic pointing at our own source.
  own_issues=$(printf '%s\n' "$out" | grep -v '/pkg/mod/' || true)
  if [ -n "$own_issues" ]; then
    echo "$own_issues" >&2
    status=1
  fi
done
exit $status
