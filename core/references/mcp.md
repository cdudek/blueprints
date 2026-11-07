---
name: mcp
description: How a product exposes itself to AI clients through an MCP server inside the same TypeScript app, including routes, OAuth, tool design, limits and tests.
read-when: Adding an MCP server or a tool, changing its auth, landing page or transport, or reviewing what an AI client can do with the product.
skip-when: The product has no MCP surface and none is planned.
---

# MCP

MCP is one more delivery layer of the product, next to routes, actions, webhooks and jobs. It lives in the same TypeScript app, uses the official MCP SDK, and calls the same module doors ([structure](structure.md)). A tool is a thin adapter: it checks permission, calls a module, shapes the result for a model. It holds no business logic.

## Rules

### Layout

- **MCP-1. Fixed folder layout, one file per tool.**

```
src/mcp/
  server.ts        builds a fresh McpServer for one request, scoped to the caller
  wrap-tool.ts     permission check, audit, rate limit, error mapping, truncation
  registry.ts      the list of tools; the only place tools are added
  tools/
    list-invoices.ts   one file: name, description, input/output schema, handler
src/app/mcp/route.ts   thin route: auth, Origin check, hand off to the transport
```

- **MCP-2. Tools call module doors only.** Never a repository, never another module's internals. The tool input is parsed once at the edge (STR-9); auth, business-rule validation and domain rules stay in the module.

### Routes and transport

- **MCP-3. Only `/mcp` carries the protocol.** Streamable HTTP, stateless, JSON responses by default, a fresh server per request scoped to the caller. Health stays at `/healthz` and `/readyz`, separate and unauthenticated. Machine routes (`/mcp`, `/oauth`, `/.well-known`, health) sit outside locale routing and outside page middleware.
- **MCP-4. GET negotiates on `Accept`.** `text/html` returns the landing page. `text/event-stream` returns the stream, or 405 when the server is stateless JSON. Anything else gets 405. A browser never gets a stream and a client never gets HTML. DELETE is 405 when stateless. Do not route a plain GET through the SDK transport: it caused unhandled stream-teardown errors on every probe.
- **MCP-5. Validate `Origin`.** Reject browser requests whose Origin is not on the allowlist. Requests without an Origin (native clients) pass to auth.
- **MCP-6. Long work is a job plus a status tool.** A tool that takes longer than a few seconds starts a job and returns an id; a second tool returns status and result. No streaming progress needed by default.

### Landing page

- **MCP-7. The landing page tells a person what this is.** It shows: what the server does in two sentences, the tool list generated from the registry (never hand-written), the URL with a copy button, install steps per client (Claude, ChatGPT, Cursor, others the owner uses), who has access and how to get it, and a link to sign in. Follows [design](design.md) and [copy](copy.md); the page is text for humans, in the product's locales, while model-facing text stays English.

### OAuth

- **MCP-8. OAuth follows the MCP authorization spec.** An unauthenticated call returns 401 with `WWW-Authenticate` pointing to `/.well-known/oauth-protected-resource`. That document names the authorization server; its metadata lists endpoints. Use PKCE (S256 only), dynamic client registration, refresh tokens and revocation. Details of login (Better Auth, methods) are in [auth](auth.md).
- **MCP-9. Tokens are audience-bound.** The access token names this server's `/mcp` URL as audience and the issuer; verify both on every call. Never pass a client's token to an upstream service and never accept an upstream token (no token passthrough). Upstream credentials stay server-side.
- **MCP-10. Permissions are per user.** A tool the caller may not use is not listed, and the permission is checked again at call time. A denial explains in plain words what is missing and how to ask for access, so the model can tell the user.
- **MCP-11. Success and error pages exist.** After the OAuth callback the user sees a success page that returns them to the client. It forwards only to a redirect URI registered by a client (absolute http(s) or a custom scheme, no angle brackets). If the target is not valid it shows a neutral "granted, but nothing went back" state, not a green check. Failures show a plain message and a reference id ([observability](observability.md)). Redirect URIs at registration must be https, loopback http, or a custom scheme.

### Tool design

