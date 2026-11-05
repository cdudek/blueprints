import "server-only";
import { requireUser } from "@/shared/auth";
import { findPayment } from "./billing.repository";
export async function chargeFn() {
  await requireUser();
  return findPayment();
}
