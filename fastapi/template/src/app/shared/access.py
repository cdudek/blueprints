"""`@operation` marks a function as an operation a door may export, with its access policy.

`user` operations take the caller's `Principal` and check the resource themselves; `system`
operations are called only by `system.py` doors, jobs and workflows, never by a user route.
"""

from collections.abc import Callable
from typing import Literal

type Access = Literal["user", "system"]

_ACCESS: dict[object, Access] = {}


def operation[F: Callable[..., object]](*, access: Access) -> Callable[[F], F]:
    def mark(fn: F) -> F:
        _ACCESS[fn] = access
        return fn

    return mark


def access_of(fn: object) -> Access | None:
    return _ACCESS.get(fn)
