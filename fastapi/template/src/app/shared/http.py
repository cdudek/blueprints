"""The HTTP edge: dependencies and `Annotated` aliases. `Depends` lives here and in routers."""

from typing import Annotated

from fastapi import Depends, Header, HTTPException, status

from app.config.settings import Settings, get_settings
from app.shared.auth import Principal


def require_user(
    settings: Annotated[Settings, Depends(get_settings)],
    x_user_id: Annotated[str | None, Header()] = None,
) -> Principal:
    # shortcut: a trusted header outside production and no identity provider at all in production
    # (fails closed). Replace the body with your provider's token verification before going live.
    if settings.app_env == "production" or not x_user_id:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "authentication required")
    return Principal(subject=x_user_id)


CurrentUser = Annotated[Principal, Depends(require_user)]
