import "server-only";
import { operation } from "@/shared/access";

// added by a third module: a plain function, exported in a second statement
const listShipments = async () => [];
export { listShipments };

export const receiveCarrierEvent = operation(
  { access: "webhook", verifiedBy: "the carrier signature" },
  async (body: string) => body.length,
);

// a user operation calling a system operation defined in the same file
export const trackShipment = operation(
  { access: "user", resource: "own shipments" },
  async (_session: unknown, body: string) => receiveCarrierEvent(body),
);

// clean twin: a job operation may call a webhook operation
export const replayCarrierEvents = operation(
  { access: "job", triggeredBy: "the worker" },
  async () => receiveCarrierEvent("replay"),
);
