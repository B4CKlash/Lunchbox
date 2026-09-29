import type {
  PantryItem,
  PlannedMeal,
  ShoppingItem,
  Unit,
} from "@/lib/contracts";

const keyFor = (ingredientId: string, unit: Unit) =>
  JSON.stringify([ingredientId, unit]);
const round = (quantity: number) =>
  Math.round((quantity + Number.EPSILON) * 1000) / 1000;

/** Plan quantities are reservations; this calculation never changes physical stock. */
export function buildShoppingList(
  pantry: PantryItem[],
  meals: PlannedMeal[],
  { includeRestock = true }: { includeRestock?: boolean } = {},
): ShoppingItem[] {
  const stock = new Map<string, number>();
  for (const item of pantry) {
    const key = keyFor(item.id, item.unit);
    stock.set(key, (stock.get(key) ?? 0) + item.quantity);
  }

  const demand = new Map<string, ShoppingItem>();
  for (const meal of meals) {
    const scale = meal.servings / meal.recipe.servings;
    for (const ingredient of meal.recipe.ingredients) {
      const key = keyFor(ingredient.ingredientId, ingredient.unit);
      const existing = demand.get(key);
      if (existing) {
        existing.required += ingredient.quantity * scale;
      } else {
        demand.set(key, {
          ingredientId: ingredient.ingredientId,
          name: ingredient.name,
          unit: ingredient.unit,
          required: ingredient.quantity * scale,
          available: stock.get(key) ?? 0,
          quantity: 0,
        });
      }
    }
  }

  const stapleThresholds = new Map<string, { item: PantryItem; threshold: number }>();
  for (const item of pantry) {
    if (!includeRestock || item.tag !== "staple") continue;
    const key = keyFor(item.id, item.unit);
    const threshold = item.restockBelow ?? 0;
    const previous = stapleThresholds.get(key);
    if (!previous || threshold > previous.threshold)
      stapleThresholds.set(key, { item, threshold });
  }
  for (const [key, { item, threshold }] of stapleThresholds) {
    const available = stock.get(key) ?? 0;
    if (available >= threshold) continue;
    const existing = demand.get(key);
    if (existing) {
      existing.restock = true;
      existing.required = Math.max(existing.required, threshold);
    }
    else demand.set(key, {
      ingredientId: item.id,
      name: item.name,
      unit: item.unit,
      required: threshold,
      available,
      quantity: Math.max(0, threshold - available),
      restock: true,
    });
  }

  return [...demand.values()]
    .map((item) => ({
      ...item,
      required: round(item.required),
      available: round(item.available),
      quantity: round(Math.max(0, item.required - item.available)),
    }))
    .filter((item) => item.quantity > 0 || item.restock);
}
