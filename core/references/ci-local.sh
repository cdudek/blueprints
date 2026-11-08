#!/usr/bin/env bash
set -euo pipefail

# BEGIN REPO CONFIG — copy this file; adapt only this block to the repo's former PR CI.
CHECK_NAMES=(format lint typecheck test)
CHECK_COMMANDS=('make format-check' 'make lint' 'make typecheck' 'make test')
CHECK_TOOLS=('' '' '' '')
DECISION4_COMMAND='python3 "$(fetch_decision4)"'
# Optional until installed with the tested reference scripts; consumers enable both.
AI_REVIEW_COMMAND=''
FITNESS_COMMAND=''
# Optional remote-only evidence, after pushing (for example an infrastructure plan).
POST_PUSH_COMMAND=''
# END REPO CONFIG

usage() { echo 'Usage: scripts/ci-local [--check | --no-push | --decision4 | --proposed-body | --help] (CI_LOCAL_PR_BODY=proposed.md before first push)'; }
mode=full
if (( $# > 1 )); then usage >&2; exit 2; fi
case "${1:-}" in
  '') ;;
  --check) mode=check ;;
  --no-push) mode=no-push ;;
  --decision4) mode=decision4 ;;
  --proposed-body) mode=proposed-body ;;
  --help|-h) usage; exit 0 ;;
  *) usage >&2; exit 2 ;;
esac

cd "$(git rev-parse --show-toplevel)"
# Shared runner: validate the runtime before dependencies, checks or GitHub calls.
if [[ -f .nvmrc || -f package.json ]]; then
  if ! command -v node >/dev/null 2>&1; then
    echo 'ci-local needs Node from .nvmrc/engines; Node is missing. Run `nvm use`.' >&2
    exit 1
  fi
  node <<'NODE'
const fs = require('node:fs');
const fail = (message) => { console.error(message); process.exit(1); };
const engines = fs.existsSync('package.json') ? JSON.parse(fs.readFileSync('package.json', 'utf8')).engines?.node : undefined;
const hasNvmrc = fs.existsSync('.nvmrc');
if (!hasNvmrc && !engines) process.exit(0);
const source = hasNvmrc ? '.nvmrc' : 'engines.node';
const version = hasNvmrc ? fs.readFileSync('.nvmrc', 'utf8').trim() : engines;
const majorOf = (value) => /^(?:v|\^|~)?(\d+)(?:\.(?:\d+|x|\*)){0,2}$/.exec(value)?.[1];
const expected = majorOf(version);
if (!['24', '26'].includes(expected)) fail(`ci-local needs a supported Node LTS pin (24 or 26) in ${source}; found ${version}`);
if (engines && majorOf(engines) !== expected) fail(`ci-local needs engines.node to match Node ${expected} (from ${source}); found ${engines}`);
if (process.versions.node.split('.')[0] !== expected) fail(`ci-local needs Node ${expected} (from ${source}); you have ${process.version}; run \`nvm use\``);
console.log(`PASS node ${process.version} (from ${source})`);
NODE
fi
if [[ -n "$(git status --porcelain --untracked-files=normal)" ]]; then
  echo 'Refusing a dirty worktree; commit or remove changes first.' >&2
  exit 1
fi
sha=$(git rev-parse HEAD)
git_dir=$(git rev-parse --absolute-git-dir)
log_dir="$git_dir/ci-local/$sha"
mkdir -p "$log_dir"
export CI_LOCAL_EVIDENCE="$log_dir"
repo=''
branch=''
if [[ $mode != check && $mode != proposed-body ]]; then
  branch=$(git symbolic-ref --quiet --short HEAD) || {
    if [[ $mode != no-push || -z ${CI_LOCAL_PR:-} ]]; then echo 'A branch or CI_LOCAL_PR with --no-push is required.' >&2; exit 1; fi
  }
  repo=$(gh repo view --json nameWithOwner --jq .nameWithOwner)
fi

post_status() {
  gh api --method POST "repos/$repo/statuses/$sha" \
    -f "context=$1" -f "state=$2" -f "description=$3" > /dev/null
}

