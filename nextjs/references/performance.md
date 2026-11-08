---
name: nextjs-performance
description: Lighthouse and browser bundle budgets, server rendering and measured Next.js caching
read-when: adding a page or browser dependency, changing loading or caching, or a performance gate fails
skip-when: changing server internals with no effect on page delivery or browser output
---

# Performance

Apply [core architecture](../../core/references/architecture.md), especially ARCH-9 and ARCH-10. The budgets live in `architecture.yaml`; this reference adds how Next.js code is measured and where browser cost enters.

## Rules

- **NEXT-PERF-1 Measure explicit routes on production output.** Run Lighthouse CI against the PR preview or a locally served production build, never the dev server. List representative public and signed-in routes, device profile and deterministic test state in the policy. Carry core's Lighthouse thresholds unchanged; do not silently skip authentication because it is harder to measure.
- **NEXT-PERF-2 Budget the browser output users load.** Register gzip budgets per selected browser entry or route group using size-limit or an equivalent build-output tool. Account for shared chunks and route chunks so moving an import does not hide its cost. Record actual values and thresholds in the fitness report; the Next.js build log is useful evidence, not itself a budget gate. A budget change needs core's documented reason.
- **NEXT-PERF-3 Keep server work on the server.** Start independent authorized reads together, stream independent slow regions through Suspense, and avoid fetching the app's own API from Server Components. Keep interactive islands small; load expensive editors, charts or vendor widgets only where they are used. Import primitives by file so a barrel does not pull the whole library into the client graph.
- **NEXT-PERF-4 Use framework asset delivery deliberately.** Use `next/image` with dimensions or a stable aspect ratio, accurate responsive sizes and a narrow remote-source allowlist. Follow the installed release's API for prioritizing the actual largest image, not every image. Use `next/font` for controlled font loading, with the minimum needed families and weights. Reserve space for embeds and async content.
- **NEXT-PERF-5 Cache only an understood scope.** Document whether a read is request-local, shared public data or private user data. Cache public work with keys and invalidation matching its ownership; never let a shared cache reuse a session or private response. Revalidate after successful commits. Multiple instances need the cache coordination in [release and deploy](release-and-deploy.md). Measure before introducing another cache or global state library.

## How to apply

Measure the first real routes and set explicit budgets in `architecture.yaml`. Add the `perf.web` and `perf.bundle` rows to core's fitness target, with deliberate exceeded-budget fixtures. Keep the test data and runner profile stable enough for comparisons to mean something.

Changing later: inspect a production bundle analysis and Lighthouse trace when a budget fails, then fix the expensive import, waterfall, asset or layout shift. A raised threshold records the product tradeoff, not just the new number.

## Checks

- Automatic: Lighthouse thresholds and gzip budgets pass for listed routes; reports reach the required summary; over-budget fixtures fail.
- Automatic: private data never crosses users through a cache; mutations invalidate the intended public or owner-specific views.
- Review: representative test routes, performance on real devices and networks, streaming usefulness and image quality.

## Mistakes to avoid

- A server dependency re-exported through a client constant file.
- Measuring an empty page while the real journey loads a large browser widget.
- A cache added to hide a slow query before the query and invalidation path are understood.
