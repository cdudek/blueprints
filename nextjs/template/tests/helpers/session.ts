// A session for service and route tests: user operations take it as their first argument.
import type { Role, Session } from "@/shared/auth";

export const sessionOf = (id: string, role: Role = "customer"): Session => ({ user: { id, role } });
