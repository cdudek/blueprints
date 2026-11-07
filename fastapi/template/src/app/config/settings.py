"""Settings: the only reader of the environment and of mounted secret files."""

from functools import cache
from pathlib import Path
from typing import Literal, Self, get_args

from pydantic import SecretStr, model_validator
from pydantic_settings import BaseSettings, PydanticBaseSettingsSource, SettingsConfigDict


class Settings(BaseSettings):
    """Field names carry no prefix: `payments_api_key` reads `PAYMENTS_API_KEY`.

    Every secret is a `SecretStr` and is declared in secrets.manifest.json (a test keeps the two
    equal). `.get_secret_value()` is called only inside the client that uses the value.
    """

    model_config = SettingsConfigDict(secrets_dir="/run/secrets", extra="forbid")

    app_env: Literal["development", "test", "production"] = "development"
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"
    otel_exporter_otlp_endpoint: str | None = None  # tracing is off when unset
    # Production connects through the Cloud SQL Auth Proxy with IAM login: no password in the URL.
    database_url: str = "postgresql+psycopg://app:app@localhost:5432/app"

    payments_provider: Literal["real", "fixture", "noop"] = "fixture"
    payments_base_url: str = "https://payments.example.com"
    payments_api_key: SecretStr | None = None

    @classmethod
    def secret_fields(cls) -> list[str]:
        return [
            name
            for name, field in cls.model_fields.items()
            if field.annotation is SecretStr or SecretStr in get_args(field.annotation)
        ]

    @model_validator(mode="after")
    def _real_providers_in_production(self) -> Self:
        # Fail closed: production never runs on fixture or noop providers. A missing secret
        # fails where it is read (the provider factory, built at worker startup).
        if self.app_env == "production" and self.payments_provider != "real":
            raise ValueError("production uses the real payments provider, not fixture or noop")
        return self

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
