import "server-only";
export const db = { transaction: async (fn: () => Promise<void>) => fn() };
