#!/usr/bin/env bash
set -euo pipefail

# BEGIN REPO CONFIG — copy this file; adapt only this block to the repo's former PR CI.
CHECK_NAMES=(format lint typecheck test)
CHECK_COMMANDS=('make format-check' 'make lint' 'make typecheck' 'make test')
CHECK_TOOLS=('' '' '' '')
# Names from CHECK_NAMES that run on your machine but not in GitHub Actions (e2e, docker, macOS builds).
LOCAL_ONLY_CHECKS=()
# Optional. Checks that need a machine-wide lock (e2e, docker, anything memory-hungry); skipped in Actions and by --cheap.
# A check that needs the output of a heavy check (it runs against its build, reads its report) belongs in HEAVY_CHECKS too:
# --cheap cannot tell the dependency, so an unlisted dependent fails there.
HEAVY_CHECKS=()
# Optional. Checks that must keep their config position because they depend on an earlier check.
CHECK_SERIAL=()
# Optional. One stage per check, parallel to CHECK_NAMES: static | unit | build | extras | e2e-smoke.
# Without it every check is in `static`, so a repo can adopt stages whenever it likes.
CHECK_STAGES=()
# Optional. Repo-relative test output dirs deleted before every run (test-results, coverage).
CI_LOCAL_CLEAN_PATHS=()
# END REPO CONFIG

usage() { echo 'Usage: scripts/ci-local [--ci | --cheap] [--keep-going] [--stage <name>] | --help  (no flag: every check, locally, stopping at the first failure; --ci: all but LOCAL_ONLY_CHECKS, for Actions; --cheap: all but HEAVY_CHECKS, no lock, no receipt, ends with CHEAP PASS <sha> or CHEAP FAIL check=<name>; --keep-going: run every check after a failure; --stage: only that stage (static, unit, build, extras, e2e-smoke), logs apart from the receipt folder)'; }
ci=false
cheap=false
keep_going=false
stage=
while (( $# > 0 )); do
  case $1 in
    --ci) ci=true ;;
    --cheap) cheap=true ;;
    --keep-going) keep_going=true ;;
    --stage)
      if (( $# < 2 )); then usage >&2; exit 2; fi
      stage=$2
      shift
      ;;
    --help|-h) usage; exit 0 ;;
    *) usage >&2; exit 2 ;;
  esac
  shift
done
STAGES=(static unit build extras e2e-smoke)
if [[ -n $stage && " ${STAGES[*]} " != *" $stage "* ]]; then echo "Unknown stage '$stage'; use one of: ${STAGES[*]}." >&2; exit 2; fi
if [[ $ci == true && $cheap == true ]]; then echo '--cheap and --ci cannot be combined.' >&2; usage >&2; exit 2; fi

