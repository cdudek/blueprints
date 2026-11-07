"""AST rules over src/, each with a deliberate violation, a clean twin and exact messages."""

from collections.abc import Callable
from pathlib import Path

import pytest

from tests.architecture import rules
from tests.architecture.conftest import FIXTURES, SRC

type Rule = Callable[[Path], list[str]]

CASES: dict[str, tuple[Rule, list[str]]] = {
    "transaction_owner": (
        rules.transaction_owner,
        [
            "app/modules/orders/service.py:5: in_transaction() outside an entry point "
            "(app/api, router.py, app/workflows, jobs.py): take `tx` as an argument",
            "app/modules/orders/service.py:6: .commit() outside app/db: "
            "the entry point's in_transaction() commits and rolls back",
        ],
    ),
    "sessions_in_db": (
        rules.sessions_in_db,
        [
            "app/modules/orders/repository.py:1: sqlalchemy.ext.asyncio imported outside "
            "app/db: engines and sessions are built only in app/db"
        ],
    ),
    "external_call_in_transaction": (
        rules.external_call_in_transaction,
        [
            "app/modules/billing/jobs.py:7: payments called inside in_transaction(): "
            "call external services between transactions"
        ],
    ),
    "pure_rules": (
        rules.pure_rules,
        [
            "app/modules/orders/rules.py:1: rules.py must be pure: random (pass the value in)",
            "app/modules/orders/rules.py:6: rules.py must be pure: now() (pass the value in)",
        ],
    ),
    "door_shape": (
        rules.door_shape,
        [
            "app/modules/__init__.py:1: app/modules/__init__.py stays empty",
            "app/modules/orders/__init__.py:3: a door re-exports only its own module",
            "app/modules/orders/__init__.py:4: no aliased imports in a door",
            "app/modules/orders/__init__.py:6: a door holds only imports and __all__, not Assign",
        ],
    ),
}


@pytest.mark.parametrize("name", CASES)
def test_the_template_keeps_the_rule(name: str) -> None:
    rule, _ = CASES[name]

    assert rule(SRC) == []


@pytest.mark.parametrize("name", CASES)
def test_the_fixture_breaks_the_rule_with_exact_messages(name: str) -> None:
    rule, expected = CASES[name]

    assert sorted(rule(FIXTURES / name / "bad")) == sorted(expected)


@pytest.mark.parametrize("name", CASES)
def test_the_clean_twin_keeps_the_rule(name: str) -> None:
    rule, _ = CASES[name]

    assert rule(FIXTURES / name / "clean") == []


def test_the_selections_are_not_empty() -> None:
    """A rule that selects no file passes vacuously; the template must give each one work."""
    modules = SRC / "app" / "modules"

    assert len(list(modules.glob("*/__init__.py"))) >= 2
    assert len(list(modules.glob("*/rules.py"))) >= 2
    assert list(modules.glob("*/jobs.py"))
    assert list((SRC / "app" / "workflows").glob("*.py"))
