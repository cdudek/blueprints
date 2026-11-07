import type { ComponentProps } from "react";
import { cn } from "./lib/cn";

export function Input({ className, ...rest }: ComponentProps<"input">) {
  return (
    <input
      {...rest}
      className={cn("min-h-6 rounded-ui border border-border bg-bg px-2 py-2", className)}
    />
  );
}
