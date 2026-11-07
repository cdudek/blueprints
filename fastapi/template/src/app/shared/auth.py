"""Who is calling. Plain data: services take a `Principal`; the HTTP edge builds it."""

from pydantic import BaseModel


class Principal(BaseModel, frozen=True):
    subject: str
