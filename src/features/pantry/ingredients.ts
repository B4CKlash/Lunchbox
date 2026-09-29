import type { HouseholdState, KnownIngredient, Unit } from "@/lib/contracts";

type CatalogEntry = { ingredientId: string; name: string; aliases: string[] };
const entry = (ingredientId: string, name: string, ...aliases: string[]): CatalogEntry =>
  ({ ingredientId, name, aliases });

/** Authored aliases only. Physical forms remain separate ingredient identities. */
export const ingredientCatalog: CatalogEntry[] = [
  entry("tomatoes", "Tomatoes", "roma tomatoes", "fresh tomatoes", "tomato"),
  entry("lentils", "Cooked lentils", "cooked lentils (sealed pouch)"),
  entry("dry-lentils", "Dry lentils", "dried lentils"),
  entry("rice", "Jasmine rice", "dry jasmine rice", "uncooked jasmine rice"),
  entry("cooked-rice", "Cooked rice"),
  entry("onion", "Yellow onion", "onion", "yellow onions", "onions"),
  entry("oil", "Olive oil"),
  entry("zucchini", "Zucchini", "courgette", "courgettes"),
  entry("pepper", "Sweet peppers", "bell pepper", "bell peppers", "sweet pepper"),
  entry("beans", "Canned white beans", "cooked white beans"),
  entry("spinach", "Spinach", "fresh spinach", "baby spinach"),
  entry("lemon", "Lemon", "lemons"),
  entry("garlic", "Garlic", "garlic clove", "garlic cloves"),
  entry("milk", "Milk", "dairy milk", "whole milk"),
  entry("oat-milk", "Oat milk"),
  entry("eggs", "Eggs", "egg", "whole eggs"),
  entry("butter", "Butter", "unsalted butter"),
  entry("flour", "All-purpose flour", "plain flour", "all purpose flour"),
  entry("sugar", "Granulated sugar", "white sugar"),
  entry("salt", "Salt", "table salt"),
  entry("black-pepper", "Black pepper", "ground black pepper"),
  entry("pasta", "Dry pasta", "pasta", "uncooked pasta"),
  entry("lasagna-sheets", "Dry lasagna sheets", "lasagna sheets", "lasagne sheets"),
  entry("tomato-sauce", "Tomato sauce", "passata"),
  entry("tomato-paste", "Tomato paste", "tomato puree concentrate"),
  entry("canned-tomatoes", "Canned tomatoes", "canned chopped tomatoes"),
  entry("mozzarella", "Mozzarella", "mozzarella cheese"),
  entry("parmesan", "Parmesan", "parmesan cheese"),
  entry("ricotta", "Ricotta", "ricotta cheese"),
  entry("cheddar", "Cheddar", "cheddar cheese"),
  entry("chicken-breast", "Raw chicken breast", "chicken breast"),
  entry("cooked-chicken", "Cooked chicken"),
  entry("ground-beef", "Raw ground beef", "ground beef", "beef mince"),
  entry("tofu", "Firm tofu", "tofu"),
  entry("canned-chickpeas", "Canned chickpeas", "cooked chickpeas"),
  entry("dry-chickpeas", "Dry chickpeas", "dried chickpeas"),
  entry("carrot", "Carrot", "carrots"),
  entry("potato", "Potato", "potatoes"),
  entry("broccoli", "Broccoli"),
  entry("mushrooms", "Fresh mushrooms", "mushroom", "mushrooms"),
  entry("basil", "Fresh basil"),
  entry("dried-basil", "Dried basil"),
  entry("oregano", "Dried oregano"),
  entry("vegetable-stock", "Vegetable stock", "vegetable broth"),
  entry("chicken-stock", "Chicken stock", "chicken broth"),
  entry("soy-sauce", "Soy sauce"),
  entry("lemon-juice", "Lemon juice"),
  entry("yogurt", "Plain yogurt", "plain yoghurt"),
  entry("rolled-oats", "Rolled oats"),
  entry("banana", "Banana", "bananas"),
  entry("apple", "Apple", "apples"),
];

