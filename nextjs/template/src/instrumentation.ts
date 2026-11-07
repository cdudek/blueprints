import type { Instrumentation } from "next";

// Runs when a server instance starts, and on every unhandled request error. A root file: it
// imports no module (roots-no-modules). Start OpenTelemetry here, in an exported register(),
// when the app exports traces (for example @vercel/otel's registerOTel({ serviceName })).

/** The trace id of a W3C traceparent header: version-traceid-spanid-flags. */
const traceId = (header: string | string[] | undefined) =>
  typeof header === "string" ? header.split("-")[1] : undefined;

// One JSON line per unhandled error, with the trace id, so logs from the web process, the worker
// and a service can be joined.
export const onRequestError: Instrumentation.onRequestError = (error, request, context) => {
  const e = error instanceof Error ? error : new Error(String(error));
  console.error(
    JSON.stringify({
      level: "error",
      message: e.message,
      digest: (e as Error & { digest?: string }).digest,
      method: request.method,
      path: request.path,
      route: context.routePath,
      trace: traceId(request.headers.traceparent),
    }),
  );
};
