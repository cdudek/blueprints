import { findOrder } from "@/modules/orders/order.repository";
import { db } from "@/shared/db";
export const q = [findOrder, db];