export const normalizeIngredientName = (name: string) =>
  name.normalize("NFKC").trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ");
const namesFor = (item: CatalogEntry) => [item.name, ...item.aliases].map(normalizeIngredientName);
const catalogForName = (name: string) => ingredientCatalog.filter((item) =>
  namesFor(item).includes(normalizeIngredientName(name)));

/** Stable browser/server ID, independent of quantities, units, and recipe titles. */
function customId(name: string) {
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(normalizeIngredientName(name))) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return `custom-${hash.toString(16).padStart(16, "0")}`;
}

export type IngredientResolution =
  | { status: "resolved"; ingredient: KnownIngredient }
  | { status: "ambiguous"; candidates: KnownIngredient[] };

export function resolveIngredient(
  input: { name: string; unit: Unit; ingredientId?: string | null },
  known: KnownIngredient[] = [],
): IngredientResolution {
  const name = input.name.trim();
  if (!name) throw new Error("Give this ingredient a name.");
  const matchingReference = input.ingredientId
    ? known.filter((item) => item.ingredientId === input.ingredientId)
    : [];
  if (matchingReference.length) {
    const chosen = matchingReference.find((item) => item.unit === input.unit) ?? matchingReference[0];
    return { status: "resolved", ingredient: { ...chosen, unit: input.unit } };
  }
  const normalized = normalizeIngredientName(name);
  const catalogMatches = catalogForName(name);
  const catalogIds = new Set(catalogMatches.map((item) => item.ingredientId));
  const matches = known.filter((item) =>
    normalizeIngredientName(item.name) === normalized ||
    catalogIds.has(item.ingredientId) ||
    catalogForName(item.name).some((catalog) => catalogIds.has(catalog.ingredientId)),
  );
  // One identity may legitimately have stock in more than one unit.
  const byId = new Map<string, KnownIngredient>();
  for (const item of matches) {
    if (!byId.has(item.ingredientId) || item.unit === input.unit) byId.set(item.ingredientId, item);
  }
  if (byId.size > 1) return { status: "ambiguous", candidates: [...byId.values()] };
  if (byId.size === 1) {
    const chosen = [...byId.values()][0];
    return { status: "resolved", ingredient: { ...chosen, unit: input.unit } };
  }
  if (catalogMatches.length > 1) return {
    status: "ambiguous", candidates: catalogMatches.map((item) => ({ ingredientId: item.ingredientId, name: item.name, unit: input.unit })),
  };
  const canonical = catalogMatches[0];
  const ingredientId = canonical?.ingredientId ?? customId(name);
  const collision = known.find((item) => item.ingredientId === ingredientId && normalizeIngredientName(item.name) !== normalized);
  if (!canonical && collision) return { status: "ambiguous", candidates: [collision] };
  return { status: "resolved", ingredient: { ingredientId, name: canonical?.name ?? name, unit: input.unit } };
}

export function knownIngredientsFromHousehold(state: HouseholdState): KnownIngredient[] {
  const refs: KnownIngredient[] = state.pantry.map((item) => ({ ingredientId: item.id, name: item.name, unit: item.unit }));
  const recipes = [
    ...state.meals.map((meal) => meal.recipe),
    ...(state.workspace.calendar.draft ?? []).map((meal) => meal.recipe),
    ...state.workspace.recipeBox.map((saved) => saved.recipe),
    ...state.workspace.chatMessages.flatMap((message) => message.recipes),
    ...(state.workspace.focusedRecipe ? [state.workspace.focusedRecipe] : []),
  ];
  for (const recipe of recipes) refs.push(...recipe.ingredients);
  const unique = new Map<string, KnownIngredient>();
  for (const item of refs) {
    const key = JSON.stringify([item.ingredientId, item.unit]);
    if (!unique.has(key)) unique.set(key, { ingredientId: item.ingredientId, name: item.name, unit: item.unit });
  }
  return [...unique.values()].slice(0, 2000);
}
