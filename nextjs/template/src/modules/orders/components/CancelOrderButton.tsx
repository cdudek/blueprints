"use client";

import { useState, useTransition } from "react";
import { Button } from "@/ui";
import type { CancelOrderResponse } from "../order.types";

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
            setError(result.ok ? null : result.error);
          })
        }
      >
        Cancel
      </Button>
      {error ? <span role="alert">{error}</span> : null}
    </>
  );
}
