// composition: src/ui, src/i18n, a browser door and another composition file; data comes in as props
import { Link } from "@/i18n/navigation";
import { OrderCard } from "@/modules/orders/public";
import { Button } from "@/ui/Button";
import { Nav } from "./Nav";
export const Frame = (props: { title: string }) => (
  <div title={props.title}>
    <Nav />
    <Link href="/orders" />
    <OrderCard />
    <Button />
  </div>
);
