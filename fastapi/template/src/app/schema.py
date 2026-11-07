"""The full schema for Alembic: every module's models, composed in one declared root."""

from app.db.base import Base
from app.db.schema_history import schema_history
from app.modules.orders import models as orders_models

metadata = Base.metadata

__all__ = ["metadata", "orders_models", "schema_history"]
