import { cva, type VariantProps } from "class-variance-authority";
import type { ReactNode } from "react";

const badge = cva("inline-block rounded-full border px-2 text-sm", {
  variants: {
    tone: { neutral: "border-border", danger: "border-danger text-danger" },
  },
  defaultVariants: { tone: "neutral" },
});

export function Badge({ tone, children }: VariantProps<typeof badge> & { children: ReactNode }) {
  return <span className={badge({ tone })}>{children}</span>;
}
