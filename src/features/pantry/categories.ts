import type { PantryCategory, PantryItem } from "@/lib/contracts";

export const pantryCategories: ReadonlyArray<{
  value: PantryCategory;
  label: string;
}> = [
  { value: "protein", label: "Protein" },
  { value: "carbs", label: "Carbs" },
  { value: "vegetables", label: "Veggies" },
  { value: "fruit", label: "Fruit" },
  { value: "fats", label: "Fats" },
  { value: "dairy", label: "Dairy" },
  { value: "other", label: "Other" },
];

const categoryKeywords: Record<Exclude<PantryCategory, "other">, string[]> = {
  protein: [
    "egg",
    "chicken",
    "beef",
    "pork",
    "turkey",
    "fish",
    "salmon",
    "tuna",
    "shrimp",
    "tofu",
    "tempeh",
    "lentil",
    "bean",
    "chickpea",
  ],
  carbs: [
    "rice",
    "pasta",
    "bread",
    "oat",
    "flour",
    "quinoa",
    "couscous",
    "tortilla",
    "noodle",
    "potato",
  ],
  vegetables: [
    "tomato",
    "onion",
    "zucchini",
    "pepper",
    "spinach",
    "broccoli",
    "carrot",
    "lettuce",
    "kale",
    "cucumber",
    "mushroom",
    "garlic",
    "corn",
  ],
  fruit: [
    "apple",
    "banana",
    "berry",
    "berries",
    "orange",
    "lemon",
    "lime",
    "grape",
    "mango",
    "peach",
    "avocado",
  ],
  fats: ["oil", "butter", "ghee", "nut", "seed", "tahini"],
  dairy: ["milk", "cheese", "yogurt", "cream", "kefir"],
};

export function inferPantryCategory(
  item: Pick<PantryItem, "id" | "name" | "category">,
): PantryCategory {
  if (item.category) return item.category;
  const searchable = `${item.id} ${item.name}`.toLowerCase();
  for (const category of pantryCategories) {
    if (category.value === "other") continue;
    if (categoryKeywords[category.value].some((word) => searchable.includes(word))) {
      return category.value;
    }
  }
  return "other";
}

export function pantryCategoryLabel(category: PantryCategory): string {
  return pantryCategories.find((option) => option.value === category)?.label ?? "Other";
}