cd "$(git rev-parse --show-toplevel)"
# Clean start: a relative path inherited from the caller breaks once checks run elsewhere.
unset PYTHONPATH PYTHONSTARTUP PYTHONPYCACHEPREFIX NODE_PATH COVERAGE_FILE COVERAGE_RCFILE PYTEST_ADDOPTS
# Leftovers of an earlier run: its container temp files and the repo's declared test output.
rm -rf "$(git rev-parse --absolute-git-dir)/ci-local/containers"
for clean_path in "${CI_LOCAL_CLEAN_PATHS[@]+"${CI_LOCAL_CLEAN_PATHS[@]}"}"; do
  case $clean_path in
    ''|/*|..|../*|*/..|*/../*) echo "CI_LOCAL_CLEAN_PATHS needs repo-relative paths; got '$clean_path'." >&2; exit 2 ;;
  esac
  rm -rf -- "$clean_path"
done
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
# Actions starts from a clean checkout and its own setup steps; only a local run needs the refusal.
if [[ $ci == false && -n "$(git status --porcelain --untracked-files=normal)" ]]; then
  echo 'Refusing a dirty worktree; commit or remove changes first.' >&2
  exit 1
fi
sha=$(git rev-parse HEAD)
git_dir=$(git rev-parse --absolute-git-dir)
log_dir="$git_dir/ci-local/$sha"
# A cheap pass is not evidence for the head: its logs stay apart from the receipt folder.
if [[ $cheap == true ]]; then log_dir="$git_dir/ci-local/cheap/$sha"; fi
# Likewise a single stage: it must not overwrite the receipt of a full run.
if [[ -n $stage ]]; then log_dir="$git_dir/ci-local/stage-$stage/$sha"; fi
mkdir -p "$log_dir"
export CI_LOCAL_EVIDENCE="$log_dir"

# A fresh base snapshot makes ratchets independent of changes in another checkout.
base_ref=${CI_LOCAL_BASE_REF:-$(git symbolic-ref --quiet refs/remotes/origin/HEAD)} || {
  echo 'Set the default branch with git remote set-head origin --auto, or set CI_LOCAL_BASE_REF.' >&2
  exit 1
}
base_sha=$(git merge-base HEAD "$base_ref")
started=$SECONDS
passed=0
failed=0
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
# Whole-harness audits need every checker even for a documentation-only comparison.
case ${CI_LOCAL_FULL_SUITE:-0} in
  0) ;;
  1) docs_only=false ;;
  *) echo 'CI_LOCAL_FULL_SUITE must be 0 or 1.' >&2; exit 2 ;;
esac
# The override belongs to this invocation, never nested runner/test fixtures.
unset CI_LOCAL_FULL_SUITE

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
# Stages: a config without CHECK_STAGES is all static, so the stage workflow still covers it.
CHECK_STAGES=("${CHECK_STAGES[@]+"${CHECK_STAGES[@]}"}")
if (( ${#CHECK_STAGES[@]} == 0 )); then
  for _ in "${CHECK_NAMES[@]}"; do CHECK_STAGES+=(static); done
elif (( ${#CHECK_STAGES[@]} != ${#CHECK_NAMES[@]} )); then
  echo "CHECK_STAGES needs one stage per check: ${#CHECK_STAGES[@]} stages, ${#CHECK_NAMES[@]} checks." >&2
  exit 2
fi
for check_stage in "${CHECK_STAGES[@]}"; do
  if [[ " ${STAGES[*]} " != *" $check_stage "* ]]; then echo "Unknown stage '$check_stage' in CHECK_STAGES; use one of: ${STAGES[*]}." >&2; exit 2; fi
done
if [[ $docs_only == true ]]; then
  CHECK_NAMES=(docs-format docs-links)
  CHECK_STAGES=(static static)
  CHECK_COMMANDS=('ci_docs format' 'ci_docs links')
  CHECK_TOOLS=('' '')
else
  CHECK_NAMES+=(docs-format docs-links)
  CHECK_STAGES+=(static static)
  CHECK_COMMANDS+=('ci_docs format' 'ci_docs links')
  CHECK_TOOLS+=('' '')
fi
export -f ci_docs
export base_sha
if [[ -n $stage && " ${CHECK_STAGES[*]} " != *" $stage "* ]]; then echo "no checks in stage $stage"; exit 0; fi


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

if [[ $cheap == false ]]; then python3 - "$log_dir/checks.json" "$sha" "$base_sha" "$docs_only" <<'PY'
import json, pathlib, subprocess, sys
paths = subprocess.check_output(["git", "diff", "--name-only", "--no-renames", "-z", sys.argv[3], "HEAD"]).decode().split("\0")
pathlib.Path(sys.argv[1]).write_text(json.dumps({"head": sys.argv[2], "base": sys.argv[3], "checks": {},
    "selection": "docs-only" if sys.argv[4] == "true" else "full", "changed_paths": [p for p in paths if p]}))
PY
fi
record_check() {
  [[ $cheap == false ]] || return 0
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
# Cheapest first, from the last run's seconds (none in Actions: config order); CHECK_SERIAL names keep their slot.
durations="$(git rev-parse --path-format=absolute --git-common-dir)/ci-local/durations.json"
read -r -a order <<< "$(python3 - "$durations" "${CHECK_SERIAL[*]:-}" "${CHECK_NAMES[@]}" <<'PY'
import json, pathlib, sys
path, serial, *names = sys.argv[1:]
try: seen = json.loads(pathlib.Path(path).read_text())
except (OSError, ValueError): seen = {}
serial = serial.split()
movable = iter(sorted((i for i, n in enumerate(names) if n not in serial), key=lambda i: (names[i] not in seen, seen.get(names[i], 0))))
print(*(i if names[i] in serial else next(movable) for i in range(len(names))))
PY
)"
# Heavy checks share one lock per machine; a dead holder's lock is taken over (shortcut: pid reuse is not detected).
lock=${CI_LOCAL_LOCK:-${TMPDIR:-/tmp}/ci-local-heavy.lock}
holding=false
heavy_unlock() { if [[ $holding == true ]]; then rm -rf "$lock"; holding=false; fi; }
heavy_lock() {
  local pid waited=false
  until mkdir "$lock" 2>/dev/null; do
    pid=$(cat "$lock/pid" 2>/dev/null || true)
    if [[ -n $pid ]] && ! ps -p "$pid" >/dev/null 2>&1; then
      if mv "$lock" "$lock.stale.$$" 2>/dev/null; then rm -rf "$lock.stale.$$"; fi
      continue
    fi
    if [[ $waited == false ]]; then echo "waiting for heavy lock held by pid ${pid:-unknown}"; fi
    waited=true
    sleep "${CI_LOCAL_LOCK_POLL:-2}"
  done
  echo $$ > "$lock/pid"
  holding=true
}
trap heavy_unlock EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
# The log stays on the runner, so a failing job prints what it needs to show the error.
log_tail() {
  if [[ ${GITHUB_ACTIONS:-} == true ]]; then echo "::group::$1 log (last 80 lines)"; else echo "--- $1 log (last 80 lines) ---"; fi
  tail -n 80 "$log_dir/$1.log"
  if [[ ${GITHUB_ACTIONS:-} == true ]]; then echo '::endgroup::'; fi
}
timings=()
first_failed=
for i in "${order[@]}"; do
  if [[ -n $stage && ${CHECK_STAGES[$i]} != "$stage" ]]; then continue; fi
  if (( failed > 0 )) && [[ $keep_going == false ]]; then
    echo 'STOP at the first failure; later checks did not run (--keep-going runs them all).' >&2
    break
  fi
  name=${CHECK_NAMES[$i]}
  tool=${CHECK_TOOLS[$i]:-}
  if [[ $cheap == true && " ${HEAVY_CHECKS[*]:-} " == *" $name "* ]]; then
    echo "SKIP $name (heavy)" | tee "$log_dir/$name.log"
    continue
  fi
  if [[ $ci == true && " ${LOCAL_ONLY_CHECKS[*]:-} " == *" $name "* ]]; then
    echo "SKIP $name (local only)" | tee "$log_dir/$name.log"
    continue
  fi
  if [[ -n $tool && $tool != docker ]] && ! command -v "$tool" >/dev/null 2>&1; then
    # A required check must not go green because Actions lacks its tool.
    if [[ $ci == true ]]; then failed=$((failed + 1)); echo "FAIL $name: $tool is not installed" >&2; continue; fi
    echo "WARN $name skipped: $tool is not installed" | tee "$log_dir/$name.log"
    continue
  fi
  if [[ $tool == docker ]]; then
    engine_result=0
    ci_container_setup > "$log_dir/$name.log" 2>&1 || engine_result=$?
    if (( engine_result == 2 )); then cat "$log_dir/$name.log"; continue; fi
    if (( engine_result != 0 )); then
      failed=$((failed + 1))
      first_failed=${first_failed:-$name}
      echo "FAIL $name engine setup (see $log_dir/$name.log)" >&2
      log_tail "$name"
      continue
    fi
  fi
  if [[ ${GITHUB_ACTIONS:-} != true && " ${HEAVY_CHECKS[*]:-} " == *" $name "* ]]; then heavy_lock; fi
  check_started=$SECONDS
  if bash -euo pipefail -c "${CHECK_COMMANDS[$i]}" > "$log_dir/$name.log" 2>&1; then
    record_check "$name" 0
    passed=$((passed + 1))
    echo "PASS $name ($((SECONDS - check_started))s)"
  else
    record_check "$name" 1
    failed=$((failed + 1))
    first_failed=${first_failed:-$name}
    echo "FAIL $name ($((SECONDS - check_started))s; $log_dir/$name.log)" >&2
    log_tail "$name"
  fi
  timings+=("$name=$((SECONDS - check_started))")
  heavy_unlock
done
python3 - "$durations" "${timings[@]+"${timings[@]}"}" <<'PY'
import json, pathlib, sys
path = pathlib.Path(sys.argv[1])
try: data = json.loads(path.read_text())
except (OSError, ValueError): data = {}
data.update({n: int(s) for n, _, s in (kv.partition('=') for kv in sys.argv[2:])})
path.parent.mkdir(parents=True, exist_ok=True)
path.write_text(json.dumps(data, indent=2) + '\n')
PY
# Never attest files changed by a check (a clean Actions checkout does not need this).
if [[ $ci == false && -n "$(git status --porcelain --untracked-files=normal)" ]]; then
  echo 'FAIL worktree changed during checks' >&2
  failed=$((failed + 1))
  first_failed=${first_failed:-worktree}
fi
printf '%s checks passed in %ss; %s failed. Logs: %s\n' "$passed" "$((SECONDS - started))" "$failed" "$log_dir"
echo "Seconds per check: ${timings[*]:-none}"
if [[ $cheap == true ]]; then
  if (( failed > 0 )); then echo "CHEAP FAIL check=$first_failed"; else echo "CHEAP PASS $sha"; fi
fi
exit $(( failed > 0 ))
