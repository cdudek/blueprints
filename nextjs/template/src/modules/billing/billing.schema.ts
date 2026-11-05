import { z } from "zod";

export const productIdSchema = z.string().min(1);
export const centsSchema = z.number().int().nonnegative();
