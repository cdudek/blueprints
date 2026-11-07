"""Expand migrations stay additive, so old and new versions run side by side."""

from tests.architecture import rules
from tests.architecture.conftest import FIXTURES, TEMPLATE


def test_the_template_migrations_keep_the_rule() -> None:
    versions = TEMPLATE / "alembic" / "versions"

    assert list(versions.glob("*.py")), "the rule needs migrations to check"
    assert rules.migration_phases(versions) == []


def test_the_fixture_breaks_the_rule_with_exact_messages() -> None:
    expand = "an expand migration may not"
    move = "move it to a contract migration"

    assert rules.migration_phases(FIXTURES / "migration_phases" / "bad" / "versions") == [
        f"0001_narrow.py:8: {expand} call op.drop_column(); {move}",
        f"0001_narrow.py:9: {expand} tighten a column to NOT NULL; {move}",
        f"0001_narrow.py:10: {expand} change a column type; {move}",
        "0001_narrow.py:11: raw SQL needs a `# reviewed: <reason>` comment on the line above",
        '0002_unmarked.py:1: set PHASE = "expand" or "contract"',
        "0003_contract.py:1: a contract migration names the release that removed the last use "
        "(LAST_USE_REMOVED_IN)",
    ]


def test_the_clean_twin_keeps_the_rule() -> None:
    assert rules.migration_phases(FIXTURES / "migration_phases" / "clean" / "versions") == []
