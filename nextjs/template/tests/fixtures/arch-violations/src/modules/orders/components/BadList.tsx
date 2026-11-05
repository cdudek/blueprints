import { findOrder } from "../order.repository";
import { orders } from "../order.tables";
import { db } from "@/db";
export const BadList = () => <p>{[findOrder, orders, db].length}</p>;
