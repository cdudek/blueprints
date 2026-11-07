"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Button } from "@/ui/Button";
import { ConfirmDialog } from "@/ui/ConfirmDialog";
import { IconX } from "@/ui/icons";
import type { CancelOrderResponse } from "../order.types";

type Props = { orderId: string; action: (id: string) => Promise<CancelOrderResponse> };

export function CancelOrderButton({ orderId, action }: Props) {
  const t = useTranslations("orders");
  const [pending, start] = useTransition();
  const [error, setError] = useState<Extract<CancelOrderResponse, { ok: false }>["error"] | null>(
    null,
  );
  return (
    <>
      <ConfirmDialog
        trigger={
          <Button variant="secondary" disabled={pending}>
            <IconX /> {t("cancel.button")}
          </Button>
        }
        title={t("cancel.title")}
        description={t("cancel.description")}
        dismiss={t("cancel.dismiss")}
        confirm={t("cancel.confirm")}
        onConfirm={() =>
          start(async () => {
            const result = await action(orderId);
            setError(result.ok ? null : result.error);
          })
        }
      />
      {/* the UI branches on the kind of failure; the words come from messages */}
      {error ? <span role="alert">{t(`errors.${error}`)}</span> : null}
    </>
  );
}
