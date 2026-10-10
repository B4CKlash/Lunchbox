import type { FlexibleStock, HouseholdState, PantryItem } from "@/lib/contracts";

const keyFor = (id: string, unit: string) => JSON.stringify([id, unit]);
const round = (quantity: number) => Math.round((quantity + Number.EPSILON) * 1000) / 1000;

/** A read-only canonical balance; older duplicate rows remain preserved on disk. */
export function aggregatePantry(pantry: PantryItem[], stock: FlexibleStock[] = []): PantryItem[] {
  const items = new Map<string, PantryItem>();
  for (const item of pantry) {
    const key = keyFor(item.id, item.unit);
    const previous = items.get(key);
    items.set(key, previous ? {
      ...previous,
      quantity: round(previous.quantity + item.quantity),
      useSoon: previous.useSoon || item.useSoon,
      tag: previous.tag === "staple" || item.tag === "staple" ? "staple" : previous.tag,
      category: previous.category ?? item.category,
      restockBelow: Math.max(previous.restockBelow ?? 0, item.restockBelow ?? 0),
    } : { ...item });
  }
  for (const entry of stock) {
    const key = keyFor(entry.ingredientId, entry.unit);
    if (!items.has(key)) items.set(key, {
      id: entry.ingredientId, name: entry.name, unit: entry.unit,
      quantity: entry.status === "exact" ? entry.quantity! : 0,
      location: "Cupboard", tag: "special", useSoon: entry.useSoon ?? false,
    });
  }
  return [...items.values()];
}

export type ModelPantryItem = Omit<PantryItem, "quantity"> & {
  status?: FlexibleStock["status"];
  quantity?: number;
  quantityKnown?: false;
};

/** Apply certainty once per ingredient/unit; never expose an obsolete balance. */
export function pantryForModel(pantry: PantryItem[], household?: HouseholdState): ModelPantryItem[] {
  const stock = household?.pilot?.stock ?? [];
  const overrides = new Map(stock.map((entry) => [keyFor(entry.ingredientId, entry.unit), entry]));
  return aggregatePantry(pantry, stock).map((item) => {
    const current = overrides.get(keyFor(item.id, item.unit));
    if (!current) return item;
    const { quantity: _historical, ...identity } = item;
    void _historical;
    return {
      ...identity, useSoon: current.useSoon ?? item.useSoon, status: current.status,
      ...(current.status === "exact" ? { quantity: current.quantity! }
        : current.status === "out" ? { quantity: 0 } : { quantityKnown: false as const }),
    };
  });
}
