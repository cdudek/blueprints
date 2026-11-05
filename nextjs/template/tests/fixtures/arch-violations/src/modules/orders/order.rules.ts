import { z } from "zod";
import { ok } from "@/shared/result";
export const total = (a: number, b: number) => ok(z.number().parse(a * b));
