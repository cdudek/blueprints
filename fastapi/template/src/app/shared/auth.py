"""Who is calling. `require_user` is the dependency every user route depends on."""

from typing import Annotated

from fastapi import Depends, Header, HTTPException, status
from pydantic import BaseModel

from app.config.settings import Settings, get_settings


class Principal(BaseModel, frozen=True):
    subject: str


def require_user(
    settings: Annotated[Settings, Depends(get_settings)],
    x_user_id: Annotated[str | None, Header()] = None,
) -> Principal:
    # shortcut: a trusted header outside production and no identity provider at all in production
    # (fails closed). Replace the body with your provider's token verification before going live.
    if settings.app_env == "production" or not x_user_id:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "authentication required")
    return Principal(subject=x_user_id)
