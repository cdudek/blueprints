import datetime
import subprocess
from pathlib import Path

import pytest
from scripts.arch.baseline import broken
from scripts.arch.generate import render
from scripts.arch.policy import ROOT, load_policy
from scripts.quality import baseline_shrinks, policy_changes
from scripts.quality.git import GIT
from scripts.quality.policy_changes import architecture_loosenings, lint_loosenings
from scripts.quality.policy_log import logged_changes

FIXTURES = ROOT / "tests" / "fixtures" / "arch"


def test_an_unknown_schema_version_is_refused(tmp_path: Path) -> None:
    policy = tmp_path / "architecture.toml"
    policy.write_text("schema_version = 2\n")

    with pytest.raises(ValueError, match="schema_version 2 is not supported"):
        load_policy(policy)


def test_a_baseline_line_becomes_an_ignored_import() -> None:
    pair = "app.modules.billing.service -> app.modules.orders.repository"

    text = render(load_policy(), ROOT / "src", {"orders-door": [pair]})

    section = text.split("[importlinter:contract:orders-door]", 1)[1].split("\n[", 1)[0]
    assert f"ignore_imports =\n    {pair}\n" in section


def test_a_never_baselinable_contract_is_refused() -> None:
    with pytest.raises(ValueError, match="router-doors is never baselinable"):
        render(load_policy(), ROOT / "src", {"router-doors": ["app.workflows.x -> y"]})


@pytest.mark.parametrize(
    ("rule", "pair"),
    [
        ("door", "door_bad.modules.billing.service -> door_bad.modules.orders.service"),
        (
            "rules_pure_imports",
            "rules_pure_bad.modules.orders.rules -> rules_pure_bad.modules.orders.limits",
        ),
        ("layers", "layers_bad.modules.orders.service -> layers_bad.modules.billing"),
    ],
)
def test_the_baseline_writer_records_the_import_the_source_makes(
    rule: str, pair: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.syspath_prepend(str(FIXTURES / rule / "bad"))

    found = broken(FIXTURES / rule / "bad" / ".importlinter")

    assert list(found.values()) == [{pair}]


def test_architecture_loosenings_are_named() -> None:
    base = {
        "layers": [["api"], ["modules.orders"], ["db"]],
        "public_routes": ["/healthz"],
        "role_doors": {"jobs": {"importers": ["worker"]}},
        "rules": {"forbidden": ["app.db", "httpx"]},
        "modules": {"orders": {}},
    }
    now = {
        "layers": [["api"], ["db"], ["modules.orders"]],
        "public_routes": ["/healthz", "/status"],
        "role_doors": {"jobs": {"importers": ["worker", "api"], "module_may_import": True}},
        "rules": {"forbidden": ["app.db"]},
        "modules": {"orders": {}},
    }

    assert architecture_loosenings(base, now) == [
        "public route added: /status",
        "layer edge added: db -> modules.orders",
        "jobs door importer added: api",
        "jobs door: its own module may now import it",
        "rules forbidden import removed: httpx",
    ]
    assert architecture_loosenings(now, now) == []


def test_lint_loosenings_are_named() -> None:
    base = {"tool": {"ruff": {"lint": {"select": ["E", "S"]}}, "mypy": {"strict": True}}}
    now = {
        "tool": {
            "ruff": {"lint": {"select": ["E"], "mccabe": {"max-complexity": 15}}},
            "mypy": {"strict": False},
        }
    }

    assert lint_loosenings(base, now) == [
        "lint threshold raised: mccabe.max-complexity 10 -> 15",
        "ruff rule family removed: S",
        "mypy strict disabled",
    ]


def test_a_policy_log_entry_needs_a_reason_and_a_date(tmp_path: Path) -> None:
    (tmp_path / "quality").mkdir()
    log = tmp_path / "quality" / "policy-log.toml"
    log.write_text(
        '[[entry]]\nchange = "public route added: /status"\nreason = ""\ndate = 2026-01-31\n'
    )

    with pytest.raises(ValueError, match="needs change, reason and date"):
        logged_changes(tmp_path)

    log.write_text(
        '[[entry]]\nchange = "public route added: /status"\nreason = "probe"\n'
        f"date = {datetime.date(2026, 1, 31).isoformat()}\n"
    )
    assert logged_changes(tmp_path) == {"public route added: /status"}


def git(repo: Path, *args: str) -> None:
    subprocess.run(
        [GIT, "-c", "user.name=t", "-c", "user.email=t@example.invalid", *args],
        cwd=repo,
        check=True,
        capture_output=True,
    )


@pytest.fixture
def repo(tmp_path: Path) -> Path:
    (tmp_path / "quality").mkdir()
    (tmp_path / "quality" / "arch-baseline.toml").write_text(
        '[ignore_imports]\n"orders-door" = ["a -> b"]\n'
    )
    (tmp_path / "architecture.toml").write_text('public_routes = ["/healthz"]\n')
    git(tmp_path, "init", "-q", "-b", "main")
    git(tmp_path, "add", ".")
    git(tmp_path, "commit", "-q", "-m", "base")
    return tmp_path


def test_a_shrinking_baseline_passes_and_a_growing_one_fails(
    repo: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    baseline = repo / "quality" / "arch-baseline.toml"
    baseline.write_text("[ignore_imports]\n")
    assert baseline_shrinks.main(["--base", "main"], cwd=repo) == 0

    baseline.write_text('[ignore_imports]\n"orders-door" = ["a -> b", "c -> d"]\n')
    assert baseline_shrinks.main(["--base", "main"], cwd=repo) == 1
    assert "baseline line added: orders-door: c -> d" in capsys.readouterr().err


def test_an_unparseable_baseline_fails_closed(repo: Path) -> None:
    (repo / "quality" / "arch-baseline.toml").write_text("not = [toml\n")

    assert baseline_shrinks.main(["--base", "main"], cwd=repo) == 2


def test_an_unlogged_loosening_fails_and_a_logged_one_passes(
    repo: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    (repo / "architecture.toml").write_text('public_routes = ["/healthz", "/status"]\n')
    assert policy_changes.main(["--base", "main"], cwd=repo) == 1
    assert "public route added: /status (NOT LOGGED)" in capsys.readouterr().err

    (repo / "quality" / "policy-log.toml").write_text(
        '[[entry]]\nchange = "public route added: /status"\nreason = "probe"\ndate = 2026-01-31\n'
    )
    assert policy_changes.main(["--base", "main"], cwd=repo) == 0
