#!/usr/bin/env bash
# Fails if any of the given Go files are not gofmt-formatted.
# Skips (exit 0) if the `go` toolchain isn't installed locally — collectors
# are normally built via the golang:1.26-alpine3.23 container, so a local
# Go install isn't guaranteed on every contributor's machine.
set -euo pipefail

if ! command -v gofmt >/dev/null 2>&1; then
  echo "gofmt-check: no local Go toolchain found, skipping" >&2
  exit 0
fi

unformatted=$(gofmt -l "$@")
if [ -n "$unformatted" ]; then
  echo "gofmt-check: the following files are not gofmt-formatted:" >&2
  echo "$unformatted" >&2
  echo "run: gofmt -w <file>" >&2
  exit 1
fi
