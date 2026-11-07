import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@/ui/styles/index.css";

export const metadata: Metadata = { title: "Orders and billing blueprint" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="p-4">{children}</body>
    </html>
  );
}
