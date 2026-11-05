import type { ReactNode } from "react";

export function Text({ tabular = false, children }: { tabular?: boolean; children: ReactNode }) {
  return (
    <span className="ui-text" data-tabular={tabular}>
      {children}
    </span>
  );
}
