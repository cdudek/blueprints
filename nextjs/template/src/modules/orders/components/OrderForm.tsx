"use client";

import { useActionState } from "react";
import { Button, Input } from "@/ui";
import type { PlaceOrderResponse } from "../order.types";

type Props = {
  /** Generated once per page render: a double click or a retry reuses the same order. */
  checkoutId: string;
  action: (previous: PlaceOrderResponse | null, form: FormData) => Promise<PlaceOrderResponse>;
};

export function OrderForm({ checkoutId, action }: Props) {
  const [state, submit, pending] = useActionState(action, null);
  return (
    <form action={submit}>
      <input type="hidden" name="checkoutId" value={checkoutId} />
      <Input name="productId" placeholder="Product id" defaultValue="widget" required />
      <Input name="quantity" type="number" min={1} defaultValue={1} required />
      <Button type="submit" disabled={pending}>
        Place order
      </Button>
      {state && !state.ok ? <p role="alert">{state.error}</p> : null}
      {state?.ok ? <p role="status">Order placed</p> : null}
    </form>
  );
}
