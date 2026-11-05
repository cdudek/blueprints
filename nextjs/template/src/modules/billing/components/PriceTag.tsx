import { Text } from "@/ui";

const format = new Intl.NumberFormat("en", { style: "currency", currency: "EUR" });

export function PriceTag({ cents }: { cents: number }) {
  return <Text tabular>{format.format(cents / 100)}</Text>;
}
