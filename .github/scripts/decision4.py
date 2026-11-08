"""Decision4 v1.0.1: shared PR-body and boundary-map check.

Usage: BODY="$(cat body.md)" FILES=files.txt MAP=boundary-map.yaml python3 decision4.py
Or: python3 decision4.py --body-file body.md --files files.txt --map boundary-map.yaml
Dependencies: PyYAML 6.0.3, jsonschema 4.26.0. No repository code is executed.
Schema: Habitat-Thinking/decision4@4429f821780655f253a954b2659bf38e7b9d5517
The embedded upstream schema is MIT licensed, Copyright Habitat Thinking.
Rules and contract: Habitat Thinking, Decision4 v1.0.1, CC BY 4.0.
"""

import argparse
import json
import os
import re
from pathlib import Path

import jsonschema
import yaml

ORDER = ["Undo", "Repair", "Migrate", "Answer"]
# Exact schema at the pinned upstream commit, embedded so local consumers fetch one file.
SCHEMA = json.loads(r"""{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://github.com/Habitat-Thinking/decision4/boundary-map.schema.json",
  "title": "Decision4 boundary map",
  "description": "Where the ground changes: the floor class for each part of a system (Decision4 1.0.1, section 10).",
  "type": "object",
  "required": [
    "version",
    "entries"
  ],
  "additionalProperties": false,
  "properties": {
    "version": {
      "const": 1
    },
    "precedence": {
      "enum": [
        "highest-floor-wins"
      ],
      "default": "highest-floor-wins"
    },
    "entries": {
      "type": "array",
      "items": {
        "$ref": "#/$defs/entry"
      }
    }
  },
  "$defs": {
    "class": {
      "enum": [
        "Undo",
        "Repair",
        "Migrate",
        "Answer"
      ]
    },
    "patterns": {
      "type": "array",
      "items": {
        "type": "string",
        "minLength": 1
      },
      "minItems": 1
    },
    "entry": {
      "type": "object",
      "required": [
        "select",
        "floor"
      ],
      "additionalProperties": false,
      "properties": {
        "select": {
          "type": "object",
          "minProperties": 1,
          "additionalProperties": false,
          "properties": {
            "paths": {
              "$ref": "#/$defs/patterns"
            },
            "config_keys": {
              "$ref": "#/$defs/patterns"
            },
            "data_stores": {
              "$ref": "#/$defs/patterns"
            },
            "external_apis": {
              "$ref": "#/$defs/patterns"
            },
            "credentials": {
              "$ref": "#/$defs/patterns"
            },
            "environments": {
              "$ref": "#/$defs/patterns"
            }
          }
        },
        "floor": {
          "$ref": "#/$defs/class"
        },
        "put_right": {
          "type": "string"
        },
        "answerer": {
          "type": "string"
        },
        "records": {
          "type": "array",
          "items": {
            "type": "string"
          }
        }
      }
    }
  }
}""")
HEADING = "How hard is it to undo this PR after merging?"


def clean(text):
    text = re.sub(r"<!--.*?(?:-->|$)", "", text.replace("\r", ""), flags=re.S)
    return re.sub(r"(?m)^```[^\n]*\n.*?(?:^```[^\n]*$|\Z)", "", text, flags=re.S)


def nonempty(value):
    value = value.strip().strip("*").strip()
    return bool(value) and not re.match(
        r"^(?:none|n/?a|[-—])(?:[. ]|$)|^<", value, re.I
    )


def section(body, title):
    match = re.search(r"^#{2,3}[ \t]+" + re.escape(title) + r"[ \t]*$", body, re.M)
    if not match:
        return ""
    return re.split(r"^#{1,3}[ \t]+", body[match.end() :], maxsplit=1, flags=re.M)[0]


def fields(text, *names):
    labels = "|".join(re.escape(name) for name in names)
    return list(
        re.finditer(
            rf"^[ \t]*(?:[-*+][ \t]+)?(?:\*\*)?(?:{labels}):(?:\*\*)?[ \t]*(.*?)[ \t]*$",
            text,
            re.M | re.I,
        )
    )


def value(text, *names):
    return next(
        (m.group(1).strip() for m in fields(text, *names) if nonempty(m.group(1))), ""
    )


