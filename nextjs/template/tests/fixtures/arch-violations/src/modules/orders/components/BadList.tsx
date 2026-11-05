import { findOrder } from "../order.repository";
import { orders } from "../order.tables";
import { db } from "@/shared/db";
export const BadList = () => <p>{[findOrder, orders, db].length}</p>;
