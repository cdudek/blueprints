"use client";
import { chargeFn } from "@/modules/billing/server";
export { placeOrder } from "../order.service";
export const load = () => import("@/db");
export const BadClient = () => <p>{chargeFn.name}</p>;
