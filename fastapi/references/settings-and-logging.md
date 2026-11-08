---
name: fastapi-settings-and-logging
description: Pydantic settings sources, process startup, structlog and request context
read-when: adding settings, wiring a process or changing logging and telemetry
skip-when: the change touches no configuration or observability
---

# Settings and logging

Apply core [env and secrets](../../core/references/env-and-secrets.md) and [observability](../../core/references/observability.md). `config/` is the Python environment boundary; `shared/` holds only pure config types if needed.

## Rules

- **FCFG-1 One Pydantic Settings model serves all processes.** Parse typed fields and reject invalid provider names and combinations at startup. Field names map to documented uppercase keys. Tests use explicit constructor values; application code gets settings from the composition root rather than reading the environment itself.
- **FCFG-2 Define source precedence explicitly.** Use `settings_customise_sources` with constructor overrides, mounted secret files, then environment, followed by field defaults. Omit the dotenv source. Mounted files deliberately take precedence over environment, which needs an explicit customization in [Pydantic Settings](https://docs.pydantic.dev/latest/concepts/pydantic_settings/). A missing optional mount directory is handled deliberately, not by suppressing all warnings.
- **FCFG-3 Credentials are `SecretStr` at the boundary.** Only the provider consuming a credential unwraps it. Startup refuses fixture/noop providers in deployed environments and refuses a real provider with missing credentials (CLI-8, CLI-9). Check declared secret names against secret fields and documented setting names without reading values.
- **FCFG-4 Configure structlog and standard logging together.** Both use one JSON renderer and a redaction processor before rendering. Include UTC timestamp, level, event, build identifier, request id and trace/span ids when tracing is active. Handle nested mappings and sequences; redact sensitive keys and `SecretStr` values. Never interpolate secrets into message text or exception strings: key-based redaction cannot recognize them there.
- **FCFG-5 Bind context for a bounded lifetime.** Use context variables per request or job and clear/reset them in `finally`, including error paths. Request identity is specified in [API layer](api-layer.md). Propagate persisted job correlation explicitly rather than relying on request context surviving enqueue. Configure optional OpenTelemetry before the app starts; omit probe spans and routine probe access logs.

## How to apply

```text
startup:
  settings <- validate(explicit overrides > mounted files > env > defaults)
  configure JSON logging and redaction
  create engine and required providers; fail before serving or claiming jobs
shutdown:
  close providers; dispose engine
```

New product: create `config/settings.py`, `config/logging.py` and telemetry setup only when used. Keep name-only configuration documentation and secret metadata in sync using core's workflow. For a new setting, add its type, startup validation, documentation and precedence test together.

## Checks

Automatic: source-precedence tests with synthetic values; provider/environment matrix; secret-name drift; log redaction with a planted non-secret sentinel in nested data; context isolation across concurrent requests and error paths. Ruff bans `os.environ` and `os.getenv` outside `config/`. Review: free-text and traceback redaction, third-party environment readers and whether telemetry exports personal data.
