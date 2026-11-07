import type { ReactNode } from "react";
import { Button } from "./Button";
export const Card = (props: { children: ReactNode }) => (
  <section>
    {props.children}
    <Button />
  </section>
);
