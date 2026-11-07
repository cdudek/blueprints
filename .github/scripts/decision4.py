"""Decision4 PR check (CI-26): floor from changed paths, fields from the PR body.

Inputs (env): BODY (PR body), FILES (file with changed paths, one per line), MAP (boundary map path).
Exits 1 with a ::error:: line when the PR body does not meet the floor.
"""

import os
import re
import sys

import yaml

ORDER = ["Undo", "Repair", "Migrate", "Answer"]


def fail(msg):
    print(f"::error::{msg}")
    sys.exit(1)


def rx(glob):  # ** any depth, * one segment
    out, i = "", 0
    while i < len(glob):
        if glob.startswith("**/", i):
            out, i = out + "(?:.*/)?", i + 3
        elif glob.startswith("**", i):
            out, i = out + ".*", i + 2
        elif glob[i] == "*":
            out, i = out + "[^/]*", i + 1
        else:
            out, i = out + re.escape(glob[i]), i + 1
    return re.compile(out + "$")


def main():
    body = re.sub(r"<!--.*?-->", "", os.environ["BODY"], flags=re.S).replace("\r", "")
    body = re.sub(r"<!--.*", "", body, flags=re.S)  # an unterminated comment hides the rest on GitHub

    def field(name):
        m = re.search(rf"^[ \t]*{name}:[ \t]*(.*?)[ \t]*$", body, re.M)
        return m.group(1) if m else ""

    def filled(name):
        return bool(field(name)) and not field(name).startswith("<")

    declared = field("Decision-Class")
    if declared not in ORDER:
        fail("PR body needs one line 'Decision-Class: Undo|Repair|Migrate|Answer' with exactly one class")
    files = [f for f in open(os.environ["FILES"]).read().split("\n") if f]
    floor = "Undo"
    for e in yaml.safe_load(open(os.environ["MAP"]))["entries"]:
        hit = sorted({f for g in e["select"].get("paths", []) for f in files if rx(g).match(f)})
        if hit:
            print(f"floor {e['floor']}: {', '.join(hit[:5])}{' ...' if len(hit) > 5 else ''}")
            floor = max(floor, e["floor"], key=ORDER.index)
    print(f"computed floor: {floor}, declared: {declared}")
    if ORDER.index(declared) < ORDER.index(floor) and not filled("Class-Change"):
        fail(f"Decision-Class {declared} is below the floor {floor}; raise it, or record the lowering in a 'Class-Change:' line")
    eff = max(declared, floor, key=ORDER.index)
    if ORDER.index(eff) >= 1 and not filled("Put-right"):
        fail(f"class {eff} needs a filled 'Put-right:' line")
    if ORDER.index(eff) >= 2 and not filled("Answerer"):
        fail(f"class {eff} needs a filled 'Answerer:' line")
    print(f"Decision4 class: {eff}")


main()
