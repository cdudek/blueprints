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

    def fields(name):
        # Plain, list and bold-label forms remain valid for every field alias.
        return list(re.finditer(
            rf"^[ \t]*(?:[-*+][ \t]+)?(?:\*\*)?{re.escape(name)}:(?:\*\*)?[ \t]*(.*?)[ \t]*$",
            body, re.M,
        ))

    def nonempty(value):
        return bool(value) and not value.startswith("<") and not re.match(
            r"(?:none|n/?a)\b|[-—](?:\s|$)", value, re.I,
        )

    def filled(*names):
        for name in names:
            for match in fields(name):
                if nonempty(match.group(1)):
                    return True
                if name == "Recovery steps":
                    # Only this field's indented numbered steps count, never a
                    # later field or an unrelated list elsewhere in the body.
                    for line in body[match.end():].splitlines():
                        if not line.strip():
                            continue
                        if not line.startswith((" ", "\t")):
                            break
                        step = re.match(r"^[ \t]+[0-9]+[.)][ \t]+(.*)", line)
                        if step and nonempty(step.group(1).strip()):
                            return True
        return False

    heading = re.search(r"^### How hard is it to undo this PR after merging\?[ \t]*$", body, re.M)
    selected = []
    if heading:
        section = re.split(r"^#{1,6}[ \t]+", body[heading.end():], maxsplit=1, flags=re.M)[0]
        selected = re.findall(r"^[ \t]*\*\*(?:[🟢🟡🟠🔴][ \t]+)?(Undo|Repair|Migrate|Answer)\*\*", section, re.M)
    legacy = [match.group(1) for match in fields("Decision-Class")]
    if (len(selected) > 1 or len(legacy) > 1 or not (selected or legacy)
            or any(value not in ORDER for value in legacy)
            or (selected and legacy and selected[0] != legacy[0])):
        fail("PR body needs exactly one class in the Decision4 section or 'Decision-Class: Undo|Repair|Migrate|Answer'; both forms must agree")
    declared = (selected or legacy)[0]
    files = [f for f in open(os.environ["FILES"]).read().split("\n") if f]
    floor = "Undo"
    for e in yaml.safe_load(open(os.environ["MAP"]))["entries"]:
        hit = sorted({f for g in e["select"].get("paths", []) for f in files if rx(g).match(f)})
        if hit:
            print(f"floor {e['floor']}: {', '.join(hit[:5])}{' ...' if len(hit) > 5 else ''}")
            floor = max(floor, e["floor"], key=ORDER.index)
    print(f"computed floor: {floor}, declared: {declared}")
    if ORDER.index(declared) < ORDER.index(floor) and not filled("Classification change", "Class-Change"):
        fail(f"Decision-Class {declared} is below the floor {floor}; raise it, or record the lowering in 'Classification change:' (or 'Class-Change:')")
    eff = max(declared, floor, key=ORDER.index)
    if ORDER.index(eff) >= 1 and not filled("Recovery steps", "Put-right"):
        fail(f"class {eff} needs filled 'Recovery steps:' (or 'Put-right:')")
    if ORDER.index(eff) >= 2 and not filled("Responsible for recovery", "Accountable person", "Answerer"):
        fail(f"class {eff} needs filled 'Responsible for recovery:' (or 'Accountable person:' / 'Answerer:')")
    print(f"Decision4 class: {eff}")


main()
