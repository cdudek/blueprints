"""The architecture rules import-linter cannot express: AST and reflection checks.

Each rule returns its findings as `location: message` strings; an empty list means kept. AST rules
take a root directory that contains the `app/` package (`src/` for the template, a fixture
directory for the deliberate-violation tests).
"""

import ast
import importlib
import inspect
import pkgutil
import re
from collections.abc import Iterable, Iterator, Mapping
from pathlib import Path

from fastapi import FastAPI
from fastapi.dependencies.models import Dependant
from fastapi.routing import APIRoute
from pydantic import BaseModel
from sqlalchemy.orm import DeclarativeBase
from starlette.routing import BaseRoute

from app.shared.access import access_of
from app.shared.errors import DomainError

TX_CONTROL = {"commit", "rollback", "begin"}
RULES_BANNED_IMPORTS = {"os", "random", "time"}
RULES_BANNED_CALLS = {"now", "utcnow", "today", "uuid1", "uuid4", "open"}


def _files(root: Path) -> Iterator[tuple[str, ast.Module]]:
    for path in sorted((root / "app").rglob("*.py")):
        rel = path.relative_to(root).as_posix()
        yield rel, ast.parse(path.read_text(encoding="utf-8"), filename=rel)


def _root_name(node: ast.expr) -> str | None:
    """`a` for `a`, `a.b.c` and `a.b().c`."""
    while isinstance(node, ast.Attribute | ast.Call):
        node = node.value if isinstance(node, ast.Attribute) else node.func
    return node.id if isinstance(node, ast.Name) else None


def _called(node: ast.Call) -> str | None:
    func = node.func
    if isinstance(func, ast.Attribute):
        return func.attr
    return func.id if isinstance(func, ast.Name) else None


def _is_entry_point(rel: str) -> bool:
    return rel.startswith(("app/api/", "app/workflows/")) or rel.endswith(
        ("/router.py", "/jobs.py")
    )


def transaction_owner(root: Path) -> list[str]:
    findings = []
    for rel, tree in _files(root):
        if rel.startswith("app/db/"):
            continue
        for node in ast.walk(tree):
            if not isinstance(node, ast.Call):
                continue
            name = _called(node)
            if isinstance(node.func, ast.Attribute) and name in TX_CONTROL:
                findings.append(
                    f"{rel}:{node.lineno}: .{name}() outside app/db: "
                    "the entry point's in_transaction() commits and rolls back"
                )
            elif name == "in_transaction" and not _is_entry_point(rel):
                findings.append(
                    f"{rel}:{node.lineno}: in_transaction() outside an entry point "
                    "(app/api, router.py, app/workflows, jobs.py): take `tx` as an argument"
                )
    return findings


def sessions_in_db(root: Path) -> list[str]:
    findings = []
    for rel, tree in _files(root):
        if rel.startswith("app/db/"):
            continue
        for node in ast.walk(tree):
            if isinstance(node, ast.ImportFrom):
                names = [node.module or ""]
            elif isinstance(node, ast.Import):
                names = [alias.name for alias in node.names]
            else:
                continue
            if any(name.startswith("sqlalchemy.ext.asyncio") for name in names):
                findings.append(
                    f"{rel}:{node.lineno}: sqlalchemy.ext.asyncio imported outside app/db: "
                    "engines and sessions are built only in app/db"
                )
    return findings


def _client_names(tree: ast.Module) -> set[str]:
    names = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and (node.module or "").startswith(
            ("app.clients", "httpx")
        ):
            names |= {alias.asname or alias.name for alias in node.names}
        elif isinstance(node, ast.Import):
            names |= {
                alias.asname or alias.name.split(".")[0]
                for alias in node.names
                if alias.name.startswith(("app.clients", "httpx"))
            }
    return names


def _mentions(node: ast.expr | None, names: set[str]) -> bool:
    return node is not None and any(
        isinstance(n, ast.Name) and n.id in names for n in ast.walk(node)
    )


def external_call_in_transaction(root: Path) -> list[str]:
    """Calls to names imported from app.clients or httpx, or to parameters annotated with such
    a name, inside an `async with in_transaction()` body. Helpers are not followed."""
    findings = []
    for rel, tree in _files(root):
        imported = _client_names(tree)
        if not imported:
            continue
        for func in ast.walk(tree):
            if not isinstance(func, ast.FunctionDef | ast.AsyncFunctionDef):
                continue
            args = [*func.args.posonlyargs, *func.args.args, *func.args.kwonlyargs]
            external = imported | {a.arg for a in args if _mentions(a.annotation, imported)}
            for block in ast.walk(func):
                if not isinstance(block, ast.AsyncWith) or not any(
                    isinstance(item.context_expr, ast.Call)
                    and _called(item.context_expr) == "in_transaction"
                    for item in block.items
                ):
                    continue
                for stmt in block.body:
                    for call in ast.walk(stmt):
                        if isinstance(call, ast.Call) and _root_name(call.func) in external:
                            findings.append(
                                f"{rel}:{call.lineno}: {_root_name(call.func)} called inside "
                                "in_transaction(): call external services between transactions"
                            )
    return findings


