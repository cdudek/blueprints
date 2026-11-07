from pathlib import Path

import pytest

from app.config.settings import Settings


def test_mounted_secret_file_wins_over_env_var(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    (tmp_path / "database_url").write_text("postgresql+psycopg://from-file/app")
    monkeypatch.setenv("DATABASE_URL", "postgresql+psycopg://from-env/app")

    settings = Settings(_secrets_dir=tmp_path)

    assert settings.database_url == "postgresql+psycopg://from-file/app"


def test_env_var_applies_when_no_file_is_mounted(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql+psycopg://from-env/app")

    assert Settings(_secrets_dir=tmp_path).database_url == "postgresql+psycopg://from-env/app"


def test_missing_secrets_dir_is_skipped_without_a_warning(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("APP_ENV", "test")

    assert Settings(_secrets_dir="/nonexistent/secrets").app_env == "test"


def test_unknown_init_field_is_refused() -> None:
    with pytest.raises(ValueError, match="Extra inputs are not permitted"):
        Settings.model_validate({"not_a_setting": "x"})
