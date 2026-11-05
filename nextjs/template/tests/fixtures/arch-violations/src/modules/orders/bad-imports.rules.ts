import { findOrder } from "./order.repository";
import { placeOrder } from "./order.service";
import { db } from "@/db";
import page from "@/app/page";
export const r = [findOrder, placeOrder, db, page];
