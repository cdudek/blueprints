---
name: fastapi-api-layer
description: FastAPI dependencies, typed results, problem details, request identity and probes
read-when: adding a route, changing HTTP contracts, authentication dependencies, errors or health checks
skip-when: the change touches no HTTP delivery
---

# API layer

Core [structure](../../core/references/structure.md) STR-6 to STR-17 owns access and thin delivery; [auth](../../core/references/auth.md), [security](../../core/references/security.md) and [compatibility](../../core/references/compatibility.md) own the public contract. FastAPI translates that contract to HTTP.

## Rules

- **FHTTP-1 `APIRouter` and `Depends` stay at the edge.** Use typed Pydantic request models, forbid unexpected fields where the input contract calls for it and return explicit response models. Auth dependencies produce a principal; operations still enforce resource permissions. A router calls one operation or workflow, maps its result and never opens a transaction. Verified webhook dependencies validate the original body before parsing it.
- **FHTTP-2 Translate closed error results to problem details once.** Map STR-8 result kinds to statuses in `api/errors.py` and emit `application/problem+json` with stable `type`, `title`, `status`, safe `detail` and a request reference. Handle FastAPI request-validation and HTTP exceptions in the same format. Unexpected exceptions get a generic 500 and a redacted server-side diagnostic, never their raw exception text. Include error responses in OpenAPI. Follow [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457.html).
- **FHTTP-3 Validate incoming request ids before using them.** Accept `X-Request-ID` only as a full match of a bounded alphabet, for example 1 to 64 ASCII letters, digits, dots, underscores or hyphens. Generate a new id otherwise. Bind it for logging and return it on success and error responses, including unhandled failures. Middleware ordering must cover the server error handler. An id is correlation, never authentication.
- **FHTTP-4 `/healthz` checks only the process; `/readyz` checks ability to serve.** Readiness uses a bounded database ping and the schema requirements of this build, returning 503 when either fails. A newer additive migration leaves old builds ready (DAT-22). Delegate database work to the `db/` readiness gateway; keep the route thin. Probes are explicitly public and expose no credentials or connection details.
- **FHTTP-5 Async handlers use async I/O.** Use async SQLAlchemy and HTTPX for network work. A synchronous helper called from `async def` is not automatically put in a thread pool; offload blocking calls explicitly, and put substantial CPU work in a worker. Check [FastAPI concurrency guidance](https://fastapi.tiangolo.com/async/) when choosing the boundary.

## How to apply

```text
request -> request-id context -> parse + auth dependency
        -> operation(principal, typed input)
        -> success DTO | closed error -> problem details
unexpected exception -> redacted diagnostic + generic problem + request id
```

Create the application with lifespan-managed resources, install middleware and handlers before serving, then mount only declared routers. Snapshot the generated OpenAPI document in the product and test drift. When changing a route, compare the published shape and defaults, not just the function signature.

## Checks

Automatic: HTTPX ASGI tests with lifespan explicitly managed; validation, forbidden and missing-resource problems; generic 500 behavior; request ids on every response and isolated log contexts. Inspect the mounted app's routes for a declared auth dependency or exact public-route exception, failing if discovery finds no routes. Test resource authorization separately. Readiness tests cover unavailable DB, missing requirement, compatible expansion and both old/new builds. Review: indirect dependencies, proxy trust, abuse controls and whether error detail reveals another user's data.