# Fetch only the shared host's checker; consumers never carry checker code or fixtures.
fetch_decision4() (
  set -euo pipefail
  local pin digest cache staged actual
  read -r pin digest < <(python3 - <<'LOCK'
import json, re
with open('.decision4.lock') as source:
    lock = json.load(source)
assert re.fullmatch(r'[0-9a-f]{40}', lock['pin']), 'Invalid Decision4 pin'
assert re.fullmatch(r'[0-9a-f]{64}', lock['sha256']), 'Invalid Decision4 sha256'
print(lock['pin'], lock['sha256'])
LOCK
  )
  [[ -n $pin && -n $digest ]] || { echo 'Invalid Decision4 lock' >&2; exit 1; }
  cache="$(git rev-parse --absolute-git-dir)/ci-local/decision4/$pin"
  mkdir -p "$cache"
  staged=''
  trap '[[ -z $staged ]] || rm -f "$staged"' EXIT
  if [[ ! -f $cache/checker.py ]]; then
    staged=$(mktemp "$cache/download.XXXXXX")
    curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 \
      "https://raw.githubusercontent.com/cdudek/blueprints/$pin/.github/scripts/decision4.py" -o "$staged"
  fi
  actual=$(python3 - "${staged:-$cache/checker.py}" <<'HASH'
import hashlib, pathlib, sys
print(hashlib.sha256(pathlib.Path(sys.argv[1]).read_bytes()).hexdigest())
HASH
  )
  if [[ $actual != "$digest" ]]; then
    echo 'Decision4 SHA-256 mismatch; refusing to execute the checker' >&2
    exit 1
  fi
  if [[ -n $staged ]]; then mv -f "$staged" "$cache/checker.py"; staged=''; fi
  printf '%s\n' "$cache/checker.py"
)
export -f fetch_decision4

validate_decision4() {
  local body_file=$1 files_file=$2 base_sha=$3
  local base_map="$log_dir/base-boundary-map.yaml"
  # An absent base map is normal when first adopting Decision4; other errors fail closed.
  local args=(--body-file "$body_file" --files "$files_file" --map boundary-map.yaml)
  if git cat-file -e "$base_sha:boundary-map.yaml" 2>/dev/null; then
    git show "$base_sha:boundary-map.yaml" > "$base_map"
    args+=(--base-map "$base_map")
  fi
  bash -euo pipefail -c "$DECISION4_COMMAND \"\$@\"" -- "${args[@]}"
}

record_decision4() {
  python3 - "$log_dir" "$sha" "$1" "$2" "$3" <<'PY'
import hashlib, json, pathlib, sys
folder, head, base, body, result = sys.argv[1:]
path = pathlib.Path(folder)
data = {'head': head, 'base': base, 'body_sha256': hashlib.sha256(pathlib.Path(body).read_bytes()).hexdigest(),
        'pass': result == '0', 'source': 'actual-pr-body-and-changed-paths'}
(path / 'decision4-result.json').write_text(json.dumps(data, indent=2) + '\n')
PY
}

review_body() {
  if [[ -n ${AI_REVIEW_COMMAND:-} ]]; then
    bash -euo pipefail -c "$AI_REVIEW_COMMAND --base \"\$1\" --head \"\$2\" --out \"\$3\" --body \"\$4\"" \
      -- "$1" "$sha" "$log_dir" "$2" > "$log_dir/ai-review.log" 2>&1 || {
      echo "FAIL AI review (see $log_dir/ai-review.log)" >&2; return 1;
    }
  fi
}

complete_fitness() {
  if [[ -n ${FITNESS_COMMAND:-} ]]; then
    bash -euo pipefail -c "$FITNESS_COMMAND --evidence \"\$1\" --body \"\$2\"" -- "$log_dir" "$1" \
      > "$log_dir/fitness.log" 2>&1 || {
      echo "FAIL complete fitness report (see $log_dir/fitness.log)" >&2; return 1;
    }
  fi
}