def pure_rules(root: Path) -> list[str]:
    findings = []
    for rel, tree in _files(root):
        if not (rel.startswith("app/modules/") and rel.endswith("/rules.py")):
            continue
        for node in ast.walk(tree):
            if not isinstance(node, ast.Import | ast.ImportFrom | ast.Call):
                continue
            found = None
            if isinstance(node, ast.Import):
                found = next(
                    (a.name for a in node.names if a.name.split(".")[0] in RULES_BANNED_IMPORTS),
                    None,
                )
            elif isinstance(node, ast.ImportFrom) and node.module in RULES_BANNED_IMPORTS:
                found = node.module
            elif isinstance(node, ast.Call) and _called(node) in RULES_BANNED_CALLS:
                found = f"{_called(node)}()"
            if found:
                findings.append(
                    f"{rel}:{node.lineno}: rules.py must be pure: {found} (pass the value in)"
                )
    return findings


def door_shape(root: Path) -> list[str]:
    findings = []
    for rel, tree in _files(root):
        parts = rel.split("/")
        if rel == "app/modules/__init__.py" and tree.body:
            findings.append(f"{rel}:1: app/modules/__init__.py stays empty")
        if len(parts) == 4 and parts[1] == "modules" and parts[3] == "__init__.py":
            findings += _door_findings(rel, tree, own=f"app.modules.{parts[2]}.")
    return findings


def _door_findings(rel: str, tree: ast.Module, own: str) -> list[str]:
    findings = []
    for i, stmt in enumerate(tree.body):
        if i == 0 and isinstance(stmt, ast.Expr) and isinstance(stmt.value, ast.Constant):
            continue  # the docstring
        if isinstance(stmt, ast.ImportFrom):
            if not (stmt.module or "").startswith(own):
                findings.append(f"{rel}:{stmt.lineno}: a door re-exports only its own module")
            for alias in stmt.names:
                if alias.name == "*":
                    findings.append(f"{rel}:{stmt.lineno}: no star imports in a door")
                elif alias.asname:
                    findings.append(f"{rel}:{stmt.lineno}: no aliased imports in a door")
        elif not (
            isinstance(stmt, ast.Assign)
            and [getattr(t, "id", None) for t in stmt.targets] == ["__all__"]
        ):
            findings.append(
                f"{rel}:{stmt.lineno}: a door holds only imports and __all__, "
                f"not {type(stmt).__name__}"
            )
    return findings


def door_exports(modules_package: str) -> list[str]:
    """Reflection over every module door: operations, schemas and errors only."""
    findings = []
    package = importlib.import_module(modules_package)
    for info in pkgutil.iter_modules(package.__path__):
        door = importlib.import_module(f"{modules_package}.{info.name}")
        for name in getattr(door, "__all__", []):
            obj = getattr(door, name)
            where = f"{door.__name__}.{name}"
            if inspect.isfunction(obj):
                if access_of(obj) is None:
                    findings.append(f"{where}: an exported function must carry @operation")
            elif inspect.isclass(obj):
                schema = issubclass(obj, BaseModel) and obj.__module__ == f"{door.__name__}.schemas"
                error = issubclass(obj, DomainError) and obj.__module__ == f"{door.__name__}.errors"
                if not (schema or error):
                    findings.append(
                        f"{where}: an exported class must be a BaseModel from schemas.py "
                        "or a DomainError from errors.py"
                    )
            else:
                findings.append(f"{where}: a door exports only operations, schemas and errors")
    return findings


def _owner_of(module: str) -> str:
    parts = module.split(".")
    if len(parts) >= 3 and parts[-3] == "modules" and parts[-1] == "models":
        return parts[-2]
    return module


