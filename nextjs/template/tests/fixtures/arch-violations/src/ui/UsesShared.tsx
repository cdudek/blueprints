import { ok } from "@/shared/result";
export const UsesShared = () => <p>{String(ok(1).ok)}</p>;