def numbered(text, indent=False):
    """Read only the contiguous numbered list immediately following a marker."""
    result = []
    for line in text.splitlines():
        if not line.strip():
            continue
        item = re.match(r"^( +|\t+)?[0-9]+[.)][ \t]+(.*)$", line)
        if not item or (indent and not item.group(1)):
            break
        if nonempty(item.group(2)):
            result.append(item.group(2).strip())
    return result


def recovery(text):
    if value(text, "Recovery steps", "Put-right"):
        return True
    marker = re.search(r"^\*\*Recovery steps\*\*[ \t]*$", text, re.M | re.I)
    if marker and numbered(text[marker.end() :]):
        return True
    return any(
        numbered(text[m.end() :], indent=True) for m in fields(text, "Recovery steps")
    )


def block(text, label):
    marker = re.search(
        r"^\*\*" + re.escape(label) + r"\*\*:?[^\S\n]*$", text, re.M | re.I
    )
    if not marker:
        return ""
    return re.split(
        r"^\*\*[A-Za-z ]+\*\*:?[^\S\n]*$", text[marker.end() :], maxsplit=1, flags=re.M
    )[0]


def glob_regex(pattern):
    out, i = "", 0
    while i < len(pattern):
        if pattern.startswith("**/", i):
            out, i = out + "(?:.*/)?", i + 3
        elif pattern.startswith("**", i):
            out, i = out + ".*", i + 2
        elif pattern[i] == "*":
            out, i = out + "[^/]*", i + 1
        elif pattern[i] == "?":
            out, i = out + "[^/]", i + 1
        else:
            out, i = out + re.escape(pattern[i]), i + 1
    return re.compile(out + "$")


def map_floor(mapping, paths):
    jsonschema.Draft202012Validator(SCHEMA).validate(mapping)
    floor, messages, covered = "Undo", [], set()
    for entry in mapping["entries"]:
        selectors = entry["select"]
        patterns = selectors.get("paths", [])
        if not patterns:
            # Changed paths cannot establish a match on non-path ground.
            messages.append(
                "map note: non-path ground, read by a person: "
                + ", ".join(selectors)
                + f" -> {entry['floor']}"
            )
            continue
        hits = {p for p in paths if any(glob_regex(g).fullmatch(p) for g in patterns)}
        if not hits:
            continue
        if set(selectors) != {"paths"}:
            # Path data cannot establish the other conjuncts. Never silently treat
            # paths + production (or credentials) as a proven path-only match.
            messages.append(
                "map gap: non-path selectors need owner review: " + ", ".join(selectors)
            )
            floor = max(floor, "Repair", key=ORDER.index)
        else:
            covered.update(hits)
        floor = max(floor, entry["floor"], key=ORDER.index)
        messages.append(f"floor {entry['floor']}: " + ", ".join(sorted(hits)[:5]))
    gaps = set(paths) - covered
    if gaps:
        messages.append(
            "map gap: unmapped or uncertain paths: " + ", ".join(sorted(gaps))
        )
        floor = max(floor, "Repair", key=ORDER.index)
    return floor, messages


def named_person(text):
    if re.fullmatch(r"@[A-Za-z0-9][A-Za-z0-9-]*", text.strip()):
        return True
    roles = r"\b(?:owner|team|lead|maintainer|engineer|developer|manager|director|cto|ceo|cfo|service|on.call|role|tbd|unassigned)\b"
    return bool(re.search(r"[A-ZÀ-Þ][a-zà-ÿ]+", text)) and not re.search(
        roles, text, re.I
    )