def table_owners(base: type[DeclarativeBase], owners: Mapping[str, str]) -> list[str]:
    """Every table has one declared owner and is defined only in that module's models.py.
    A plain `Table` with no mapped class belongs to infrastructure (`db`)."""
    defined_by: dict[str, set[str]] = {}
    for mapper in base.registry.mappers:
        for mapped in mapper.tables:
            defined_by.setdefault(mapped.name, set()).add(_owner_of(mapper.class_.__module__))
    findings = []
    for table in sorted(base.metadata.tables):
        declared = owners.get(table)
        found = defined_by.get(table, {"db"})
        if declared is None:
            findings.append(f"table {table}: no declared owner")
        elif found != {declared}:
            findings.append(
                f"table {table}: owned by {declared} but defined by {', '.join(sorted(found))}"
            )
    undefined = sorted(set(owners) - set(base.metadata.tables))
    return findings + [f"table {t}: declared but not defined" for t in undefined]


def _dependencies(dependant: Dependant) -> Iterable[Dependant]:
    for dep in dependant.dependencies:
        yield dep
        yield from _dependencies(dep)


def _api_routes(routes: Iterable[BaseRoute]) -> Iterator[APIRoute]:
    for route in routes:
        if isinstance(route, APIRoute):
            yield route
        # FastAPI 0.16x mounts an included router lazily; its routes stay on `original_router`.
        elif (router := getattr(route, "original_router", None)) is not None:
            yield from _api_routes(router.routes)


def routes_authenticated(app: FastAPI, public: set[str]) -> list[str]:
    findings = []
    paths = set()
    for route in _api_routes(app.routes):
        paths.add(route.path)
        if route.path in public:
            continue
        names = {getattr(d.call, "__name__", "") for d in _dependencies(route.dependant)}
        if not any(name.startswith("require_") for name in names):
            findings.append(
                f"{','.join(sorted(route.methods or ()))} {route.path}: no require_* dependency "
                "and not listed as public"
            )
    if not paths:
        return ["no API routes found: the rule would pass vacuously"]
    findings += [f"public route {p}: does not exist" for p in sorted(public - paths)]
    return findings


DESTRUCTIVE_OPS = {"drop_table", "drop_column", "drop_index", "drop_constraint", "rename_table"}
TIGHTENING_KWARGS = {"new_column_name": "rename a column", "type_": "change a column type"}
RAW_SQL = {"execute", "exec_driver_sql"}
REVIEWED = re.compile(r"#\s*reviewed:\s*\S")


def _module_string(tree: ast.Module, name: str) -> str | None:
    for stmt in tree.body:
        value: ast.expr | None
        if isinstance(stmt, ast.Assign):
            targets, value = stmt.targets, stmt.value
        elif isinstance(stmt, ast.AnnAssign):
            targets, value = [stmt.target], stmt.value
        else:
            continue
        if any(getattr(t, "id", None) == name for t in targets) and isinstance(value, ast.Constant):
            return str(value.value)
    return None


def _expand_violation(call: ast.Call) -> str | None:
    name = _called(call)
    if name in DESTRUCTIVE_OPS:
        return f"call op.{name}()"
    if name == "alter_column":
        for kw in call.keywords:
            if kw.arg in TIGHTENING_KWARGS:
                return TIGHTENING_KWARGS[kw.arg]
            if kw.arg == "nullable" and isinstance(kw.value, ast.Constant) and not kw.value.value:
                return "tighten a column to NOT NULL"
    return None


def migration_phases(versions: Path) -> list[str]:
    """Expand migrations are additive; raw SQL is marked `# reviewed: <reason>`."""
    findings = []
    for path in sorted(versions.glob("*.py")):
        name = path.name
        source = path.read_text(encoding="utf-8")
        lines = source.splitlines()
        tree = ast.parse(source, filename=name)
        phase = _module_string(tree, "PHASE")
        if phase not in {"expand", "contract"}:
            findings.append(f'{name}:1: set PHASE = "expand" or "contract"')
        if phase == "contract" and not _module_string(tree, "LAST_USE_REMOVED_IN"):
            findings.append(
                f"{name}:1: a contract migration names the release that removed the last use "
                "(LAST_USE_REMOVED_IN)"
            )
        for func in tree.body:
            if not isinstance(func, ast.FunctionDef) or func.name == "downgrade":
                continue
            for call in ast.walk(func):
                if not isinstance(call, ast.Call):
                    continue
                problem = _expand_violation(call) if phase == "expand" else None
                if problem:
                    findings.append(
                        f"{name}:{call.lineno}: an expand migration may not {problem}; "
                        "move it to a contract migration"
                    )
                marked = any(REVIEWED.search(lines[i]) for i in (call.lineno - 2, call.lineno - 1))
                if _called(call) in RAW_SQL and not marked:
                    findings.append(
                        f"{name}:{call.lineno}: raw SQL needs a `# reviewed: <reason>` comment "
                        "on the line above"
                    )
    return findings
