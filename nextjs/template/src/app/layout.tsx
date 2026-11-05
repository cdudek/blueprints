import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@/ui";

export const metadata: Metadata = { title: "Orders and billing blueprint" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "var(--font-sans)", margin: "var(--space-3)" }}>{children}</body>
    </html>
  );
}
