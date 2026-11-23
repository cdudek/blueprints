#!/usr/bin/env python3
"""CI-43 drift guard: the workflow's `--check` steps must match the runner's config.

Usage: python3 scripts/ci-workflow-drift.py [--root DIR] [--workflow PATH]
Reads the REPO CONFIG of scripts/ci-local and .github/workflows/ci.yml (needs PyYAML). Fails unless
  - every check in CHECK_NAMES (plus docs-format and docs-links, which the runner adds) except
    LOCAL_ONLY_CHECKS has exactly one `scripts/ci-local ... --check <id>` step,
  - that step sits in the job named after the check's CHECK_STAGES entry (e2e-smoke runs in `build`),
  - no step runs another check, or runs ci-local without --check, and `ci` needs every job with check steps.
Wire it into the repo's workflow-lint check, next to actionlint and zizmor.
"""
import argparse
import re
import subprocess
import sys
from pathlib import Path

import yaml

# The e2e-smoke stage runs after the build in the same job; every other stage is a job of its own name.
JOB_OF_STAGE = {"e2e-smoke": "build"}
RUNNER_CHECKS = ("docs-format", "docs-links")
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


def workflow_steps(workflow):
    """Yield (job, step index, check ids in the step; None when the step runs ci-local without --check)."""
    for job, body in (yaml.safe_load(workflow.read_text()).get("jobs") or {}).items():
        for index, step in enumerate((body or {}).get("steps") or []):
            run = step.get("run") or ""
            if "ci-local" in run:
                yield job, index, re.findall(r"--check[ =]+(\S+)", run) or None


def problems(root, workflow):
    stages, local_only = read_config(root / "scripts/ci-local")
    expected = {n: JOB_OF_STAGE.get(s, s) for n, s in stages.items() if n not in local_only}
    found, errors, jobs = {}, [], set()
    for job, index, ids in workflow_steps(workflow):
        if ids is None:
            errors.append(f"{job} step {index + 1} runs ci-local without --check")
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
    gate = (yaml.safe_load(workflow.read_text())["jobs"].get("ci") or {}).get("needs") or []
    gate = [gate] if isinstance(gate, str) else gate
    errors += [f"job ci does not need {job}" for job in sorted(jobs - set(gate))]
    return errors


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
