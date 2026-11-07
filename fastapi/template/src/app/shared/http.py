"""`Annotated` aliases for route signatures. `Depends` is used here and in routers only."""

from typing import Annotated

from fastapi import Depends

from app.shared.auth import Principal, require_user

CurrentUser = Annotated[Principal, Depends(require_user)]
