import { findOrder } from "@/modules/orders/order.repository";
import { db } from "@/db";
export const q = [findOrder, db];