run_decision4() {
  # An absent PR is normal before opening one; an API error must not look like absence.
  if [[ -z ${CI_LOCAL_PR:-} ]]; then
    gh pr list --repo "$repo" --head "$branch" --state open --json number > "$log_dir/pr-list.json"
  fi
  local number
  number=${CI_LOCAL_PR:-$(jq -r '.[0].number // empty' "$log_dir/pr-list.json")}
  if [[ -z $number ]]; then echo 'Decision4: no open PR; rerun after opening it.'; return 0; fi
  gh pr view "$number" --repo "$repo" --json body,baseRefName,baseRefOid,headRefOid > "$log_dir/pr.json"
  if [[ $(jq -r .headRefOid "$log_dir/pr.json") != "$sha" ]]; then
    echo 'PR head does not match HEAD; refusing Decision4 status.' >&2; return 1
  fi
  # Include previous filenames too, so a rename cannot lower the decision floor.
  gh api --paginate "repos/$repo/pulls/$number/files" \
    --jq '.[] | .filename, (.previous_filename // empty)' > "$log_dir/files.txt"
  jq -r .body "$log_dir/pr.json" > "$log_dir/body.md"
  local base_sha result=0
  base_sha=$(jq -r .baseRefOid "$log_dir/pr.json")
  git cat-file -e "$base_sha^{commit}" 2>/dev/null || git fetch origin "$(jq -r .baseRefName "$log_dir/pr.json")"
  if [[ -n ${AI_REVIEW_COMMAND:-} ]]; then
    # Reuse the exact-head review: body edits do not trigger a second diff read.
    local review_base
    review_base=$(git merge-base HEAD "$base_sha")
    review_body "$review_base" "$log_dir/body.md" || return 1
    if ! cmp -s "$log_dir/body.md" <(jq -r .body "$log_dir/pr.json"); then
      gh pr edit "$number" --repo "$repo" --body-file "$log_dir/body.md"
      gh pr view "$number" --repo "$repo" --json body,baseRefName,baseRefOid,headRefOid > "$log_dir/pr.json"
      jq -r .body "$log_dir/pr.json" > "$log_dir/body.md"
      if [[ $(jq -r .headRefOid "$log_dir/pr.json") != "$sha" ]]; then
        echo 'PR head moved while publishing review tally.' >&2; return 1
      fi
    fi
  fi
  validate_decision4 "$log_dir/body.md" "$log_dir/files.txt" "$base_sha" > "$log_dir/decision4.log" 2>&1 || result=$?
  record_decision4 "$base_sha" "$log_dir/body.md" "$result"
  if (( result == 0 )); then complete_fitness "$log_dir/body.md" || result=1; fi
  gh pr view "$number" --repo "$repo" --json body,baseRefName,baseRefOid,headRefOid > "$log_dir/pr-after.json"
  if ! cmp -s "$log_dir/pr.json" "$log_dir/pr-after.json" || \
      [[ $(git rev-parse HEAD) != "$sha" || -n $(git status --porcelain --untracked-files=normal) ]]; then
    echo 'PR or worktree changed during validation; rerun Decision4.' >&2; return 1
  fi
  if (( result == 0 )); then
    post_status decision4 success 'PR body meets the changed-path decision floor'
    echo 'PASS decision4'
  else
    post_status decision4 failure 'PR body does not meet the changed-path decision floor'
    echo "FAIL decision4 (see $log_dir/decision4.log)" >&2
  fi
  return "$result"
}

if [[ $mode == no-push ]]; then
  # A bot head may be detached and must never be pushed to an owner-authored branch.
  if [[ ! ${CI_LOCAL_PR:-} =~ ^[1-9][0-9]*$ ]]; then echo '--no-push requires CI_LOCAL_PR.' >&2; exit 2; fi
  remote_sha=$(gh pr view "$CI_LOCAL_PR" --repo "$repo" --json headRefOid --jq .headRefOid)
  if [[ $remote_sha != "$sha" ]]; then echo 'PR head does not match HEAD.' >&2; exit 1; fi
fi

if [[ $mode == decision4 ]]; then run_decision4; exit $?; fi

# A fresh base snapshot makes ratchets independent of changes in another checkout.
base_ref=${CI_LOCAL_BASE_REF:-$(git symbolic-ref --quiet refs/remotes/origin/HEAD)} || {
  echo 'Set the default branch with git remote set-head origin --auto, or set CI_LOCAL_BASE_REF.' >&2
  exit 1
}
base_sha=$(git merge-base HEAD "$base_ref")
validate_proposed_body() {
  local body=${CI_LOCAL_PR_BODY:-${CI_LOCAL_BODY_FILE:-}}
  if [[ -z $body || ! -f $body || ! -s $body ]]; then
    echo 'First push requires CI_LOCAL_PR_BODY (or CI_LOCAL_BODY_FILE) naming a proposed PR body file.' >&2
    return 1
  fi
  # A rename includes both paths, just like validation through the PR API.
  git diff --name-only --no-renames "$base_sha" HEAD > "$log_dir/proposed-files.txt"
  validate_decision4 "$body" "$log_dir/proposed-files.txt" "$base_sha" > "$log_dir/proposed-decision4.log" 2>&1 || {
    cat "$log_dir/proposed-decision4.log" >&2
    return 1
  }
  [[ $(git rev-parse HEAD) == "$sha" && -z $(git status --porcelain --untracked-files=normal) ]] || {
    echo 'Worktree changed during proposed body validation.' >&2; return 1;
  }
  echo 'PASS proposed Decision4 body'
}
if [[ $mode == proposed-body ]]; then validate_proposed_body; exit $?; fi
if [[ $mode == check && -n ${CI_LOCAL_PR_BODY:-${CI_LOCAL_BODY_FILE:-}} ]]; then validate_proposed_body; fi
# Refuse before checks, receipt creation or a push; the pre-push hook repeats this.
if [[ $mode == full ]]; then
  remote_sha=$(git ls-remote origin "refs/heads/$branch" | cut -f1)
  if [[ -z $remote_sha ]]; then validate_proposed_body; fi
