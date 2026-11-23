#!/usr/bin/env python3
"""CI-43 drift guard: the workflow's `--check` steps must match the runner's config.

Usage: python3 scripts/ci-workflow-drift.py [--root DIR] [--workflow PATH]
Reads the REPO CONFIG of scripts/ci-local and .github/workflows/ci.yml (needs PyYAML). Fails unless
  - every check in CHECK_NAMES (plus docs-format and docs-links, which the runner adds) except
    LOCAL_ONLY_CHECKS has exactly one `scripts/ci-local ... --check <id>` step,
  - that step sits in the job named after the check's CHECK_STAGES entry (e2e-smoke runs in `build`),
  - no step runs another check, or runs ci-local without --check, and `ci` needs every job with check steps,
  - every job with check steps has `if: github.event.pull_request.draft == false`, and the `ci` job (`if: always()`) needs
    exactly those jobs and has one step: env exactly NEEDS and DRAFT, run exactly the canonical gate text (GATE_RUN), whose
    jq asserts `keys == want` (the sorted JSON list of those jobs, literal) and every result `success`, so a dropped job fails closed,
  - no check step runs under another shell, directory or environment: no `shell` (or only `bash`), no `working-directory`, no env
    that sets PATH, BASH_ENV, ENV, SHELLOPTS, NODE_OPTIONS, PYTHONPATH, PYTHONSTARTUP, PYTHONHOME, PERL5OPT, RUBYOPT,
    GIT_CONFIG_GLOBAL, GIT_CONFIG_SYSTEM or a BASH_FUNC_, LD_ or DYLD_ name (any case), on the step, its job or the workflow (`defaults.run` too),
  - no check step is neutralised: its run is exactly `bash scripts/ci-local --ci --check <id>` (repeatable), its `if` is
    absent or exactly `${{ !cancelled() }}`, and neither it nor its job sets a truthy `continue-on-error`.
Wire it into the repo's workflow-lint check, next to actionlint and zizmor.
"""
import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

import yaml

# The e2e-smoke stage runs after the build in the same job; every other stage is a job of its own name.
JOB_OF_STAGE = {"e2e-smoke": "build"}
RUNNER_CHECKS = ("docs-format", "docs-links")
STEP_RUN = re.compile(r"bash scripts/ci-local --ci(?: --check [\w.-]+)+")
STEP_IF = "${{ !cancelled() }}"
JOB_IF = "github.event.pull_request.draft == false"
UNSAFE_ENV = {"PATH", "BASH_ENV", "ENV", "SHELLOPTS", "NODE_OPTIONS", "PYTHONPATH", "PYTHONSTARTUP", "PYTHONHOME", "PERL5OPT",
              "RUBYOPT", "GIT_CONFIG_GLOBAL", "GIT_CONFIG_SYSTEM"}
UNSAFE_ENV_PREFIXES = ("BASH_FUNC_", "LD_", "DYLD_")
GATE_ENV = {"NEEDS": "${{ toJSON(needs) }}", "DRAFT": "${{ github.event.pull_request.draft }}"}
# The one canonical text of the `ci` gate run; {want} is the sorted compact JSON list of the check jobs.
GATE_RUN = (
    'if [ "$DRAFT" = true ]; then echo "draft: CI runs once the PR is ready"; exit 1; fi',
    """echo "$NEEDS" | jq -r 'to_entries[] | "\\(.key): \\(.value.result)"'""",
    """echo "$NEEDS" | jq -e --argjson want '{want}' '([keys[]] | sort) == $want and all(.[]; .result == "success")' >/dev/null""",
)
DUMP = 'echo "${CHECK_NAMES[*]:-}"; echo "${CHECK_STAGES[*]:-}"; echo "${LOCAL_ONLY_CHECKS[*]:-}"'


def read_config(script):
    source = script.read_text()
    if "# END REPO CONFIG\n" not in source:
        raise ValueError("ci-local has no REPO CONFIG block")
    config = source.split("# END REPO CONFIG\n", 1)[0]
    result = subprocess.run(["bash", "-euo", "pipefail", "-c", config + DUMP], capture_output=True, text=True)
    if result.returncode:
        raise ValueError(f"cannot read the ci-local config: {result.stderr.strip()}")
    names, stages, local_only = (line.split() for line in result.stdout.splitlines())
    stages = stages or ["static"] * len(names)  # the runner's default: no CHECK_STAGES means all static
    if len(stages) != len(names):
        raise ValueError(f"CHECK_STAGES has {len(stages)} entries for {len(names)} checks")
    names += [n for n in RUNNER_CHECKS if n not in names]
    stages += ["static"] * (len(names) - len(stages))
    return dict(zip(names, stages)), set(local_only)


def lenient(value):
    """True when a continue-on-error value is anything but a literal false (an expression cannot be proven false)."""
    return not (value is False or (isinstance(value, str) and value.strip().lower() == "false"))


