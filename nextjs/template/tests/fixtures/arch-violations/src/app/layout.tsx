import type { ReactNode } from "react";
import "@/ui/styles/index.css";
import { Providers } from "./_shell/providers";
export default function RootLayout(props: { children: ReactNode }) {
  return <Providers>{props.children}</Providers>;
}