fi
started=$SECONDS
passed=0
failed=0
rm -f "$git_dir/ci-local/$sha.ok"
export CI_LOCAL_BASE_TREE="$log_dir/base"
rm -rf "$CI_LOCAL_BASE_TREE"
mkdir -p "$CI_LOCAL_BASE_TREE"
git archive "$base_sha" | tar -x -C "$CI_LOCAL_BASE_TREE"
if [[ -d node_modules ]]; then ln -s "$PWD/node_modules" "$CI_LOCAL_BASE_TREE/node_modules"; fi
# Only actual Markdown or plain-text documents qualify; unknown and mixed paths
# fail closed to the full gate (docs/code.py and changes/policy.json are code).
docs_only=false
path_count=0
code_count=0
while IFS= read -r -d '' path; do
  path_count=$((path_count + 1))
  case "$path" in *.md|*.mdx|*.txt) ;; *) code_count=$((code_count + 1)) ;; esac
done < <(git diff --name-only --no-renames -z "$base_sha" HEAD)
if (( path_count > 0 && code_count == 0 )); then docs_only=true; fi

# Baseline-aware Markdown checks avoid turning old unrelated debt into a blocker.
# Check only documents in the diff; never open environment or credential files.
ci_docs() {
  python3 - "$base_sha" "$1" <<'DOCS'
import pathlib, re, subprocess, sys, urllib.parse
base, mode = sys.argv[1:]
root = pathlib.Path.cwd()
paths = subprocess.check_output(['git', 'diff', '--name-only', '--no-renames', '-z', base, 'HEAD']).decode().split('\0')
errors = []
def issues(text, path, old=False):
    if mode == 'format':
        return set(['missing final newline'] if text and not text.endswith('\n') else []) | {
            'trailing whitespace: ' + line.rstrip() for line in text.splitlines()
            if line.rstrip(' \t') != line and not line.endswith('  ')}
    text = re.sub(r'(?ms)^```.*?^```[^\n]*|^~~~.*?^~~~[^\n]*', '', text)
    text = re.sub(r'`[^`\n]*`', '', text)
    links = re.findall(r'!?\[[^\]\n]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)', text)
    links += re.findall(r'(?m)^\s*\[[^\]]+\]:\s*(\S+)', text)
    broken = set()
    for link in links:
        link = link.strip('<>')
        url = urllib.parse.urlsplit(link)
        if url.scheme or url.netloc or not url.path: continue
        target = urllib.parse.unquote(url.path)
        candidate = (root / target.lstrip('/') if target.startswith('/') else root / path.parent / target).resolve()
        # Local links are verified without making network requests or reading targets.
        exists = candidate.exists()
        if old:
            try: relative = candidate.relative_to(root).as_posix()
            except ValueError: relative = ''
            exists = bool(relative) and subprocess.run(['git', 'cat-file', '-e', f'{base}:{relative}'], capture_output=True).returncode == 0
        if not exists: broken.add('broken local link: ' + link)
    return broken
for value in paths:
    if not value.endswith(('.md', '.mdx', '.txt')): continue
    path = pathlib.Path(value)
    if not path.is_file(): continue
    text = path.read_text()
    previous = subprocess.run(['git', 'show', f'{base}:{value}'], capture_output=True, text=True)
    old = issues(previous.stdout, path, True) if previous.returncode == 0 else set()
    errors.extend(f'{value}: {error}' for error in sorted(issues(text, path) - old))
if errors:
    print('\n'.join(errors), file=sys.stderr)
    sys.exit(1)
print(f'PASS docs {mode}')
DOCS
}
if [[ $docs_only == true ]]; then
  CHECK_NAMES=(docs-format docs-links)
  CHECK_COMMANDS=('ci_docs format' 'ci_docs links')
  CHECK_TOOLS=('' '')
