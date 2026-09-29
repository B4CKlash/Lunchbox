import type { KnownIngredient, PantryItem, Recipe } from "@/lib/contracts";

/** Remember the latest dishes without growing request context indefinitely. */
export function rememberRecipeNames(
  previous: readonly string[],
  recipes: readonly Pick<Recipe, "name">[],
): string[] {
  const names = new Map<string, string>();
  for (const value of [...previous, ...recipes.map((recipe) => recipe.name)]) {
    const name = value.trim();
    if (!name) continue;
    const key = name.toLocaleLowerCase("en-US").replace(/\s+/g, " ");
    // Repeated names belong at the recent end so older dishes expire first.
    names.delete(key);
    names.set(key, name);
  }
  return [...names.values()].slice(-30);
}

const ingredientKey = (id: string, unit: string) => JSON.stringify([id, unit]);

/** Track additions and restocks using canonical identity and unit, never display names. */
export function pendingPantryIngredients(
  previous: readonly PantryItem[],
  next: readonly PantryItem[],
  pending: readonly KnownIngredient[],
): KnownIngredient[] {
  const stock = (pantry: readonly PantryItem[]) => {
    const amounts = new Map<string, { ingredient: KnownIngredient; quantity: number }>();
    for (const item of pantry) {
      const key = ingredientKey(item.id, item.unit);
      amounts.set(key, {
        ingredient: { ingredientId: item.id, name: item.name, unit: item.unit },
        quantity: (amounts.get(key)?.quantity ?? 0) + item.quantity,
      });
    }
    return amounts;
  };
  const before = stock(previous);
  const after = stock(next);
  const result = new Map<string, KnownIngredient>();
  for (const item of pending) {
    const key = ingredientKey(item.ingredientId, item.unit);
    const current = after.get(key);
    if (current && current.quantity > 0) result.set(key, current.ingredient);
  }
  for (const [key, current] of after) {
    if (current.quantity > (before.get(key)?.quantity ?? 0))
      result.set(key, current.ingredient);
  }
  return [...result.values()];
}
