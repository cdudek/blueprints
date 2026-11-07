// Liveness: the process serves requests. Readiness (the database answers) is a separate route
// that calls a module operation; see ARCHITECTURE.md section 12.
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ status: "ok" });
}
