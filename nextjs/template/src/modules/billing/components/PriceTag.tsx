import { useFormatter } from "next-intl";
import { Text } from "@/ui/Text";

/** Formats in the request's locale. */
export function PriceTag({ cents }: { cents: number }) {
  const format = useFormatter();
  return <Text tabular>{format.number(cents / 100, { style: "currency", currency: "EUR" })}</Text>;
}
