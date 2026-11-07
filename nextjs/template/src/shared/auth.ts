import "server-only";

// The session type and pure checks, nothing more. Reading the session (a cookie, an auth library
// that persists to the database) lives in a module: modules/accounts in this template.
export type Role = "customer" | "admin";
export type SessionUser = { id: string; role: Role };
export type Session = { user: SessionUser };

/** @public Catch it in an error boundary to send the user to sign-in. */
export class UnauthenticatedError extends Error {
  constructor() {
    super("not signed in");
  }
}

export function requireUser(session: Session | null): SessionUser {
  if (!session) throw new UnauthenticatedError();
  return session.user;
}

/** @public For admin-only operations: call it first in the service function. */
export function requireRole(session: Session | null, role: Role): SessionUser {
  const user = requireUser(session);
  if (user.role !== role) throw new Error(`requires role ${role}`);
  return user;
}
