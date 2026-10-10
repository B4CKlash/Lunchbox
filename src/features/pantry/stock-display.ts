import type { FlexibleStock, PantryItem } from "@/lib/contracts";

/** The historical pantry balance is not a current measurement after a qualitative update. */
export function pantryStockDisplay(item: PantryItem, stock: FlexibleStock[] = []) {
  const override = stock.find((entry) => entry.ingredientId === item.id && entry.unit === item.unit);
  const status = override?.status ?? "exact";
  const quantity = status === "exact" ? override?.quantity ?? item.quantity : status === "out" ? 0 : null;
  const label = status === "some" ? "Some · amount unknown" : status === "low" ? "Running low · amount unknown" : status === "out" ? "Out of stock" : `${quantity!.toLocaleString("en-US", { maximumFractionDigits: 3 })} ${item.unit}`;
  return {
    status, quantity, label,
    onHand: status === "some" || status === "low" || (quantity !== null && quantity > 0),
    useSoon: override?.useSoon ?? item.useSoon,
    sourceNote: override?.sourceNote,
    uncertain: status === "some" || status === "low",
  };
}
