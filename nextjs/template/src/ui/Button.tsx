import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "./lib/cn";

const button = cva(
  "inline-flex min-h-6 cursor-pointer items-center gap-2 rounded-ui border border-accent px-4 py-2 font-medium disabled:cursor-not-allowed disabled:opacity-60",
  {
    variants: {
      variant: {
        primary: "bg-accent text-accent-fg",
        secondary: "bg-transparent text-accent",
      },
    },
    defaultVariants: { variant: "primary" },
  },
);

type Props = ComponentProps<"button"> & VariantProps<typeof button>;

export function Button({ variant, className, ...rest }: Props) {
  return <button {...rest} className={cn(button({ variant }), className)} />;
}
