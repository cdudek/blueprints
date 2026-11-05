import * as billing from "@/modules/billing/billing.tables";
import * as orders from "@/modules/orders/order.tables";
export const schema = { ...orders, ...billing };