else
  CHECK_NAMES+=(docs-format docs-links)
  CHECK_COMMANDS+=('ci_docs format' 'ci_docs links')
  CHECK_TOOLS+=('' '')
fi
export -f ci_docs
export base_sha

# Container checks share the selected engine with build, scanner and smoke subprocesses.
ci_container_setup() {
  if [[ -z ${DOCKER:-} ]]; then
    if command -v docker >/dev/null 2>&1; then DOCKER=docker
    elif command -v podman >/dev/null 2>&1; then DOCKER=podman
    else echo 'WARNING: container build, scan and smoke checks SKIPPED: install Docker or Podman, or set DOCKER.' >&2; return 2
    fi
  fi
  command -v "$DOCKER" >/dev/null 2>&1 || { echo "Container engine DOCKER=$DOCKER is not installed" >&2; return 1; }
  export DOCKER
  export CI_LOCAL_CONTAINER_DIR="${CI_LOCAL_CONTAINER_DIR:-$(git rev-parse --absolute-git-dir)/ci-local/containers}"
  mkdir -p "$CI_LOCAL_CONTAINER_DIR"
  if [[ ${DOCKER##*/} == podman ]]; then
    if [[ $(uname -s) == Darwin ]] && ! "$DOCKER" info >/dev/null 2>&1; then
      "$DOCKER" machine start || return 1
    fi
    # Public base/scanner images must not invoke a contributor's registry credential helpers.
    export REGISTRY_AUTH_FILE="$CI_LOCAL_CONTAINER_DIR/auth.json"
    printf '{"auths":{}}\n' > "$REGISTRY_AUTH_FILE"
  fi
  "$DOCKER" info >/dev/null || return 1
  echo "Container engine: $DOCKER"
}

# Prefer the local scanner; its container fallback sees the same paths as the host.
trivy() {
  if type -P trivy >/dev/null 2>&1; then command trivy "$@"; return; fi
  ci_container_setup || return 1
  "$DOCKER" run --rm -v "$PWD:$PWD:ro" -w "$PWD" \
    -v "$CI_LOCAL_CONTAINER_DIR:$CI_LOCAL_CONTAINER_DIR" \
    ghcr.io/aquasecurity/trivy:0.72.0 "$@"
}

# A saved archive works with Podman's VM and does not require a Docker socket.
ci_trivy_image() (
  set -euo pipefail
  image=$1
  shift
  archive=$(mktemp "$CI_LOCAL_CONTAINER_DIR/image-XXXXXX")
  trap 'rm -f "$archive"' EXIT
  if [[ ${DOCKER##*/} == podman ]]; then
    "$DOCKER" save --format docker-archive -o "$archive" "$image"
  else
    "$DOCKER" save -o "$archive" "$image"
  fi
  trivy image --input "$archive" "$@"
  echo "PASS image scan $image"
)
export -f ci_container_setup trivy ci_trivy_image

python3 - "$log_dir/checks.json" "$sha" "$base_sha" "$docs_only" <<'PY'
import json, pathlib, subprocess, sys
paths = subprocess.check_output(["git", "diff", "--name-only", "--no-renames", "-z", sys.argv[3], "HEAD"]).decode().split("\0")
pathlib.Path(sys.argv[1]).write_text(json.dumps({"head": sys.argv[2], "base": sys.argv[3], "checks": {},
    "selection": "docs-only" if sys.argv[4] == "true" else "full", "changed_paths": [p for p in paths if p]}))
PY
record_check() {
  python3 - "$log_dir" "$1" "$2" <<'PY'
import hashlib, json, pathlib, sys
folder, name, status = sys.argv[1:]
folder = pathlib.Path(folder)
path = folder / 'checks.json'
data = json.loads(path.read_text())
log = folder / (name + '.log')
data['checks'][name] = {'exit_code': int(status), 'kind': 'actual-check', 'log': log.name,
                        'sha256': hashlib.sha256(log.read_bytes()).hexdigest()}
path.write_text(json.dumps(data, indent=2) + '\n')
PY
}
for (( i=0; i<${#CHECK_NAMES[@]}; i++ )); do
  name=${CHECK_NAMES[$i]}
  tool=${CHECK_TOOLS[$i]:-}
  if [[ -n $tool && $tool != docker ]] && ! command -v "$tool" >/dev/null 2>&1; then
    echo "WARN $name skipped: $tool is not installed" | tee "$log_dir/$name.log"
    continue
  fi
  if [[ $tool == docker ]]; then
    engine_result=0
    ci_container_setup > "$log_dir/$name.log" 2>&1 || engine_result=$?
    if (( engine_result == 2 )); then cat "$log_dir/$name.log"; continue; fi
    if (( engine_result != 0 )); then
      failed=$((failed + 1))
      echo "FAIL $name engine setup (see $log_dir/$name.log)" >&2
      continue
    fi
  fi
  check_started=$SECONDS
  if env -u CI_LOCAL_PR bash -euo pipefail -c "${CHECK_COMMANDS[$i]}" > "$log_dir/$name.log" 2>&1; then
    record_check "$name" 0
    passed=$((passed + 1))
    echo "PASS $name ($((SECONDS - check_started))s)"
  else
    record_check "$name" 1
    failed=$((failed + 1))
    echo "FAIL $name ($((SECONDS - check_started))s; $log_dir/$name.log)" >&2
  fi
done
if (( failed == 0 )) && [[ -n ${AI_REVIEW_COMMAND:-}${FITNESS_COMMAND:-} ]]; then
  evidence_body=${CI_LOCAL_PR_BODY:-${CI_LOCAL_BODY_FILE:-}}
  if [[ -z $evidence_body ]]; then
    # Existing PR bodies become the proposed local body before pushing a new head.
    if [[ -z $repo ]]; then repo=$(gh repo view --json nameWithOwner --jq .nameWithOwner); fi
    if [[ -z $branch ]]; then branch=$(git branch --show-current); fi
    number=${CI_LOCAL_PR:-$(gh pr list --repo "$repo" --head "$branch" --state open --json number --jq '.[0].number // empty')}
    if [[ -z $number ]]; then
      echo 'Complete PR evidence requires CI_LOCAL_PR_BODY before opening the PR.' >&2; failed=$((failed + 1))
    else
      evidence_body="$log_dir/proposed-body.md"
      gh pr view "$number" --repo "$repo" --json body --jq '.body // ""' > "$evidence_body"
    fi
  fi
  if (( failed == 0 )); then
    if review_body "$base_sha" "$evidence_body"; then
      git diff --name-only --no-renames "$base_sha" HEAD > "$log_dir/proposed-files.txt"
      evidence_result=0
      validate_decision4 "$evidence_body" "$log_dir/proposed-files.txt" "$base_sha" > "$log_dir/proposed-decision4.log" 2>&1 || evidence_result=$?
      record_decision4 "$base_sha" "$evidence_body" "$evidence_result"
      if (( evidence_result != 0 )) || ! complete_fitness "$evidence_body"; then failed=$((failed + 1)); fi
    else
      failed=$((failed + 1))
    fi
  fi
fi
# Never attest a different commit or files changed by a check.
if [[ $(git rev-parse HEAD) != "$sha" || -n "$(git status --porcelain --untracked-files=normal)" ]]; then
  echo 'FAIL worktree changed during checks' >&2
  failed=$((failed + 1))
fi
elapsed=$((SECONDS - started))
description="$passed checks passed in ${elapsed}s"
printf '%s; %s failed. Logs: %s\n' "$description" "$failed" "$log_dir"
if (( failed > 0 )); then
  if [[ $mode != check ]]; then post_status local-ci failure "$description"; fi
  exit 1
fi
printf '%s\n' "$description" > "$git_dir/ci-local/$sha.ok"
if [[ $mode == check ]]; then exit 0; fi
# The receipt above lets the pre-push hook pass without recursively running this suite.
if [[ $mode == full ]]; then
  remote_sha=$(git ls-remote origin "refs/heads/$branch" | cut -f1)
  if [[ $remote_sha != "$sha" ]]; then git push --set-upstream origin "$branch"; fi
fi
if [[ -n ${POST_PUSH_COMMAND:-} ]]; then
  export CI_LOCAL_REPO="$repo" CI_LOCAL_SHA="$sha" CI_LOCAL_BRANCH="$branch" CI_LOCAL_BASE_SHA="$base_sha"
  if ! bash -euo pipefail -c "$POST_PUSH_COMMAND" > "$log_dir/post-push.log" 2>&1; then
    post_status local-ci failure 'Required remote-only evidence is missing'
    echo "FAIL remote-only evidence (see $log_dir/post-push.log)" >&2
    run_decision4
    exit 1
  fi
fi
post_status local-ci success "$description"
run_decision4
