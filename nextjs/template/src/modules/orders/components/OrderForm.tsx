"use client";

import { useActionState } from "react";
import { Button, Input } from "@/ui";
import type { PlaceOrderResponse } from "../order.types";

// The UI branches on the kind of failure, not on a message string.
const MESSAGES: Record<Extract<PlaceOrderResponse, { ok: false }>["error"], string> = {
  unauthenticated: "Please sign in again.",
  forbidden: "You cannot order this.",
  invalid_input: "Check the form and try again.",
  invalid_product: "Check the product id.",
  unknown_product: "We do not sell that product.",
  checkout_conflict: "This form was already used. Reload the page to start a new order.",
  checkout_cancelled: "That order was cancelled. Reload the page to start a new one.",
  not_payable: "That order can no longer be paid.",
};

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
      {state && !state.ok ? <p role="alert">{MESSAGES[state.error]}</p> : null}
      {state?.ok ? <p role="status">Order placed</p> : null}
    </form>
  );
}
