"use client";

import { useState, useTransition } from "react";
import { Button } from "@/ui/Button";
import { IconX } from "@/ui/icons";
import type { CancelOrderResponse } from "../order.types";

const MESSAGES: Record<Extract<CancelOrderResponse, { ok: false }>["error"], string> = {
  unauthenticated: "Please sign in again.",
  forbidden: "You cannot cancel this order.",
  invalid_input: "Invalid order.",
  not_found: "Order not found.",
  not_cancellable: "This order can no longer be cancelled.",
  window_closed: "The cancel window has closed.",
  changed: "The order changed. Reload and try again.",
};

type Props = { orderId: string; action: (id: string) => Promise<CancelOrderResponse> };

export function CancelOrderButton({ orderId, action }: Props) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <Button
        variant="secondary"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const result = await action(orderId);
            setError(result.ok ? null : MESSAGES[result.error]);
          })
        }
      >
        <IconX /> Cancel
      </Button>
      {error ? <span role="alert">{error}</span> : null}
    </>
  );
}
