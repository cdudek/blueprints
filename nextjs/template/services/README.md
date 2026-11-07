# services/

Another runtime that this app needs, one folder each: `services/<name>/`. A service exists for a
runtime reason (a Python library with no TypeScript equivalent, a long-running process, a GPU),
never to split the app's structure. Module boundaries do that inside `src/`.

Each service:

- owns its folder completely: code, tests, `Dockerfile` and README;
- has its own image, built and promoted like the web image;
- publishes a **JSON Schema contract** for every request and response it serves, in
  `services/<name>/contract/`. The app calls it through a port in `src/clients/<name>/`, and the
  client's tests validate the fixture provider's payloads against that schema, so a contract
  change fails the app's tests before it fails in production;
- is called only by the module service that owns the capability, never from `app/`.

## A Python service

The shape a Python service follows (a Python blueprint will live next to the Next.js one in this
repository; until then this is the short form):

```text
services/<name>/
  pyproject.toml      single source of truth; uv manages Python, the lock file and the venv
  uv.lock
  src/                flat src layout: main.py, the domain code, its clients
  tests/              pytest
  contract/           JSON Schema per request and response
  Dockerfile          its own image
  README.md           what it does, how to run it, how the app calls it
```

Run everything through `uv run` (`uv run pytest`, `uv run ruff check .`). No Python CI job ships in
this template; add one when the first service lands, scoped to `services/<name>/**`.
