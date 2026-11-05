import "server-only";
import { cookies } from "next/headers";
import { getEnv } from "./env";

export type Role = "customer" | "admin";
export type SessionUser = { id: string; role: Role };
export type Session = { user: SessionUser };

export class UnauthenticatedError extends Error {
  constructor() {
    super("not signed in");
  }
}

// STUB: reads a cookie so the example runs. Replace with your real session library
// (Auth.js, Clerk, your own) before production; this refuses to run there.
export async function getSession(): Promise<Session | null> {
  if (getEnv().NODE_ENV === "production") {
    throw new Error("shared/auth.ts is a stub: wire a real session before production");
  }
  const jar = await cookies();
  const id = jar.get("stub-user")?.value;
  if (!id) return null;
  return { user: { id, role: jar.get("stub-role")?.value === "admin" ? "admin" : "customer" } };
}

export async function requireUser(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) throw new UnauthenticatedError();
  return session.user;
}

export async function requireRole(role: Role): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== role) throw new Error(`requires role ${role}`);
  return user;
}
