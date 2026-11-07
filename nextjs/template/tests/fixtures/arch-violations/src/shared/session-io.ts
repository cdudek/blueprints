import "server-only";
import { cookies } from "next/headers";
export const readSession = async () => (await cookies()).get("session");
