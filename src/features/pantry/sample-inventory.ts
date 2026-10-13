import { pantryItemSchema, type HouseholdState, type PantryItem } from "@/lib/contracts";
import { ensurePilot } from "@/features/planning/pilot";
import { ingredientCatalog } from "./ingredients";
import { createSampleHousehold } from "./seed";

export type SampleInventoryKind = "sample" | "random";

type SampleIngredient = {
  id: string;
  amounts: readonly number[];
  unit: PantryItem["unit"];
  location: PantryItem["location"];
  category: NonNullable<PantryItem["category"]>;
  tag?: PantryItem["tag"];
};

const stapleIngredients: SampleIngredient[] = [
  { id: "rice", amounts: [350, 600, 1000], unit: "g", location: "Cupboard", category: "carbs" },
  { id: "lentils", amounts: [250, 500, 750], unit: "g", location: "Cupboard", category: "protein" },
  { id: "onion", amounts: [2, 3, 5], unit: "each", location: "Cupboard", category: "vegetables" },
  { id: "oil", amounts: [100, 250, 500], unit: "ml", location: "Cupboard", category: "fats" },
  { id: "garlic", amounts: [4, 8, 12], unit: "each", location: "Cupboard", category: "vegetables" },
  { id: "salt", amounts: [100, 200, 350], unit: "g", location: "Cupboard", category: "other" },
  { id: "black-pepper", amounts: [15, 30, 50], unit: "g", location: "Cupboard", category: "other" },
];

const proteins: SampleIngredient[] = [
  { id: "beans", amounts: [200, 400, 800], unit: "g", location: "Cupboard", category: "protein" },
  { id: "canned-chickpeas", amounts: [240, 480, 720], unit: "g", location: "Cupboard", category: "protein" },
  { id: "tofu", amounts: [300, 400, 600], unit: "g", location: "Fridge", category: "protein" },
  { id: "chicken-breast", amounts: [400, 600, 900], unit: "g", location: "Fridge", category: "protein" },
  { id: "eggs", amounts: [4, 6, 12], unit: "each", location: "Fridge", category: "protein" },
];

const vegetables: SampleIngredient[] = [
  { id: "tomatoes", amounts: [350, 600, 800], unit: "g", location: "Fridge", category: "vegetables" },
  { id: "spinach", amounts: [100, 200, 300], unit: "g", location: "Fridge", category: "vegetables" },
  { id: "zucchini", amounts: [1, 2, 3], unit: "each", location: "Fridge", category: "vegetables" },
  { id: "pepper", amounts: [1, 2, 4], unit: "each", location: "Fridge", category: "vegetables" },
  { id: "broccoli", amounts: [300, 500, 700], unit: "g", location: "Fridge", category: "vegetables" },
  { id: "carrot", amounts: [3, 5, 8], unit: "each", location: "Fridge", category: "vegetables" },
  { id: "potato", amounts: [3, 5, 8], unit: "each", location: "Cupboard", category: "vegetables" },
  { id: "mushrooms", amounts: [150, 250, 400], unit: "g", location: "Fridge", category: "vegetables" },
];

const extras: SampleIngredient[] = [
  { id: "pasta", amounts: [250, 500, 750], unit: "g", location: "Cupboard", category: "carbs" },
  { id: "rolled-oats", amounts: [250, 500, 750], unit: "g", location: "Cupboard", category: "carbs" },
  { id: "tomato-sauce", amounts: [250, 500, 700], unit: "g", location: "Cupboard", category: "vegetables" },
  { id: "vegetable-stock", amounts: [500, 750, 1000], unit: "ml", location: "Cupboard", category: "other" },
  { id: "soy-sauce", amounts: [100, 150, 250], unit: "ml", location: "Cupboard", category: "other" },
  { id: "yogurt", amounts: [150, 300, 500], unit: "g", location: "Fridge", category: "dairy" },
  { id: "cheddar", amounts: [100, 200, 300], unit: "g", location: "Fridge", category: "dairy" },
];

const fruit: SampleIngredient[] = [
  { id: "lemon", amounts: [1, 2, 3], unit: "each", location: "Fridge", category: "fruit" },
  { id: "apple", amounts: [3, 5, 10], unit: "each", location: "Fridge", category: "fruit" },
  { id: "banana", amounts: [2, 4, 6], unit: "each", location: "Cupboard", category: "fruit" },
];

function choose<T>(values: readonly T[], random: () => number): T {
  return values[Math.floor(random() * values.length)];
}

function select<T>(values: readonly T[], count: number, random: () => number): T[] {
  const remaining = [...values];
  return Array.from({ length: count }, () => remaining.splice(Math.floor(random() * remaining.length), 1)[0]);
}

/** Fictional measured stock for an explicitly labeled experiment. This helper
 * never reads, merges, writes or converts a person's household inventory. */
export function createSamplePantry(kind: SampleInventoryKind = "sample", random: () => number = Math.random): PantryItem[] {
  if (kind === "sample") return createSampleHousehold().pantry;
  const selected = [
    ...stapleIngredients,
    ...select(proteins, 2, random),
    ...select(vegetables, 5, random),
    ...select(extras, 3, random),
    ...select(fruit, 2, random),
  ];
  return selected.map((item) => {
    const catalog = ingredientCatalog.find((entry) => entry.ingredientId === item.id);
    if (!catalog) throw new Error(`Missing canonical sample ingredient: ${item.id}`);
    return pantryItemSchema.parse({
      id: item.id,
      name: catalog.name,
      quantity: choose(item.amounts, random),
      unit: item.unit,
      location: item.location,
      category: item.category,
      tag: item.tag ?? (stapleIngredients.includes(item) ? "staple" : "special"),
      useSoon: item.location === "Fridge" && random() < 0.35,
    });
  });
}

/** Start a fresh fictional kitchen using the application's existing schema.
 * The provider owns the memory-only boundary; no real profile or history is
 * copied into these examples, and no storage or account APIs are called. */
export function createInventoryExperiment(randomized: boolean, random: () => number = Math.random): HouseholdState {
  const household = createSampleHousehold();
  household.pantry = createSamplePantry(randomized ? "random" : "sample", random);
  household.preferences.onboardingComplete = true;
  return ensurePilot(household);
}
