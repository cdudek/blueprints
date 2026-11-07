"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { Button } from "@/ui/Button";
import { IconCheck } from "@/ui/icons";
import { Input } from "@/ui/Input";
import type { PlaceOrderResponse } from "../order.types";

type Props = {
  /** Generated once per page render: a double click or a retry reuses the same order. */
  checkoutId: string;
  action: (previous: PlaceOrderResponse | null, form: FormData) => Promise<PlaceOrderResponse>;
};

export function OrderForm({ checkoutId, action }: Props) {
  const t = useTranslations("orders");
  const [state, submit, pending] = useActionState(action, null);
  return (
    <form action={submit} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="checkoutId" value={checkoutId} />
      <Input
        name="productId"
        aria-label={t("form.productId")}
        placeholder={t("form.productId")}
        defaultValue="widget"
        required
      />
      <Input
        name="quantity"
        type="number"
        aria-label={t("form.quantity")}
        min={1}
        defaultValue={1}
        required
      />
      <Button type="submit" disabled={pending}>
        {t("form.submit")}
      </Button>
      {/* the UI branches on the kind of failure, not on a message string */}
      {state && !state.ok ? <p role="alert">{t(`errors.${state.error}`)}</p> : null}
      {state?.ok ? (
        <p role="status">
          <IconCheck /> {t("form.placed")}
        </p>
      ) : null}
    </form>
  );
}
