import "server-only";
import { operation } from "@/shared/access";
import { receiveCarrierEvent } from "./shipments.service";

// a user operation calling a system operation of its own module, from a sibling file
export const dispatchShipment = operation(
  { access: "user", resource: "own shipments" },
  async (_session: unknown) => receiveCarrierEvent("dispatched"),
);