def environment_problems(where, scope):
    """Findings for a step, job or workflow mapping that could change how a check step runs."""
    found = []
    shells = [scope.get("shell"), ((scope.get("defaults") or {}).get("run") or {}).get("shell")]
    if any(shell is not None and str(shell).strip() != "bash" for shell in shells):
        found.append(f"{where} sets a shell other than bash")
    directories = [scope.get("working-directory"), ((scope.get("defaults") or {}).get("run") or {}).get("working-directory")]
    if any(directory is not None for directory in directories):
        found.append(f"{where} sets a working-directory")
    env = scope.get("env")
    for name in sorted(k for k in (env if isinstance(env, dict) else {}) if str(k).upper() in UNSAFE_ENV or str(k).upper().startswith(UNSAFE_ENV_PREFIXES)):
        found.append(f"{where} sets env {name}")
    if env is not None and not isinstance(env, dict):
        found.append(f"{where} sets env as an expression")
    return found


def workflow_steps(jobs):
    """Yield (job, job body, step index, step, check ids in the step; None when it runs ci-local without --check)."""
    for job, body in jobs.items():
        for index, step in enumerate((body or {}).get("steps") or []):
            run = str(step.get("run") or "")
            if "ci-local" in run:
                yield job, body, index, step, re.findall(r"--check[ =]+(\S+)", run) or None


def gate_problems(ci, check_jobs, loaded):
    """Findings for the `ci` job: it must assert the literal, sorted set of check jobs, so a dropped job fails closed."""
    found, steps = [], ci.get("steps") or []
    if str(ci.get("if", "")).strip() != "always()":
        found.append("job ci must keep `if: always()`")
    if "continue-on-error" in ci and lenient(ci["continue-on-error"]):
        found.append("job ci sets continue-on-error")
    found += environment_problems("job ci", ci)
    if len(steps) != 1 or not isinstance(steps[0], dict):
        return found + ["job ci must have exactly one step, the gate"]
    step = steps[0]
    found += [f"the ci gate step sets {key}; only env and run are allowed" for key in sorted(set(step) - {"name", "env", "run"})]
    found += environment_problems("the ci gate step", step)
    if step.get("env") != GATE_ENV:
        found.append(f"the ci gate step env must be exactly {GATE_ENV}")
    want = json.dumps(check_jobs, separators=(",", ":"))
    expected = [line.replace("{want}", want) for line in GATE_RUN]
    actual = [" ".join(line.split()) for line in str(step.get("run") or "").strip().splitlines()]
    if actual != expected:
        found.append("the ci gate run must be exactly the canonical text, with want = " + want + ":\n" + "\n".join(expected))
    return found


def problems(root, workflow):
    stages, local_only = read_config(root / "scripts/ci-local")
    expected = {n: JOB_OF_STAGE.get(s, s) for n, s in stages.items() if n not in local_only}
    found, errors, jobs, holding, loaded = {}, [], set(), set(), yaml.safe_load(workflow.read_text())
    for job, body, index, step, ids in workflow_steps(loaded.get("jobs") or {}):
        where = f"{job} step {index + 1}"
        holding.add(job)
        if ids is None:
            errors.append(f"{where} runs ci-local without --check")
        if not STEP_RUN.fullmatch(str(step["run"]).strip()):
            errors.append(f"{where} must run exactly `bash scripts/ci-local --ci --check <id>` and nothing else (no ||, ;, &, set +e)")
        for scope, label in ((step, where), (body, f"job {job}"), (loaded, "the workflow")):
            errors += environment_problems(f"{label} (check steps)" if scope is not step else label, scope)
        if "if" in step and (not isinstance(step["if"], str) or step["if"].strip() != STEP_IF):
            errors.append(f"{where} has an if other than `{STEP_IF}`")
        if "continue-on-error" in step and lenient(step["continue-on-error"]):
            errors.append(f"{where} sets continue-on-error")
        if "continue-on-error" in body and lenient(body["continue-on-error"]):
            errors.append(f"job {job} holds check steps and sets continue-on-error")
        if not isinstance(body.get("if"), str) or body["if"].strip() != JOB_IF:
            errors.append(f"job {job} holds check steps and needs `if: {JOB_IF}`")
        for check in ids or []:
            jobs.add(job)
            if check in found:
                errors.append(f"check {check} has more than one step ({found[check]} and {job})")
            found.setdefault(check, job)
    for check, job in expected.items():
        if check not in found:
            errors.append(f"check {check} has no step; add one to job {job}")
        elif found[check] != job:
            errors.append(f"check {check} runs in job {found[check]}, but its stage puts it in {job}")
    for check in sorted(set(found) - set(expected)):
        errors.append(f"step for {check} matches no CI check (unknown name or LOCAL_ONLY_CHECKS)")
    ci = loaded["jobs"].get("ci") or {}
    gate = ci.get("needs") or []
    gate = {gate} if isinstance(gate, str) else set(gate)
    errors += [f"job ci does not need {job}" for job in sorted(holding - gate)]
    errors += [f"job ci needs {job}, which holds no check steps" for job in sorted(gate - holding)]
    errors += gate_problems(ci, sorted(holding), loaded)
    return list(dict.fromkeys(errors))  # a job-level finding repeats per step


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--root", type=Path, default=Path.cwd())
    parser.add_argument("--workflow", type=Path)
    args = parser.parse_args()
    workflow = args.workflow or args.root / ".github/workflows/ci.yml"
    try:
        errors = problems(args.root, workflow)
    except (OSError, ValueError, yaml.YAMLError) as error:
        errors = [str(error)]
    for error in errors:
        print(f"FAIL ci-workflow-drift: {error}", file=sys.stderr)
    if not errors:
        print("PASS ci-workflow-drift")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
