"use client";

import { AlertDialog } from "radix-ui";
import type { ReactNode } from "react";
import { Button } from "./Button";

type Props = {
  /** The element that opens the dialog, usually a Button. */
  trigger: ReactNode;
  title: ReactNode;
  description: ReactNode;
  confirm: ReactNode;
  dismiss: ReactNode;
  onConfirm: () => void;
};

/**
 * Asks before a destructive action. Radix does the focus trap, Escape, focus return and the
 * alertdialog role; all text arrives through props.
 */
export function ConfirmDialog({ trigger, title, description, confirm, dismiss, onConfirm }: Props) {
  return (
    <AlertDialog.Root>
      <AlertDialog.Trigger asChild>{trigger}</AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 bg-black/40" />
        <AlertDialog.Content className="fixed top-1/2 left-1/2 w-[min(28rem,90vw)] -translate-x-1/2 -translate-y-1/2 rounded-ui border border-border bg-bg p-6 text-fg">
          <AlertDialog.Title className="text-lg font-semibold">{title}</AlertDialog.Title>
          <AlertDialog.Description className="mt-2 text-muted">
            {description}
          </AlertDialog.Description>
          <div className="mt-6 flex justify-end gap-2">
            <AlertDialog.Cancel asChild>
              <Button variant="secondary">{dismiss}</Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <Button onClick={onConfirm}>{confirm}</Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
