// composition: src/ui, a browser door and another composition file; data comes in as props
import { OrderCard } from "@/modules/orders/public";
import { Button } from "@/ui/Button";
import { Nav } from "./Nav";
export const Frame = (props: { title: string }) => (
  <div title={props.title}>
    <Nav />
    <OrderCard />
    <Button />
  </div>
);
