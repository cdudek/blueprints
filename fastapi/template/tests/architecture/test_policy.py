"""architecture.toml is the single source: .importlinter and its schema are generated from it, and
it names exactly the modules and role doors the code has."""

from scripts.arch.generate import main as generate
from scripts.arch.policy import load_policy

from tests.architecture.conftest import SRC


def test_generated_files_match_the_policy() -> None:
    assert generate(["--check"]) == 0, "run make arch-generate"


def test_the_policy_declares_every_module_and_role_door() -> None:
    policy = load_policy()
    modules = SRC / "app" / "modules"

    assert sorted(policy.modules) == sorted(p.parent.name for p in modules.glob("*/__init__.py"))
    for name, module in policy.modules.items():
        present = {p.stem for p in (modules / name).glob("*.py")} & {"router", "system", "jobs"}
        assert sorted(module.role_doors) == sorted(present), name
