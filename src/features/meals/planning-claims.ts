/** A conservative advisory-output guard, not proof of all natural-language
 * meanings. Only domain receipts establish that an action was applied. */
import type { Recipe } from "@/lib/contracts";

/** Evidence is available only for a read-only return of exact known favorites. */
export function favoriteClaimFacts(existingFavorites: readonly Recipe[], result: { recipes: readonly Recipe[]; operations: readonly unknown[] }): string[] {
  if (result.operations.length || !result.recipes.length) return [];
  if (result.recipes.some((recipe) => !existingFavorites.some((known) => JSON.stringify(known) === JSON.stringify(recipe)))) return [];
  return result.recipes.map((recipe) => recipe.name);
}

export function claimsCompletedAction(reply: string, existingFavoriteNames: readonly string[] = []): boolean {
  const action = "(?:saved|scheduled|added|removed|purchased|bought|cooked|ate|eaten|consumed|recorded|updated|changed|marked|allocated|reserved|rated|applied|committed)";
  const adverbs = "(?:(?:already|just|now|successfully)\\s+)*";
  const firstPerson = new RegExp(`\\b(?:I(?:'ve| have)?|we(?:'ve| have)?)\\s+${adverbs}${action}\\b`, "i");
  const passive = new RegExp(`\\b(?:has been|have been|had been|is|are|was|were)\\s+${adverbs}${action}\\b`, "i");
  const bareAction = new RegExp(`^\\s*${adverbs}${action}\\b`, "i");
  return reply.split(/(?:[.!?;\n]+|\bbut\b|\bhowever\b)/i).some((clause) => {
    if (firstPerson.test(clause)) return true;
    // Explicit negatives such as "No meals were added" are truthful advisory
    // boundaries. Verb negation ("were not added") also does not match below.
    if (/^\s*(?:no\b|none\b|nothing\b|not\b|never\b)/i.test(clause)) return false;
    // Describing a named favorite already returned unchanged is not a new
    // action. Temporal and first-person claims are never exempted.
    for (const name of existingFavoriteNames) {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const factualFavorite = new RegExp(`^\\s*(?:["'“‘]?)${escaped}(?:["'”’]?)(?:\\s+recipe)?(?:,?\\s+(?:which|that))?\\s+is\\s+marked\\s+as\\s+(?:a\\s+)?favou?rite\\b`, "i");
      clause = clause.replace(factualFavorite, "existing favorite");
    }
    return passive.test(clause) || bareAction.test(clause)
      || /^\s*(?:done|all set|completed)(?:\s|[—–:-]|$)/i.test(clause);
  });
}
