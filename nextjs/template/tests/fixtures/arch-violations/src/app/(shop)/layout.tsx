import type { ReactNode } from "react";
import { Providers } from "@/app/_shell/providers";
export default function ShopLayout(props: { children: ReactNode }) {
  return <Providers>{props.children}</Providers>;
}
