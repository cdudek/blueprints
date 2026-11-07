from pathlib import Path

from scripts.arch.review_items import items


def test_lists_raw_sql_in_code_and_marked_raw_sql_in_migrations(tmp_path: Path) -> None:
    (tmp_path / "src" / "app").mkdir(parents=True)
    (tmp_path / "src" / "app" / "report.py").write_text(
        "from sqlalchemy import text\n\nQUERY = text('SELECT 1')\n"
    )
    versions = tmp_path / "alembic" / "versions"
    versions.mkdir(parents=True)
    (versions / "0001.py").write_text(
        "def upgrade():\n    # reviewed: backfill\n    op.execute('UPDATE t SET x = 1')\n"
    )

    assert items(tmp_path) == [
        "raw SQL in code: src/app/report.py:3",
        "raw SQL in migration: alembic/versions/0001.py:3: backfill",
    ]
