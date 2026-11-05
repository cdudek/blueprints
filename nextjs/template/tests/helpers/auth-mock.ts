// Stands in for @/shared/auth in service tests. Pick the signed-in user with signInAs().
import type { SessionUser } from "@/shared/auth";

class UnauthenticatedError extends Error {
  constructor() {
    super("not signed in");
  }
}

let current: SessionUser | null = null;

export function signInAs(id: string | null, role: SessionUser["role"] = "customer") {
  current = id ? { id, role } : null;
}

export const authMock = {
  UnauthenticatedError,
  getSession: async () => (current ? { user: current } : null),
  requireUser: async () => {
    if (!current) throw new UnauthenticatedError();
    return current;
  },
  requireRole: async (role: SessionUser["role"]) => {
    if (!current || current.role !== role) throw new Error(`requires role ${role}`);
    return current;
  },
};
