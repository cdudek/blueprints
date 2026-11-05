"use client";
import type { chargeFn } from "@/modules/billing/server";
import { Button } from "@/ui";
export const GoodClient = (props: { run: typeof chargeFn; id: string }) => <Button>{props.id + process.env.NEXT_PUBLIC_X}</Button>;
