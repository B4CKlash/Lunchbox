import type { Recipe, SuggestionBlock, SuggestMealsRequest, SuggestMealsResponse } from "@/lib/contracts";
import { rememberRecipeNames } from "./suggestion-history";

export const RECIPE_BLOCK_DELAY_MS = 15_000;
export type RecipeBlockOutcome = "complete" | "empty" | "duplicates" | "demo";

export function recipeNameKey(name: string): string {
  return name.trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ");
}

/** A block makes at most two sequential requests; each usable half is durable immediately. */
export async function generateRecipeBlock({ seed, aiMode, signal, getInput, getExistingNames, send, onBatch }: {
  seed: Pick<SuggestionBlock, "id" | "sequence" | "contextKey" | "direction" | "servings">;
  aiMode: "ai" | "demo";
  signal: AbortSignal;
  getInput: () => SuggestMealsRequest;
  getExistingNames: () => readonly string[];
  send: (input: SuggestMealsRequest) => Promise<SuggestMealsResponse>;
  onBatch: (input: SuggestMealsRequest, block: SuggestionBlock) => void;
}): Promise<{ outcome: RecipeBlockOutcome; block?: SuggestionBlock; explanation?: string }> {
  const recipes: Recipe[] = [];
  let block: SuggestionBlock | undefined;
  let explanation: string | undefined;
  for (let batch = 0; batch < (aiMode === "ai" ? 2 : 1); batch++) {
    signal.throwIfAborted();
    const latest = getInput();
    const input: SuggestMealsRequest = {
      ...latest,
      recentRecipeNames: rememberRecipeNames(latest.recentRecipeNames ?? [], recipes),
      // The first successful half already consumes this kitchen's restock priority.
      ...(recipes.length ? { preferredIngredients: [] } : {}),
    };
    const response = await send(input);
    signal.throwIfAborted();
    if (response.explanation) explanation = response.explanation;
    if (!response.recipes.length) return { outcome: "empty", block, explanation };
    const seen = new Set([...getExistingNames(), ...recipes.map((recipe) => recipe.name)].map(recipeNameKey));
    const fresh = response.recipes.filter((recipe) => {
      const name = recipeNameKey(recipe.name);
      if (seen.has(name)) return false;
      seen.add(name);
      return true;
    }).slice(0, 6 - recipes.length);
    if (!fresh.length) return { outcome: "duplicates", block, explanation };
    recipes.push(...fresh);
    block = { ...seed, source: response.source, recipes: [...recipes], ...(explanation ? { explanation } : {}) };
    onBatch(input, block);
    signal.throwIfAborted();
    // Demo recipes are finite, even if the server mode changed during the session.
    if (response.source === "demo" || aiMode === "demo") return { outcome: "demo", block, explanation };
    if (recipes.length >= 6) break;
  }
  return { outcome: "complete", block, explanation };
}

export function waitForRecipeBlock(delay: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const finish = () => {
      signal.removeEventListener("abort", abort);
      resolve();
    };
    const timer = setTimeout(finish, Math.min(Math.max(delay, 0), 2_147_483_647));
    const abort = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      reject(signal.reason);
    };
    signal.addEventListener("abort", abort, { once: true });
  });
}
