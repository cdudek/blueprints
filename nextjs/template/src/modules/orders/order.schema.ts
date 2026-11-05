import { z } from "zod";

export const placeOrderSchema = z.object({
  checkoutId: z.uuid(),
  productId: z.string().min(1),
  quantity: z.coerce.number().int().positive(),
});
export const orderIdSchema = z.uuid();

export type PlaceOrderInput = z.infer<typeof placeOrderSchema>;
