#!/usr/bin/env python3
"""ARCH-13: aggregate real local dimension execution and exact-head Decision4.

Usage: python3 scripts/fitness-report.py --evidence DIR --body FILE
Reads architecture.yaml and gate-owned checks.json/decision4-result.json, never fixtures.
The report retains each gate's measured output and digest, threshold and base identity.
"""

import argparse
import hashlib
import json
from pathlib import Path

import yaml


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def na_row(name, reason):
    return {
        "id": name,
        "value": None,
        "threshold": None,
        "baseline": None,
        "pass": None,
        "not_applicable": reason,
    }


def skipped_row(dimension, checks):
    paths = checks.get("changed_paths", [])
    if not paths or any(not path.endswith((".md", ".mdx", ".txt")) for path in paths):
        raise ValueError("docs-only selection lacks valid changed-path evidence")
    return {
        "id": dimension["id"],
        "value": None,
        "threshold": dimension["gate"],
        "baseline": {"base": checks["base"]},
        "pass": None,
        "skipped": "docs-only changed paths (CI-4); product check was not executed",
        "changed_paths": paths,
    }


def dimension_row(dimension, policy, checks, decision, folder):
    name = dimension["id"]
    if name == "decision4":
        return {
            "id": name,
            "value": decision,
            "threshold": dimension["gate"],
            "baseline": {"base": decision["base"]},
            "pass": True,
        }
    reason = dimension.get("enforcement", {}).get("not_applicable") or policy.get(
        "not_applicable", {}
    ).get(name)
    if reason:
        return na_row(name, reason)
    if checks.get("selection") == "docs-only":
        return skipped_row(dimension, checks)
    return actual_row(dimension, checks, folder)


def actual_row(dimension, checks, folder):
    name = dimension["id"]
    target = dimension["target"]
    result = checks["checks"].get(target)
    if (
        result is None
        or result.get("exit_code") != 0
        or result.get("kind") != "actual-check"
    ):
        raise ValueError(
            f"{name}: no successful actual {target} execution; fixtures are not PR evidence"
        )
    path = folder / result["log"]
    if not path.is_file() or digest(path) != result["sha256"]:
        raise ValueError(f"{name}: missing or changed actual-check output")
    return {
        "id": name,
        "value": {
            "exit_code": 0,
            "output": path.read_text(errors="replace"),
            "sha256": result["sha256"],
        },
        "threshold": dimension["gate"],
        "baseline": {"base": checks["base"]},
        "pass": True,
    }


def aggregate(policy, checks, decision, body, folder):
    head, base = checks["head"], checks["base"]
    if decision.get("head") != head or decision.get("body_sha256") != digest(body):
        raise ValueError("missing or stale exact-head/body Decision4 result")
    if decision.get("comparison_base") != base:
        raise ValueError(
            "stale comparison-base evidence; rerun the full gate with "
            "CI_LOCAL_BASE_REF set to the current PR target"
        )
    if decision.get("pass") is not True:
        raise ValueError("actual PR Decision4 did not pass")
    rows = [
        dimension_row(dimension, policy, checks, decision, folder)
        for dimension in policy["fitness"]
    ]
    present = {row["id"] for row in rows}
    rows.extend(
        na_row(name, reason)
        for name, reason in policy.get("not_applicable", {}).items()
        if name not in present
    )
    if "decision4" not in present:
        raise ValueError("architecture policy must include Decision4")
    return {
        "head": head,
        "base": base,
        "body_sha256": digest(body),
        "pass": True,
        "rows": rows,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--evidence", required=True, type=Path)
    parser.add_argument("--body", required=True, type=Path)
    parser.add_argument("--out", type=Path, default=Path("fitness-report.json"))
    args = parser.parse_args()
    folder = args.evidence
    report = aggregate(
        yaml.safe_load(Path("architecture.yaml").read_text()),
        json.loads((folder / "checks.json").read_text()),
        json.loads((folder / "decision4-result.json").read_text()),
        args.body,
        folder,
    )
    args.out.write_text(json.dumps(report, indent=2) + "\n")
    (folder / "fitness-report.json").write_text(json.dumps(report, indent=2) + "\n")
    print(
        f"PASS fitness: {len(report['rows'])} real dimension results for {report['head']}"
    )


if __name__ == "__main__":
    main()
