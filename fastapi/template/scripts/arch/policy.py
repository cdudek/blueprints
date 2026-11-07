"""The architecture policy (architecture.toml), validated. An unknown schema_version is refused."""

import tomllib
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

ROOT = Path(__file__).resolve().parents[2]
POLICY = ROOT / "architecture.toml"
SCHEMA_VERSION = 1

type Role = Literal["router", "system", "jobs"]


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class RoleDoor(_Strict):
    importers: list[str] = Field(min_length=1)
    module_may_import: bool = False


class Forbidden(_Strict):
    forbidden: list[str] = Field(min_length=1)


class Module(_Strict):
    tables: list[str] = []
    role_doors: list[Role] = []


class Policy(_Strict):
    schema_version: Literal[1]
    root_package: str
    layers: list[list[str]] = Field(min_length=2)
    composition_roots: list[str] = []
    public_routes: list[str] = []
    infrastructure_tables: list[str] = []
    role_doors: dict[Role, RoleDoor]
    rules: Forbidden
    core: Forbidden
    modules: dict[str, Module] = Field(min_length=1)

    @model_validator(mode="after")
    def _consistent(self) -> Policy:
        layered = {name for layer in self.layers for name in layer}
        for name, module in self.modules.items():
            if f"modules.{name}" not in layered:
                raise ValueError(f"module {name} is in no layer")
            for role in module.role_doors:
                if role not in self.role_doors:
                    raise ValueError(f"module {name}: role door {role} has no [role_doors.{role}]")
        tables = [t for m in self.modules.values() for t in m.tables] + self.infrastructure_tables
        if len(tables) != len(set(tables)):
            raise ValueError("a table has more than one owner")
        return self

    def table_owners(self) -> dict[str, str]:
        owners = {table: "db" for table in self.infrastructure_tables}
        for name, module in self.modules.items():
            owners |= {table: name for table in module.tables}
        return owners


def load_policy(path: Path = POLICY) -> Policy:
    data = tomllib.loads(path.read_text(encoding="utf-8"))
    if data.get("schema_version") != SCHEMA_VERSION:
        raise ValueError(
            f"{path.name}: schema_version {data.get('schema_version')!r} is not supported "
            f"(this tooling reads {SCHEMA_VERSION})"
        )
    return Policy.model_validate(data)
