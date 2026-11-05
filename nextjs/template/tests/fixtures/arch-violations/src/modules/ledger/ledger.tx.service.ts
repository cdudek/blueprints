import "server-only";
import { db } from "@/shared/db";
import { payments } from "@/clients/payments";
import { requireUser } from "@/shared/auth";
export async function settle() {
  await requireUser();
  await db.transaction(async () => {
    await payments().createIntent();
    await fetch("https://example.invalid");
  });
}
