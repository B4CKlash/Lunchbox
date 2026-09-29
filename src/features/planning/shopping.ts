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

  return [...demand.values()]
    .map((item) => ({
      ...item,
      required: round(item.required),
      available: round(item.available),
      quantity: round(Math.max(0, item.required - item.available)),
    }))
    .filter((item) => item.quantity > 0);
}
