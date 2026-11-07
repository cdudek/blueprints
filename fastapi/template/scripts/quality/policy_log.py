"""quality/policy-log.toml: every accepted loosening, with its reason and date."""

import datetime
import tomllib
from pathlib import Path

LOG = Path("quality") / "policy-log.toml"


def logged_changes(root: Path) -> set[str]:
    """The `change` texts of valid entries. An entry without a reason or a date is an error."""
    path = root / LOG
    if not path.exists():
        return set()
    changes = set()
    for i, entry in enumerate(tomllib.loads(path.read_text(encoding="utf-8")).get("entry", [])):
        if not (
            isinstance(entry.get("change"), str)
            and str(entry.get("reason", "")).strip()
            and isinstance(entry.get("date"), datetime.date)
        ):
            raise ValueError(f"{LOG} entry {i + 1}: needs change, reason and date")
        changes.add(entry["change"])
    return changes
