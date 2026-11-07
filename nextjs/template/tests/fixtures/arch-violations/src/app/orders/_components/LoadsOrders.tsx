import { placeOrder } from "@/modules/orders/server";
export const LoadsOrders = async () => <p>{String(await placeOrder())}</p>;
