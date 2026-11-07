---
name: observability
description: How the product logs, traces, measures and reports errors so a failure can be found from one reference id, without leaking user data.
read-when: Adding logging, error handling, an error page, a background job, a third-party SDK, a health check, an uptime monitor or an alert.
skip-when: Pure copy or styling changes that add no code path that can fail.
---

# Observability

Every failure must be findable: from the error a user sees to the log line, the request, the version and the cause. Logs are structured, one line per event, and never contain what the user typed or who they are. Logging is separate from [tracking](tracking.md): logs answer "what broke", analytics answers "what do people do".

## Rules

### Logs

- **OBS-1. Structured JSON, one line per event, on stdout.** No multi-line stack traces in the message field, no pretty printing in deployed environments. Pretty printing is allowed locally only.
- **OBS-2. Every line carries the same core fields.** Timestamp, severity, scope (module or component name), message, request id, build version and commit, outcome and duration where an operation has one. The platform collects stdout; the app never writes log files.
- **OBS-3. Errors are unpacked.** Log the error name, message, a bounded stack and the full cause chain as structured fields. A wrapped error that logs only the outer message hides the real failure.
- **OBS-4. Never log user text, credentials or PII.** No form values, prompts, message bodies, tokens, cookies, API keys, emails or names. Log ids and sizes instead. Key-based redaction is not enough: free text and stack traces leak, so do not pass them in. Credentials in a query string with request logging on are a leak; keep them in headers or bodies.
- **OBS-5. Severity means something.** ERROR is a fault a person should look at. Expected outcomes (validation failure, denied access, protocol negotiation, a user's cancelled request) are INFO or WARN. Alerts and rollout gates read severity, so wrong severity breaks them.
- **OBS-6. Logs are kept 30 days** in the EU region, then deleted. Audit logs that need longer retention are stored separately with the retention stated.

### Request ids

- **OBS-7. One request-id contract.** Accept an inbound `X-Request-Id` only if it is short and safe (a bounded length, a restricted character set). Otherwise generate one. Put it on every log line for that request, pass it to downstream calls and background jobs the request starts, and return it in the response header.
- **OBS-8. Errors show a reference id to the user.** The error page and error responses show a short reference (the request id or a derived code) next to a plain message. The user can quote it; the full detail stays in logs. Never show stack traces, provider messages or SQL. See [ux](ux.md) for the error states.

### Errors and SDKs

- **OBS-9. Map errors in one place.** Domain errors carry a stable code and map to a response in one function per delivery layer (route, action, MCP tool, job). Unknown errors become a generic response plus an ERROR log with the reference id.
- **OBS-10. SDK and framework errors are wired explicitly.** Libraries that swallow handler exceptions into a callback (MCP servers and transports with `onerror`, queue consumers, stream handlers, webhook libraries) must have that hook attached and logging. An unwired hook hides a whole class of failures.
- **OBS-11. Wrap bootstrap.** Code that builds a server, a request context or a client before the main try/catch is inside a try/catch too. A failure there must leave a log line.
- **OBS-12. Expected protocol negotiation is not an error.** An unsupported protocol version, a client probing with the wrong `Accept` header or a 401 that starts an auth flow is normal traffic. Log at INFO or WARN, never ERROR.

### Error tracking, metrics, traces

- **OBS-13. Use an error tracker** for unhandled exceptions in server and browser. It receives the same redaction rules as logs (OBS-4), the build version and commit, and the request id. Browser error beacons are bounded: cap the size before reading the body and redact before sending.
- **OBS-14. Metrics cover the RED basics per route and per client:** rate, errors, duration, plus outcome and latency for each external client call. Log-based metrics are fine to start. Empty series mean "no data", never zero.
- **OBS-15. Traces are on for requests that cross a client or a job.** Propagate the request id as a trace attribute so logs and traces join. A slow success (over a stated threshold) logs at WARN.
- **OBS-16. Background work reports itself.** Jobs log start, outcome and duration, and emit a heartbeat even when the queue is empty. Split retryable from terminal failures.

### Uptime and alerts

- **OBS-17. Uptime checks hit health endpoints only.** `/readyz` for availability, never an application route and never `/mcp` or another protocol endpoint. A probe against a protocol endpoint produces errors that are not outages.
- **OBS-18. Alert on the machinery too:** failed deploys and applies, missing heartbeats, exhausted background retries, expiring certificates. Test that alert delivery works.

## How to apply

1. Create one logger module that outputs the OBS-2 fields and enforces OBS-3 and OBS-4. Feature code imports it; nobody calls `console.log` in server code (a lint rule enforces this).
2. Add request-id middleware at the edge that implements OBS-7 and puts the id into async context so the logger picks it up.
3. Write the error mapper (OBS-9) and the error page with the reference id (OBS-8).
4. Install the error tracker and wire browser and server (OBS-13). Set the build version and commit as release metadata.
5. For every SDK that has an error hook, attach it in the same change that adds the SDK (OBS-10).
6. Add health checks and point the uptime monitor at `/readyz` ([release-and-deploy](release-and-deploy.md)).
7. Add a test that logs an error with a cause chain and asserts the output contains the chain and no seeded secret or email.

A log line, for shape:

```
{"ts":"...","level":"error","scope":"billing.invoices","msg":"invoice create failed",
 "requestId":"r_8f3a","version":"1.4.2","commit":"a1b2c3d","outcome":"error",
 "durationMs":212,"err":{"name":"ProviderError","message":"...","cause":{"name":"TimeoutError"}}}
```

When changing later: a new client, route kind or job gets its scope, outcome and duration fields in the same PR.

## Checks

Automated: lint rule against raw console output in server code; a test that seeded secrets, emails and free text never appear in log output; a test that every response carries the request-id header; a test that error responses carry a reference id and no stack; a check that every SDK error hook in the code is assigned.

Review: severity of new log lines, whether a new field could carry PII, whether a new probe targets a health endpoint.

## Mistakes to avoid

- Logging the request body "just for debugging" and shipping it.
- Dropping the cause when wrapping an error, so the log shows only "operation failed".
- Treating protocol version negotiation as ERROR: it produced hundreds of error lines per day from a handful of users and buried real faults.
- Pointing an uptime monitor at a protocol endpoint and chasing the resulting stream-teardown errors.
- An SDK whose error callback was never attached, so a whole failure class had no log line.
- Bootstrap code outside the try/catch: users saw "connection failed" and the server had no trace.
- Request ids copied from an inbound header without limits, which allows log injection.
- Sending HTTP 200 for a failed JSON-RPC or batch call and monitoring only HTTP status. Log the outcome inside.
