#!/usr/bin/env python3
"""Run monthly: locally check Dependabot heads, squash safe updates, report majors."""

import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile

# Repo-specific setup, run inside each disposable PR worktree.
INSTALL = ''


def run(*args, cwd=None, capture=False, env=None):
    result = subprocess.run(args, cwd=cwd, env=env, check=True, text=True,
                            stdout=subprocess.PIPE if capture else None)
    return result.stdout.strip() if capture else ""


def gh_json(*args):
    return json.loads(run("gh", *args, capture=True))


def update_kind(pr):
    """Fail closed when metadata cannot prove this is a minor/patch update."""
    labels = {label["name"].lower() for label in pr["labels"]}
    if labels & {"major", "semver-major", "dependencies:major"}:
        return "major"
    pairs = re.findall(r"\bfrom\s+[`v]*([0-9]+)(?:\.[0-9]+)*[^\s]*\s+to\s+[`v]*([0-9]+)(?:\.[0-9]+)*", pr["title"], re.I)
    # Group bodies list each package as "Updates `pkg` from A to B", or in a Markdown table.
    if not pairs:
        pairs = re.findall(r"^Updates `[^`]+` from v?(\d+)\S* to v?(\d+)", pr["body"], re.M)
    if not pairs:
        pairs = re.findall(r"\|\s*`?v?(\d+)\.[^|\n]+\|\s*`?v?(\d+)\.[^|\n]+\|", pr["body"])
    if any(old != new for old, new in pairs):
        return "major"
    if pairs:
        return "minor/patch"
    return "unknown"


def owner_reason(pr, paths, root):
    """Auto-merge only when both governance and changed paths prove eligibility."""
    import fnmatch
    import yaml

    if any(path.startswith('terraform/') or
           (path.startswith('.github/workflows/') and 'terraform' in path.lower()) for path in paths):
        return 'Terraform changes'
    labels = {label['name'].lower() for label in pr['labels']}
    if labels & {'ask', 'owner', 'needs-approval', 'approval-required'}:
        return 'approval-gated tier'
    config = root / 'sdlc.json'
    if config.exists() and json.loads(config.read_text()).get('tiers', False) is not False:
        return 'approval tiers enabled; owner must establish eligibility'
    mapping = root / 'boundary-map.yaml'
    if not mapping.exists(): return 'missing boundary map'
    entries = yaml.safe_load(mapping.read_text())['entries']
    for path in paths:
        matched = [entry for entry in entries if not entry['select'].get('paths') or any(
            fnmatch.fnmatchcase(path, pattern) for pattern in entry['select'].get('paths', []))]
        if not matched: return 'unmapped path'
        if any(entry['floor'] in ('Migrate', 'Answer') or set(entry['select']) - {'paths'} for entry in matched):
            return 'changed-path class above Repair or uncertain selector'
    declared = re.search(r'\*\*[^\n*]*(Undo|Repair|Migrate|Answer)\*\*', pr['body'])
    if not declared or declared[1] not in ('Undo', 'Repair'):
        return 'declared class above Repair or unknown'
    return ''


def add_contract(pr, paths, root):
    """Keep the bot's body; add the upstream class-specific handoff if absent."""
    if re.search(r"^## How hard is it to undo this PR after merging\?", pr["body"], re.M):
        return
    # Legacy bodies need an owner rewrite before unattended dependency landing.
    if re.search(r"^Decision-Class:", pr["body"], re.M):
        return  # The shared gate rejects an incomplete legacy record before merge.
    import fnmatch
    import yaml

    classes = ["Undo", "Repair", "Migrate", "Answer"]
    entries = yaml.safe_load((root / "boundary-map.yaml").read_text())["entries"]
    matches = [entry for entry in entries if not entry["select"].get("paths") or any(
        fnmatch.fnmatchcase(path, pattern)
        for path in paths for pattern in entry["select"].get("paths", []))]
    # Unmapped or uncertain ground is never silently Undo.
    floor = max([classes.index(entry["floor"]) for entry in matches] + [1])
    selected = classes[floor]
    icon = ["🟢", "🟡", "🟠", "🔴"][floor]
    body = pr["body"] + "\n\n## How hard is it to undo this PR after merging?\n\n"
    body += f"**{icon} {selected}** — The owner restores the dependency pins, checks affected installations and coordinates a fix release when required.\n\n"
    body += "**Recovery steps**\n\n1. Restore the previous dependency pins in a fix PR.\n2. Run the local gate and verify affected installed versions.\n\n"
    body += "- **Responsible for recovery:** @cdudek\n- **Classification change:** None\n"
    body += "\n## Decision record\n\n"
    if selected == "Repair":
        body += "- **Chose:** Check the proposed dependency versions locally.\n- **Over:** Retaining the current pins until a manual update.\n- **Because:** The update can be verified by the team before release.\n- **Commits us to:** Maintaining the changed dependency versions.\n"
    elif selected == "Migrate":
        body += "**Options**\n\n1. Land the checked update and coordinate affected consumers.\n2. Retain the current pins and have the owner schedule the coordinated update.\n"
    else:
        body += f"**Evidence**\n\n- **observed:** Dependabot proposed head {pr['headRefOid']}; changed paths were read from the PR API.\n- **unknown:** Effects on installed versions and external users have not been established.\n\n**Challenges**\n\n- **Compatibility:** The owner must assess dependency changes that can reach people outside the team.\n"
    body += "\n<details>\n<summary>Recovery levels</summary>\n\nUndo — a revert puts it right\nRepair — real work, contained to this team\nMigrate — coordinated change involving other people\nAnswer — someone outside the team with standing to ask is affected, and nothing unmakes it\n\n</details>\n"
    with tempfile.NamedTemporaryFile(mode="w", suffix=".md") as file:
        file.write(body)
        file.flush()
        run("gh", "pr", "edit", str(pr["number"]), "--body-file", file.name)


