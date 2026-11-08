#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
git_dir=$(git rev-parse --absolute-git-dir)
# Tests may create temporary repositories; do not export this repo into them.
for variable in "${!GIT_@}"; do unset "$variable"; done
while read -r local_ref local_sha remote_ref remote_sha; do
  case "$local_ref:$local_sha" in refs/tags/*:*|*:0000000000000000000000000000000000000000) continue ;; esac
  if [[ $local_sha != "$(git rev-parse HEAD)" || -n $(git status --porcelain --untracked-files=normal) ]]; then
    echo "Cannot check $local_ref: check out its commit in a clean worktree and run scripts/ci-local --check first." >&2
    exit 1
  fi
  # A successful --check receipt never bypasses the first-push body requirement.
  if [[ $remote_sha == 0000000000000000000000000000000000000000 ]]; then
    scripts/ci-local --proposed-body
  fi
  if [[ ! -f "$git_dir/ci-local/$local_sha.ok" ]]; then scripts/ci-local --check; fi
done
