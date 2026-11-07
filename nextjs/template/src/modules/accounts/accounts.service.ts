import "server-only";
import { cookies } from "next/headers";
import { operation } from "@/shared/access";
import type { Session } from "@/shared/auth";
import { getEnv } from "@/shared/env";
import { err, ok } from "@/shared/result";

// STUB: reads a cookie so the example runs. Replace it with your session library (Auth.js,
// Clerk, your own) before production; it refuses to run there. An auth library that persists to
// the database keeps its tables in this module, like any other owner.
export const currentSession = operation(
  {
    access: "public",
    validation: "reads only the caller's own session cookie; nothing else is input",
    abuseControls: "none needed: it answers with the caller's own session or unauthenticated",
  },
  async () => {
    const env = getEnv();
    if (env.NODE_ENV === "production" && env.AUTH_STUB !== "e2e") {
      throw new Error("modules/accounts is a stub: wire a real session before production");
    }
    const jar = await cookies();
    const id = jar.get("stub-user")?.value;
    if (!id) return err("unauthenticated");
    const session: Session = {
      user: { id, role: jar.get("stub-role")?.value === "admin" ? "admin" : "customer" },
    };
    return ok(session);
  },
);
