import type { HouseholdState } from "@/lib/contracts";

/** A fresh, independent household each time; ingredient IDs are shared with recipes. */
export function createSampleHousehold(): HouseholdState {
  return {
    version: 1,
    pantry: [
      {
        id: "tomatoes",
        name: "Roma tomatoes",
        quantity: 800,
        unit: "g",
        location: "Fridge",
        useSoon: true,
      },
      {
        id: "lentils",
        name: "Cooked lentils (sealed pouch)",
        quantity: 500,
        unit: "g",
        location: "Cupboard",
        useSoon: false,
      },
      {
        id: "rice",
        name: "Jasmine rice",
        quantity: 1000,
        unit: "g",
        location: "Cupboard",
        useSoon: false,
      },
      {
        id: "onion",
        name: "Yellow onion",
        quantity: 2,
        unit: "each",
        location: "Cupboard",
        useSoon: false,
      },
      {
        id: "oil",
        name: "Olive oil",
        quantity: 250,
        unit: "ml",
        location: "Cupboard",
        useSoon: false,
      },
      {
        id: "zucchini",
        name: "Zucchini",
        quantity: 2,
        unit: "each",
        location: "Fridge",
        useSoon: true,
      },
      {
        id: "pepper",
        name: "Sweet peppers",
        quantity: 2,
        unit: "each",
        location: "Fridge",
        useSoon: true,
      },
      {
        id: "beans",
        name: "Canned white beans",
        quantity: 400,
        unit: "g",
        location: "Cupboard",
        useSoon: false,
      },
      {
        id: "spinach",
        name: "Spinach",
        quantity: 0,
        unit: "g",
        location: "Fridge",
        useSoon: false,
      },
      {
        id: "lemon",
        name: "Lemon",
        quantity: 0,
        unit: "each",
        location: "Fridge",
        useSoon: false,
      },
    ],
    preferences: { servings: 2, maxMinutes: 30, prioritizeUseSoon: true },
    meals: [],
  };
}