def check(body, paths, mapping, base_mapping=None):
    body = clean(body)
    errors = []
    floor, messages = map_floor(mapping, paths)
    if base_mapping is not None:
        old_floor, old_messages = map_floor(base_mapping, paths)
        floor = max(floor, old_floor, key=ORDER.index)
        messages.extend("base " + message for message in old_messages)
    scope = section(body, HEADING)
    selected = re.findall(
        r"^\*\*(?:[🟢🟡🟠🔴][ \t]+)?(Undo|Repair|Migrate|Answer)\*\*", scope, re.M
    )
    legacy = [m.group(1).strip() for m in fields(body, "Decision-Class")]
    if (
        len(selected) > 1
        or len(legacy) > 1
        or not (selected or legacy)
        or any(c not in ORDER for c in legacy)
        or (selected and legacy and selected[0] != legacy[0])
    ):
        return [
            "Declare exactly one class in the Decision4 section (or Decision-Class); both forms must agree"
        ], messages
    declared = (selected or legacy)[0]
    # Read modern fields only inside the recovery section; legacy fields remain global.
    recovery_scope = scope if selected else body
    change = value(recovery_scope, "Classification change", "Class-Change") or value(
        body, "Class-Change"
    )
    if ORDER.index(declared) < ORDER.index(floor) and not change:
        errors.append(
            f"Declared {declared} is below floor {floor}; record the lowering in Classification change"
        )
    effective = max(declared, floor, key=ORDER.index)
    if ORDER.index(effective) >= 1 and not (
        recovery(recovery_scope) or value(body, "Put-right")
    ):
        errors.append(f"{effective} needs filled Recovery steps (or Put-right)")
    responsible = value(
        recovery_scope, "Responsible for recovery", "Accountable person", "Answerer"
    ) or value(body, "Answerer")
    if ORDER.index(effective) >= 2 and not responsible:
        errors.append(f"{effective} needs Responsible for recovery (or Answerer)")
    record = section(body, "Decision record")
    if effective == "Repair":
        for label in ("Chose", "Over", "Because", "Commits us to"):
            if not value(record, label):
                errors.append(f"Repair needs {label} under Decision record")
    elif effective == "Migrate":
        options = numbered(block(record, "Options"))
        forced = len(options) == 1 and re.search(r"\bforced\b", options[0], re.I)
        constraint = len(options) == 1 and re.search(
            r"\bconstraint\s*:?\*{0,2}\s*:?\s*(.+)", options[0], re.I
        )
        if len(options) < 2 and not (
            forced and constraint and nonempty(constraint.group(1))
        ):
            errors.append(
                "Migrate needs at least two real Options, or one Forced option with its Constraint"
            )
    elif effective == "Answer":
        if not named_person(responsible):
            errors.append(
                "Answer needs a named person or @handle, not a role, for Responsible for recovery"
            )
        evidence = block(record, "Evidence")
        items = [m.group(1) for m in re.finditer(r"^[-*][ \t]+(.+)$", evidence, re.M)]
        if not items or any(
            not re.match(
                r"(?:\*\*)?(?:observed|inferred|asked|unknown)(?:\*\*)?:(?:\*\*)?\s*\S",
                item,
                re.I,
            )
            for item in items
        ):
            errors.append(
                "Answer needs Evidence items each labelled observed/inferred/asked/unknown"
            )
        challenges = block(record, "Challenges")
        if not any(
            nonempty(m.group(1))
            for m in re.finditer(r"^[-*][ \t]+(.+)$", challenges, re.M)
        ):
            errors.append("Answer needs Challenges")
        if re.search(r"\brecommend(?:ation|ations)?\b", record, re.I):
            errors.append("Answer must not contain a Recommend/recommendation line")
    messages.append(
        f"Decision4: declared {declared}; floor {floor}; effective {effective}"
    )
    return errors, messages


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--body-file", type=Path)
    parser.add_argument("--files", type=Path, default=os.environ.get("FILES"))
    parser.add_argument(
        "--map", type=Path, default=os.environ.get("MAP", "boundary-map.yaml")
    )
    parser.add_argument("--base-map", type=Path)
    args = parser.parse_args()
    try:
        if args.files is None:
            raise ValueError("FILES or --files is required")
        body = args.body_file.read_text() if args.body_file else os.environ["BODY"]
        mapping = yaml.safe_load(args.map.read_text())
        base = yaml.safe_load(args.base_map.read_text()) if args.base_map else None
        errors, messages = check(
            body, args.files.read_text().splitlines(), mapping, base
        )
        for message in messages:
            print(message)
        for error in errors:
            print("Decision4 error: " + error)
        return bool(errors)
    except (
        OSError,
        KeyError,
        ValueError,
        yaml.YAMLError,
        jsonschema.ValidationError,
    ) as error:
        print("Decision4 input error: " + str(error))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
