// Expected failures come back as a Result with a typed error. Use a union of string codes so a
// caller can branch on the kind; unexpected failures throw.
export type Result<T, E extends string = string> = { ok: true; value: T } | { ok: false; error: E };
export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E extends string>(error: E): Result<never, E> => ({ ok: false, error });
