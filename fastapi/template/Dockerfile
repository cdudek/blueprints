# syntax=docker/dockerfile:1
# One image build, three targets: web, worker, migrate. Build once, promote the same digests.
# Follows uv's Docker guide: a pinned uv image, a cached dependency layer, a non-editable install
# of the project, bytecode compiled, no dev dependencies, a non-root user.

FROM ghcr.io/astral-sh/uv:0.12.2 AS uv

FROM python:3.14-slim-trixie AS build
COPY --from=uv /uv /uvx /bin/
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_NO_DEV=1 UV_PYTHON_DOWNLOADS=0
WORKDIR /app
# Dependencies first: this layer changes only with uv.lock.
RUN --mount=type=cache,target=/root/.cache/uv \
    --mount=type=bind,source=uv.lock,target=uv.lock \
    --mount=type=bind,source=pyproject.toml,target=pyproject.toml \
    uv sync --locked --no-install-project --no-editable
COPY pyproject.toml uv.lock ./
COPY src ./src
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-editable

FROM python:3.14-slim-trixie AS runtime
RUN groupadd --system app && useradd --system --gid app --no-create-home app
WORKDIR /app
COPY --from=build --chown=app:app /app/.venv /app/.venv
ENV PATH="/app/.venv/bin:$PATH" PYTHONUNBUFFERED=1
USER app

# One uvicorn process per container; scale with instances, not workers. Cloud Run's front end is
# the only client, so forwarded headers are trusted from any address.
FROM runtime AS web
EXPOSE 8080
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080", "--proxy-headers", "--forwarded-allow-ips", "*"]

# Its own service with CPU always allocated; never inside the web process.
FROM runtime AS worker
CMD ["procrastinate", "--app=app.worker.app", "worker"]

# Applies expand migrations; the deploy then checks `alembic current --check-heads`.
FROM runtime AS migrate
COPY --chown=app:app alembic.ini ./
COPY --chown=app:app alembic ./alembic
CMD ["alembic", "upgrade", "head"]