def main():
    if len(sys.argv) > 1:
        if sys.argv[1:] == ["--help"]:
            print(__doc__)
            return 0
        raise SystemExit("Usage: scripts/deps-land [--help]")
    root = Path(run("git", "rev-parse", "--show-toplevel", capture=True))
    os.chdir(root)
    common = Path(run("git", "rev-parse", "--path-format=absolute", "--git-common-dir", capture=True))
    worktrees = common.parent / ".worktrees"
    worktrees.mkdir(exist_ok=True)
    prs = gh_json("pr", "list", "--author", "app/dependabot", "--state", "open", "--limit", "1000",
                  "--json", "number,title,body,labels,headRefOid,isDraft,url")
    summary = []
    failed = False
    # Refresh default for each head: earlier merges can change the comparison base.
    for pr in sorted(prs, key=lambda item: item["number"]):
        number = str(pr["number"])
        work = worktrees / f"deps-{number}"
        created = False
        keep_worktree = False
        try:
            if pr["isDraft"]:
                summary.append(f"DRAFT {pr['url']}")
                continue
            if work.exists():
                raise RuntimeError(f"Existing worktree {work}; inspect it before retrying")
            run("git", "fetch", "origin")
            run("git", "fetch", "origin", f"pull/{number}/head")
            sha = run("git", "rev-parse", "FETCH_HEAD", capture=True)
            if sha != pr["headRefOid"]:
                raise RuntimeError("Dependabot head changed; rerun against fresh PR metadata")
            run("git", "worktree", "add", "--detach", str(work), sha)
            created = True
            keep_worktree = True
            files = gh_json("api", "--paginate", "--slurp", f"repos/{{owner}}/{{repo}}/pulls/{number}/files")
            paths = [path for page in files for file in page for path in
                     [file["filename"], file.get("previous_filename", file["filename"])]]
            add_contract(pr, paths, root)
            if INSTALL:
                run("bash", "-euo", "pipefail", "-c", INSTALL, cwd=work)
            env = {**os.environ, "CI_LOCAL_PR": number}
            # Use the trusted current gate even if the bot branch predates its addition.
            run("bash", str(root / "scripts/ci-local"), "--no-push", cwd=work, env=env)
            kind = update_kind(pr)
            if kind != "minor/patch":
                summary.append(f"OWNER ({kind}; gate passed) {pr['url']}")
                continue
            latest = gh_json('pr', 'view', number, '--json', 'body,labels,headRefOid')
            if latest['headRefOid'] != sha:
                raise RuntimeError('PR head changed after the gate; rerun locally')
            reason = owner_reason(latest, paths, work)
            if reason:
                summary.append(f"OWNER ({reason}; gate passed) {pr['url']}")
                keep_worktree = True
                continue
            run("gh", "pr", "merge", number, "--squash", "--auto", "--match-head-commit", sha)
            state = gh_json('pr', 'view', number, '--json', 'mergeStateStatus,state')
            if state['state'] != 'MERGED' and state['mergeStateStatus'] == 'CLEAN':
                run('gh', 'pr', 'merge', number, '--squash', '--match-head-commit', sha)
                state = gh_json('pr', 'view', number, '--json', 'mergeStateStatus,state')
            keep_worktree = state['state'] != 'MERGED'
            summary.append(f"{'AUTO-MERGE ARMED' if keep_worktree else 'MERGED'} {pr['url']}")
        except (subprocess.CalledProcessError, RuntimeError) as error:
            failed = True
            summary.append(f"FAILED {pr['url']}: {error}")
        finally:
            if created and not keep_worktree:
                try:
                    run("git", "worktree", "remove", "--force", str(work))
                except subprocess.CalledProcessError:
                    failed = True
                    summary.append(f"CLEANUP FAILED {work}")
    print("\nDependency maintenance summary:")
    print("\n".join(summary) if summary else "No open Dependabot PRs.")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
