import "server-only";
import { Parser } from "htmlparser2";
import { ImportSourceError } from "./safe-url-fetch";

export type SourceRecipe = {
  name: string;
  description: string;
  servings: number | null;
  minutes: number | null;
  ingredientLines: string[];
  steps: string[];
  author?: string;
};

export function plainRecipeText(value: string): string {
  let text = "";
  let ignored = 0;
  const parser = new Parser({
    onopentag(name) {
      if (name === "script" || name === "style") ignored++;
      if (["p", "br", "li", "div"].includes(name) && !ignored) text += "\n";
    },
    ontext(value) { if (!ignored) text += value; },
    onclosetag(name) { if ((name === "script" || name === "style") && ignored) ignored--; },
  }, { decodeEntities: true });
  parser.end(value);
  return text.replace(/[\t ]+/g, " ").replace(/\n\s*\n/g, "\n").trim();
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stepsFrom(value: unknown, depth = 0): string[] {
  if (depth > 10) return [];
  if (typeof value === "string") return plainRecipeText(value).split(/\n+/).filter(Boolean);
  if (Array.isArray(value)) return value.flatMap((item) => stepsFrom(item, depth + 1));
  if (record(value)) {
    if (typeof value.text === "string") return stepsFrom(value.text, depth + 1);
    return stepsFrom(value.itemListElement, depth + 1);
  }
  return [];
}

function duration(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?$/i.exec(value);
  if (!match) return null;
  const minutes = Number(match[1] ?? 0) * 60 + Number(match[2] ?? 0);
  return minutes > 0 && minutes <= 240 ? minutes : null;
}

function servings(value: unknown): number | null {
  if (Array.isArray(value)) {
    const candidates = [...new Set(value.map(servings).filter((item) => item !== null))];
    return candidates.length === 1 ? candidates[0] : null;
  }
  if (typeof value !== "string" && typeof value !== "number") return null;
  const match = /^(?:serves?\s+)?(\d+)(?:\s+(?:servings?|people|persons?))?$/i.exec(String(value).trim());
  const count = match ? Number(match[1]) : 0;
  return count >= 1 && count <= 12 ? count : null;
}

/** Deliberately supports structured public recipes, not arbitrary page scraping. */
export function extractRecipeJsonLd(html: string): SourceRecipe {
  const blocks: string[] = [];
  let current: string | null = null;
  const parser = new Parser({
    onopentag(name, attributes) {
      if (name === "script" && attributes.type?.toLowerCase().split(";")[0].trim() === "application/ld+json") current = "";
    },
    ontext(text) { if (current !== null) current += text; },
    onclosetag(name) {
      if (name === "script" && current !== null) { blocks.push(current); current = null; }
    },
  }, { decodeEntities: true });
  parser.end(html);
  const recipes: Record<string, unknown>[] = [];
  let visits = 0;
  let restricted = false;
  let tooComplex = blocks.length > 50;
  function walk(value: unknown, depth = 0) {
    if (depth > 15 || ++visits > 10000) { tooComplex = true; return; }
    if (Array.isArray(value)) return value.forEach((item) => walk(item, depth + 1));
    if (!record(value)) return;
    if (value.isAccessibleForFree === false || value.isAccessibleForFree === "false") restricted = true;
    const types = Array.isArray(value["@type"]) ? value["@type"] : [value["@type"]];
    if (types.some((type) => typeof type === "string" && /^(?:https?:\/\/schema\.org\/|schema:)?Recipe$/.test(type))) recipes.push(value);
    Object.values(value).forEach((item) => { if (typeof item === "object") walk(item, depth + 1); });
  }
  for (const block of blocks.slice(0, 50)) {
    try { walk(JSON.parse(block)); } catch { /* Other metadata can be malformed. */ }
  }
  if (tooComplex) throw new ImportSourceError("import_recipe", "This page has too much structured data to import reliably. Paste the recipe text instead.");
  if (restricted) throw new ImportSourceError("import_restricted", "This page marks its recipe as restricted. Paste recipe text you can access instead.");
  if (recipes.length !== 1) throw new ImportSourceError("import_recipe", recipes.length
    ? "This page contains multiple recipes. Paste the one you want to import."
    : "This page has no supported recipe data. Paste its ingredients and instructions instead.");
  const recipe = recipes[0];
  if (typeof recipe.name !== "string" || !Array.isArray(recipe.recipeIngredient) ||
      recipe.recipeIngredient.length < 1 || recipe.recipeIngredient.length > 40 ||
      recipe.recipeIngredient.some((line) => typeof line !== "string" || !line.trim() || line.length > 1000)) {
    throw new ImportSourceError("import_recipe", "The page's ingredient data cannot be imported completely. Paste the recipe text instead.");
  }
  const steps = stepsFrom(recipe.recipeInstructions);
  if (steps.length > 20 || steps.some((step) => step.length > 1000))
    throw new ImportSourceError("import_recipe", "This recipe has more instructions than this demo supports. Paste a shorter recipe instead.");
  const prep = duration(recipe.prepTime);
  const cook = duration(recipe.cookTime);
  const combined = prep !== null && cook !== null && prep + cook <= 240 ? prep + cook : null;
  const author = Array.isArray(recipe.author) ? recipe.author[0] : recipe.author;
  const authorName = typeof author === "string" ? author : record(author) && typeof author.name === "string" ? author.name : undefined;
  return {
    name: plainRecipeText(recipe.name).slice(0, 120),
    description: typeof recipe.description === "string" ? plainRecipeText(recipe.description).slice(0, 400) : "",
    servings: servings(recipe.recipeYield),
    minutes: duration(recipe.totalTime) ?? combined,
    ingredientLines: recipe.recipeIngredient.map((line: string) => plainRecipeText(line)),
    steps,
    ...(authorName ? { author: plainRecipeText(authorName).slice(0, 200) } : {}),
  };
}
