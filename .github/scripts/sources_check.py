"""Report newer stable source tags in one issue; run with GITHUB_TOKEN/GITHUB_REPOSITORY."""

import json
import os
import re
import sys
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

MARKER = re.compile(r"^<!-- source: github-tags ([\w.-]+/[\w.-]+) -->$", re.M)
VERSION = re.compile(r"v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)")
TITLE = "Source updates"


def version(tag):
    """Only stable semantic tags are adoption candidates, not prereleases."""
    match = VERSION.fullmatch(tag)
    return tuple(map(int, match.groups())) if match else None


def sources(text):
    entries = []
    for marker in MARKER.finditer(text):
        line = text[marker.end() :].splitlines()
        if len(line) < 2 or not line[1].strip():
            raise ValueError(f"Missing version line for {marker[1]}")
        current = line[1].split()[-1]
        if version(current) is None:
            raise ValueError(f"Invalid stable version for {marker[1]}")
        entries.append((marker[1], current))
    if not entries or len(re.findall(r"^<!-- source:", text, re.M)) != len(entries):
        raise ValueError("Missing or malformed source markers")
    if len({repo for repo, _ in entries}) != len(entries):
        raise ValueError("Duplicate source repository")
    return entries


class GitHub:
    def __init__(self, token):
        self.token = token

    def request(self, method, path, payload=None):
        request = Request(
            "https://api.github.com" + path,
            data=json.dumps(payload).encode() if payload is not None else None,
            headers={
                "Authorization": f"Bearer {self.token}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
                "Content-Type": "application/json",
            },
            method=method,
        )
        with urlopen(request, timeout=30) as response:
            return json.load(response)

    def pages(self, path):
        page = 1
        while True:
            items = self.request("GET", f"{path}&per_page=100&page={page}")
            yield from items
            if len(items) < 100:
                return
            page += 1


def updates_for(api, entries):
    updates = []
    for repo, current in entries:
        tags = [
            tag["name"]
            for tag in api.pages(f"/repos/{repo}/tags?")
            if version(tag["name"]) is not None
        ]
        if not tags:
            raise ValueError(f"No stable semantic tags found for {repo}")
        newest = max(tags, key=version)
        if version(newest) > version(current):
            updates.append((repo, current, newest))
    return updates


def sync_issue(api, repository, updates):
    path = f"/repos/{repository}/issues"
    issues = [
        issue
        for issue in api.pages(path + "?state=all&sort=created&direction=asc")
        if issue["title"] == TITLE and "pull_request" not in issue
    ]
    # Prefer an existing open issue; otherwise reopen the original instead of creating another.
    issue = next((item for item in issues if item["state"] == "open"), None)
    if issue is None and issues:
        issue = issues[0]
    if not updates:
        for item in issues:
            if item["state"] == "open":
                api.request("PATCH", f"{path}/{item['number']}", {"state": "closed"})
        return
    body = (
        "Tagged sources have newer stable versions. Read the upstream changes and open a "
        "reviewed PR to adopt them; a new major needs a class-aware record (SRC-4).\n\n"
        "| Source | Current → newest |\n| --- | --- |\n"
    )
    for repo, current, newest in updates:
        body += (
            f"| [{repo}](https://github.com/{repo}/tags) | `{current}` → `{newest}` |\n"
        )
    payload = {"title": TITLE, "body": body, "state": "open"}
    if issue:
        api.request("PATCH", f"{path}/{issue['number']}", payload)
    else:
        api.request("POST", path, {"title": TITLE, "body": body})
    for item in issues:
        if item["state"] == "open" and item["number"] != issue["number"]:
            api.request("PATCH", f"{path}/{item['number']}", {"state": "closed"})


def main():
    api = GitHub(os.environ["GITHUB_TOKEN"])
    repository = os.environ["GITHUB_REPOSITORY"]
    if not re.fullmatch(r"[\w.-]+/[\w.-]+", repository):
        raise ValueError("Invalid GITHUB_REPOSITORY")
    source_file = Path(__file__).resolve().parents[2] / "core/references/sources.md"
    updates = updates_for(api, sources(source_file.read_text()))
    sync_issue(api, repository, updates)
    print(f"Source check complete: {len(updates)} update(s)")


if __name__ == "__main__":
    try:
        main()
    except HTTPError as error:
        sys.exit(f"GitHub API failed: HTTP {error.code}; issue state may need review")
    except (OSError, ValueError, KeyError) as error:
        sys.exit(f"Source check failed: {error}")
