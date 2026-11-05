import type { ReactNode } from "react";

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "danger";
  children: ReactNode;
}) {
  return (
    <span className="ui-badge" data-tone={tone}>
      {children}
    </span>
  );
}
