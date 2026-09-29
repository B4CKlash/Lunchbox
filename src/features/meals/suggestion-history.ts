import type { Recipe } from "@/lib/contracts";

/** Remember the latest dishes without growing request context indefinitely. */
export function rememberRecipeNames(
  previous: readonly string[],
  recipes: readonly Pick<Recipe, "name">[],
): string[] {
  const names = new Map<string, string>();
  for (const value of [...previous, ...recipes.map((recipe) => recipe.name)]) {
    const name = value.trim();
    if (!name) continue;
    const key = name.toLocaleLowerCase("en-US");
    // Repeated names belong at the recent end so older dishes expire first.
    names.delete(key);
    names.set(key, name);
  }
  return [...names.values()].slice(-30);
}
