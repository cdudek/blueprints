"""Settings: the only reader of the environment and of mounted secret files."""

from functools import cache
from pathlib import Path
from typing import Literal

from pydantic import SecretStr
from pydantic_settings import BaseSettings, PydanticBaseSettingsSource, SettingsConfigDict


class Settings(BaseSettings):
    """Field names carry no prefix: `database_url` reads `DATABASE_URL`."""

    model_config = SettingsConfigDict(secrets_dir="/run/secrets", extra="forbid")

    app_env: Literal["development", "test", "production"] = "development"
    database_url: str = "postgresql+psycopg://app:app@localhost:5432/app"

    payments_provider: Literal["real", "fixture", "noop"] = "fixture"
    payments_base_url: str = "https://payments.example.com"
    payments_api_key: SecretStr | None = None

    @classmethod
    def settings_customise_sources(
        cls,
        settings_cls: type[BaseSettings],
        init_settings: PydanticBaseSettingsSource,
        env_settings: PydanticBaseSettingsSource,
        dotenv_settings: PydanticBaseSettingsSource,
        file_secret_settings: PydanticBaseSettingsSource,
    ) -> tuple[PydanticBaseSettingsSource, ...]:
        # Mounted secret files win over env vars (pydantic-settings defaults to the reverse).
        # No dotenv source at all. Outside a container nothing is mounted, so the file source
        # is left out instead of warning that the directory is missing.
        secrets_dir = getattr(file_secret_settings, "secrets_dir", None)
        if secrets_dir is None or not Path(secrets_dir).is_dir():
            return (init_settings, env_settings)
        return (init_settings, file_secret_settings, env_settings)


@cache
def get_settings() -> Settings:
    return Settings()
