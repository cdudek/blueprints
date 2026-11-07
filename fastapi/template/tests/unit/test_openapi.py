from scripts.openapi import SNAPSHOT, render


def test_openapi_json_matches_the_app() -> None:
    assert SNAPSHOT.read_text(encoding="utf-8") == render(), (
        "run `make openapi` and review the diff"
    )
