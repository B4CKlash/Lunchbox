import type { HouseholdState, ProfileFactChange, ProfileFactValue, ProfileFoodTarget, ProfileScope } from "@/lib/contracts";
import { ingredientCatalog, knownIngredientsFromHousehold, normalizeIngredientName } from "@/features/pantry/ingredients";

/** Identity excludes wording, provenance, and the current value so corrections replace one fact. */
export function profileFactId(value: ProfileFactValue): string {
  if (value.kind === "equipment") return JSON.stringify(["equipment", normalizeIngredientName(value.equipment)]);
  const scope = value.scope.kind === "household" ? "household" : value.scope.memberId;
  const target = value.target.kind === "ingredient" ? value.target.ingredientId
    : value.target.kind === "category" ? value.target.category : normalizeIngredientName(value.target.text);
  return JSON.stringify(["food-dislike", value.scope.kind, scope, value.target.kind, target]);
}

const categories: Record<string, Extract<ProfileFoodTarget, { kind: "category" }>["category"]> = {
  vegetable: "vegetables", vegetables: "vegetables", veggies: "vegetables", fruit: "fruit", fruits: "fruit",
  dairy: "dairy", carbs: "carbs", carbohydrates: "carbs", fats: "fats", protein: "protein",
};
const equipmentAliases: Record<string, string> = {
  oven: "oven", blender: "blender", microwave: "microwave", stovetop: "stovetop", stove: "stovetop", hob: "stovetop",
  "air fryer": "air-fryer", "air-fryer": "air-fryer", "slow cooker": "slow-cooker", crockpot: "slow-cooker",
  "pressure cooker": "pressure-cooker", "instant pot": "pressure-cooker", "rice cooker": "rice-cooker",
  "food processor": "food-processor", "toaster oven": "toaster-oven", grill: "grill", skillet: "skillet",
};
const temporary = /\b(?:tonight|today|tomorrow|yesterday|this (?:week|weekend|month|meal|recipe|time|evening)|for now|right now|at the moment|currently|just|only|maybe|might|sometimes|occasionally|usually|mostly|used to|if|unless|except|when|while|for (?:dinner|lunch|breakfast)|on (?:monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b/i;

function foodTarget(state: HouseholdState, wording: string): ProfileFoodTarget | null {
  const text = normalizeIngredientName(wording.replace(/^(?:the|all) /i, ""));
  // No clauses, quoted assertions, instructions, quantities, or pronouns masquerading as food.
  if (!text || text.length > 80 || /[\d?!:;"“”`]|\b(?:i|we|you|they|he|she|my|our|your|not|because|please|can|could|should|would|prefer|want|avoid|remember|forget|dislike|like|hate|but|love|enjoy|are|is|have|has|for|with|without|then|than|until|before|after)\b/.test(text)) return null;
  if (categories[text]) return { kind: "category", category: categories[text] };
  const known = knownIngredientsFromHousehold(state);
  const catalog = ingredientCatalog.filter((item) => [item.name, ...item.aliases].some((name) => normalizeIngredientName(name) === text));
  const matches = new Map<string, { ingredientId: string; name: string }>();
  for (const item of catalog) matches.set(item.ingredientId, { ingredientId: item.ingredientId, name: item.name });
  for (const item of known) if (normalizeIngredientName(item.name) === text) matches.set(item.ingredientId, item);
  if (matches.size === 1) { const { ingredientId, name } = [...matches.values()][0]; return { kind: "ingredient", ingredientId, name }; }
  return { kind: "text", text };
}

function parseExplicitProfile(state: HouseholdState, message: string, actorMemberId: string) {
  if (!state.pilot?.members.some((member) => member.id === actorMemberId) || !message.trim() || message.length > 2000
    || message.trimStart().startsWith("[LunchBox context refresh]") || /["“”`]|^\s*>|\b(?:transcript|example|quotation|quoted|hypothetical(?:ly)?|pretend|role[- ]?play|fictional)\b|\b(?:quote|repeat|said|says|system|assistant|user):/im.test(message))
    return { changes: [] as ProfileFactChange[], complete: false };
  const changes = new Map<string, ProfileFactChange>();
  let complete = true;
  let recognized = false;
  const clauses = message.trim().split(/(?<=[.!?])\s+|\n+|;\s*|\s+(?:and|but)\s+(?=(?:i|we|our kitchen)\b)/i);
  for (const sourceText of clauses.map((clause) => clause.trim()).filter(Boolean)) {
    // Prefixes must themselves be literal user assertions, not quotations or reported speech.
    const normalized = sourceText.replaceAll("’", "'").replace(/[.!]+$/, "").trim();
    let text = normalized.replace(/^(?:actually,?\s+|from now on,?\s+)/i, "")
      .replace(/^(?:please\s+)?remember(?: that)?\s+/i, "");
    const forget = /^(?:please\s+)?forget(?: that)?\s+/i.test(text);
    if (forget) text = text.replace(/^(?:please\s+)?forget(?: that)?\s+/i, "");
    const unknownEquipment = /^(?:i don't know|i do not know|i'm not sure|i am not sure) (?:whether|if) (?:i|we) have (?:an? |the )?(.+)$/i.exec(text);
    if (!temporary.test(text)) {
      const food = /^(i|we) (?:don't like|do not like|dislike|hate) (.+)$/i.exec(text)
        ?? /^(i|we) (?:no longer dislike|don't dislike|do not dislike|like) (.+?)(?: anymore| any more| now)?$/i.exec(text);
      if (food) {
        const targets = food[2].split(/,\s*|\s+(?:and|or)\s+/i).map((value) => foodTarget(state, value));
        if (!targets.length || targets.length > 5 || targets.some((target) => !target)) { complete = false; continue; }
        recognized = true;
        const scope: ProfileScope = food[1].toLowerCase() === "we" ? { kind: "household" } : { kind: "member", memberId: actorMemberId };
        const disliked = /^(?:i|we) (?:don't like|do not like|dislike|hate) /i.test(text);
        for (const target of targets) {
          const value: ProfileFactValue = { kind: "food-dislike", scope, target: target!, disliked };
          const factId = profileFactId(value);
          const previous = changes.get(factId)?.type === "upsert_profile_fact" || state.pilot.profileFacts.some((fact) => fact.id === factId);
          if (forget) {
            if (previous) changes.set(factId, { type: "remove_profile_fact", factId, sourceText });
          } else changes.set(factId, { type: "upsert_profile_fact", value, sourceText });
        }
        continue;
      }
    }
    const equipment = /^(?:i|we) (have|own|don't have|do not have|no longer have) (?:an? |the )?(.+?)(?: anymore| any more)?$/i.exec(text)
      ?? /^our kitchen (has|doesn't have|does not have) (?:an? |the )?(.+)$/i.exec(text);
    if (unknownEquipment || (equipment && !temporary.test(text))) {
      const name = normalizeIngredientName(unknownEquipment?.[1] ?? equipment![2]);
      const canonical = equipmentAliases[name];
      if (!canonical) { complete = false; continue; }
      recognized = true;
      const availability = unknownEquipment ? "unknown" : /^(?:have|own|has)$/i.test(equipment![1]) ? "available" : "unavailable";
      const value: ProfileFactValue = { kind: "equipment", equipment: canonical, availability };
      const factId = profileFactId(value);
      const previous = changes.get(factId)?.type === "upsert_profile_fact" || state.pilot.profileFacts.some((fact) => fact.id === factId);
      if (forget) {
        if (previous) changes.set(factId, { type: "remove_profile_fact", factId, sourceText });
      } else changes.set(factId, { type: "upsert_profile_fact", value, sourceText });
      continue;
    }
    complete = false;
  }
  return { changes: [...changes.values()].filter((change) => {
    const previous = state.pilot!.profileFacts.find((fact) => fact.id === (change.type === "remove_profile_fact" ? change.factId : profileFactId(change.value)));
    return change.type === "remove_profile_fact" ? Boolean(previous) : !previous || JSON.stringify(previous.value) !== JSON.stringify(change.value);
  }).slice(0, 10), complete: complete && recognized };
}

/** Durable authorization comes only from explicit first-person current-message phrases. */
export function extractExplicitProfileChanges(state: HouseholdState, message: string, actorMemberId: string): ProfileFactChange[] {
  return parseExplicitProfile(state, message, actorMemberId).changes;
}

/** Pure memory requests need no model inference or unsupported action claims. */
export function explicitProfileReply(state: HouseholdState, message: string, actorMemberId: string): string | null {
  const parsed = parseExplicitProfile(state, message, actorMemberId);
  return parsed.complete ? parsed.changes.length
    ? "Understood. Your food and equipment preferences will guide future meal ideas."
    : "Your current food and equipment preferences already reflect that." : null;
}
