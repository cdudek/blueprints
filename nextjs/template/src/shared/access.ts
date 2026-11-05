import "server-only";
import { requireUser, UnauthenticatedError, type SessionUser } from "./auth";
import { err, type Result } from "./result";

/**
 * Every service operation declares exactly one access policy. The name of a function grants
 * nothing; the policy does.
 *
 * - user:      a signed-in caller; `resource` names the permission the function checks on the
 *              specific resource (and a behaviour test proves it).
 * - public:    anyone, including anonymous callers; declares its input validation and abuse controls.
 * - webhook:   called only by a route that has verified the sender; `verifiedBy` says how.
 * - job:       called only by a trusted scheduler entry point; `triggeredBy` says which.
 *
 * webhook and job operations are system operations: only `src/app/**\/route.ts` may call them,
 * never an action, page or component (rule `system-operations-from-routes-only`).
 */
export type Policy =
  | { access: "user"; resource: string }
  | { access: "public"; validation: string; abuseControls: string }
  | { access: "webhook"; verifiedBy: string }
  | { access: "job"; triggeredBy: string };

type UserPolicy = Extract<Policy, { access: "user" }>;
export type AccessError = "unauthenticated";

const registry = new WeakMap<object, Policy>();

/** The declared policy of an operation, for tests and tooling. */
export const policyOf = (fn: unknown): Policy | undefined => registry.get(fn as object);

export function operation<A extends unknown[], T, E extends string>(
  policy: UserPolicy,
  fn: (user: SessionUser, ...args: A) => Promise<Result<T, E>>,
): (...args: A) => Promise<Result<T, E | AccessError>>;
export function operation<A extends unknown[], T, E extends string>(
  policy: Exclude<Policy, UserPolicy>,
  fn: (...args: A) => Promise<Result<T, E>>,
): (...args: A) => Promise<Result<T, E>>;
export function operation(
  policy: Policy,
  fn: (...args: never[]) => Promise<Result<unknown, string>>,
) {
  const run = fn as (...args: unknown[]) => Promise<Result<unknown, string>>;
  const wrapped = async (...args: unknown[]) => {
    if (policy.access !== "user") return run(...args);
    let user: SessionUser;
    try {
      user = await requireUser();
    } catch (e) {
      // an expired or missing session is an expected failure, not a crash
      if (e instanceof UnauthenticatedError) return err("unauthenticated");
      throw e;
    }
    return run(user, ...args);
  };
  registry.set(wrapped, policy);
  return wrapped;
}
