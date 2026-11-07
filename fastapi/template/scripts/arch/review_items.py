"""Lists what the checks leave to review, for the CI output of `make arch`.

- `text(` call sites in src/: raw SQL may touch another module's table.
- raw SQL in migrations, with the reason from its `# reviewed:` comment.
"""

import ast
import re
import sys
from collections.abc import Iterator
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REVIEWED = re.compile(r"#\s*reviewed:\s*(?P<reason>.+)")


def _calls(path: Path, names: set[str]) -> Iterator[ast.Call]:
    for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
        if isinstance(node, ast.Call):
            func = node.func
            name = func.attr if isinstance(func, ast.Attribute) else getattr(func, "id", None)
            if name in names:
                yield node


def items(root: Path) -> list[str]:
    found = []
    for path in sorted((root / "src").rglob("*.py")):
        for call in _calls(path, {"text"}):
            found.append(f"raw SQL in code: {path.relative_to(root)}:{call.lineno}")
    for path in sorted((root / "alembic" / "versions").glob("*.py")):
        lines = path.read_text(encoding="utf-8").splitlines()
        for call in _calls(path, {"execute", "exec_driver_sql"}):
            match = REVIEWED.search(lines[call.lineno - 2]) or REVIEWED.search(
                lines[call.lineno - 1]
            )
            reason = match["reason"] if match else "NO REASON"
            found.append(f"raw SQL in migration: {path.relative_to(root)}:{call.lineno}: {reason}")
    return found


if __name__ == "__main__":
    review = items(ROOT)
    sys.stdout.write("Review items:\n" + "".join(f"  {item}\n" for item in review))