- **MCP-12. Few tools, shaped around tasks.** Prefer 5 to 15 tools that match what a person wants done over one tool per API endpoint. Names are `verb_object` in snake_case (`list_invoices`, `create_draft`).
- **MCP-13. Write for the model.** Each tool description says what it does, when to use it and when not to, and what it returns. Every input field has a description with an example. Descriptions are English and are not translated.
- **MCP-14. Annotate every tool.** `readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint` set truthfully. Read tools and write tools are separate tools. A destructive tool requires an explicit confirmation field or a two-step call (preview, then confirm).
- **MCP-15. Structured output.** Return `structuredContent` with an `outputSchema`, plus a short text rendering. Lists paginate with a cursor and say how many items remain. Large results are truncated at a stated size with a trailer that tells the model how to narrow the query.
- **MCP-16. Errors are tool results.** Anything the model can act on (not found, invalid input, denied, upstream down) returns `isError: true` with a clear message and a next step. Protocol errors are for protocol faults only.
- **MCP-17. Untrusted content is data.** Text from outside (email bodies, transcripts, web pages, user-written notes) is wrapped in a labelled block and described as untrusted in the tool description, so instructions inside it are not followed. A tool that reads untrusted content and a tool that writes should not be offered in one flow without confirmation.

### Operation

- **MCP-18. Per-user rate limits shared across replicas.** Keep counters in Postgres or the shared store, never in process memory, or the limit multiplies with the replica count.
- **MCP-19. Audit every call.** Log or store tool name, user id, outcome, duration, request id, and argument shapes without PII or free text. Denials are audited too. Log the tool-call outcome, because HTTP 200 hides a failed call.
- **MCP-20. `initialize` returns identity and instructions.** Server name, version (from the build), title, an absolute icon URL and short `instructions` for the model: who the users are, how to talk about access, which tools to prefer.
- **MCP-21. Tool names and schemas are a public contract.** Renaming or removing a tool, or changing a field's meaning, is a breaking change under [compatibility](compatibility.md). Add new tools or optional fields instead.

## How to apply

1. Confirm the product needs an MCP surface and who uses it (PRODUCT.md). Define the first 3 to 5 tasks.
2. Create `src/mcp/` as in MCP-1. Build `wrap-tool.ts` first: permission, audit, rate limit, error mapping, truncation. Every tool goes through it.
3. Add the route: Origin check, auth, transport that answers with plain JSON and no session id. Log every error the SDK reports (resolve the error hooks from the installed version's docs) and wrap bootstrap in try/catch (see [observability](observability.md)).
4. Add the OAuth endpoints and metadata documents, then the success and error pages.
5. Add tools one file at a time, each with description, annotations, input and output schemas.
6. Generate the landing page from the registry. Test it in a browser and with a real client.
7. Add the eval set and the schema snapshot (below). Add the MCP URL to the install docs.

When changing later: new tool means new file, registry line, eval questions and an updated snapshot in the same PR.

## Checks

Automated: a snapshot test of the full tool list (names, descriptions, input and output schemas) so any change shows in the diff and is reviewed against MCP-21; a test that every tool has annotations and a `verb_object` name; GET with each `Accept` value returns the expected status; unauthenticated call returns 401 with the right header; a token with the wrong audience is rejected; a request with a foreign Origin is rejected; rate limit holds across two app instances; audit rows contain no PII.

Review: an eval set of 10 to 30 realistic questions in plain language, each with the expected tool calls and a pass condition, run against a real model when tools change. Review tool descriptions as prompts.

## Mistakes to avoid

- Uncaught SDK errors: handler throws went to the SDK's error callback, which nobody had attached, and a whole class of failures left no trace.
- Server bootstrap outside try/catch: "authorized, but connecting failed" with nothing in the logs.
- Pointing an uptime monitor at `/mcp`; monitor `/readyz` only.
- Logging an unsupported protocol version as ERROR; it is negotiation.
- A rate limit kept in memory per replica.
- A success page that forwards to any URL in the query string.
- One tool per endpoint, so the model chooses badly and wastes context.
- Returning meeting transcripts or CRM notes raw, so text inside them acts as instructions.
- Renaming a tool "to be cleaner" and breaking every saved client setup.
