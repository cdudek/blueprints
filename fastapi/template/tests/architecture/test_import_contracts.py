"""import-linter: the template keeps every contract; each fixture breaks exactly its own."""

import contextlib
import io
from pathlib import Path

import pytest
from importlinter.cli import lint_imports

from tests.architecture.conftest import FIXTURES, TEMPLATE


def run(config: Path) -> tuple[int, str]:
    out = io.StringIO()
    with contextlib.redirect_stdout(out):
        code = lint_imports(config_filename=str(config), no_cache=True, no_logo=True)
    return code, out.getvalue()


def test_the_template_keeps_every_contract() -> None:
    code, out = run(TEMPLATE / ".importlinter")

    assert code == 0, out
    assert "0 broken" in out


VIOLATIONS = {
    "door": "Illegal imports of protected package door_bad.modules.orders.service:",
    "role_door": "Illegal imports of protected package role_door_bad.modules.orders.router:",
    "rules_pure_imports": (
        "rules_pure_bad.modules.orders.rules is not allowed to import sqlalchemy:"
    ),
    "no_framework_in_core": "core_bad.modules.orders.service is not allowed to import fastapi:",
    "layers": "layers_bad.modules.orders is not allowed to import layers_bad.modules.billing:",
}


@pytest.mark.parametrize(("rule", "message"), VIOLATIONS.items())
def test_the_fixture_breaks_its_contract(
    rule: str, message: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.syspath_prepend(str(FIXTURES / rule / "bad"))

    code, out = run(FIXTURES / rule / "bad" / ".importlinter")

    assert code == 1
    assert "0 kept, 1 broken" in out
    assert message in out


@pytest.mark.parametrize("rule", VIOLATIONS)
def test_the_clean_twin_keeps_it(rule: str, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.syspath_prepend(str(FIXTURES / rule / "clean"))

    code, out = run(FIXTURES / rule / "clean" / ".importlinter")

    assert code == 0, out
