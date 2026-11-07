"use client";

import { useState, useTransition } from "react";
import { Button } from "@/ui/Button";
import { ConfirmDialog } from "@/ui/ConfirmDialog";
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
      <ConfirmDialog
        trigger={
          <Button variant="secondary" disabled={pending}>
            <IconX /> Cancel
          </Button>
        }
        title="Cancel this order?"
        description="A paid order is refunded."
        dismiss="Keep order"
        confirm="Cancel order"
        onConfirm={() =>
          start(async () => {
            const result = await action(orderId);
            setError(result.ok ? null : MESSAGES[result.error]);
          })
        }
      />
      {error ? <span role="alert">{error}</span> : null}
    </>
  );
}
