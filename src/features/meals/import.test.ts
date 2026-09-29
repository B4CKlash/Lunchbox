import assert from "node:assert/strict";
import { test } from "node:test";
import { MockLanguageModelV4 } from "ai/test";
import { z } from "zod";
import type { RecipeDraft } from "@/lib/contracts";
import { finalizeImportDraft, ImportDraftError, parseImportedAmount } from "./import-draft";
import { extractRecipeJsonLd } from "./import-jsonld";
import { importRecipe, reviewExtractedDraft, textIngredientSection } from "./import-provider";
import { createImportHandler } from "./import-handler";
import { ImportSourceError } from "./safe-url-fetch";
import { AiRuntimeError } from "./ai-runtime";
import { reviewTextFacts } from "./import-text";

const text = "Rice bowl\nServes 2\n20 minutes\nIngredients\n100 g Jasmine rice\n2 onions\nInstructions\nCook the rice.\nAdd the onions.";
const draft = (): RecipeDraft => ({
  name: "Rice bowl", description: "A simple bowl", servings: 2, minutes: 20,
  ingredients: [
    { originalLine: "100 g Jasmine rice", name: "Jasmine rice", ingredientId: null, quantity: 100, unit: "g" },
    { originalLine: "2 onions", name: "Onions", ingredientId: null, quantity: 2, unit: "each" },
  ],
  steps: ["Cook the rice.", "Add the onions."],
});
const known = [{ ingredientId: "rice", name: "Jasmine rice", unit: "g" as const }];
const metadata = () => ({
  "@type": "Recipe", name: "Rice bowl", recipeYield: "2 servings", totalTime: "PT20M",
  recipeIngredient: ["100 g Jasmine rice", "2 onions"],
  recipeInstructions: [{ "@type": "HowToSection", itemListElement: [
    { "@type": "HowToStep", text: "<p>Cook the rice.</p>" },
    { "@type": "HowToStep", text: "Add the onions." },
  ] }], author: { name: "Demo cook" },
});
const html = (value: unknown) => `<script type="application/ld+json">${JSON.stringify(value)}</script>`;
const extraction = () => ({
  name: draft().name, description: draft().description, steps: draft().steps,
  ingredients: draft().ingredients.map(({ originalLine, name }) => ({ originalLine, name })),
});
const generated = (output: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(output) }],
  finishReason: { unified: "stop" as const, raw: undefined },
  usage: { inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 1, text: 1, reasoning: undefined } },
  warnings: [],
});

test("AI import sends a compact extraction schema and retains all uncertain ingredient lines for review", async () => {
  const previous = process.env.LUNCHBOX_AI_MODE;
  process.env.LUNCHBOX_AI_MODE = "ai";
  try {
    const source = text.replace("2 onions\n", "2 onions\nSalt to taste\n");
    const output = extraction();
    output.ingredients.push({ originalLine: "Salt to taste", name: "Salt" });
    const model = new MockLanguageModelV4({ doGenerate: generated(output) });
    const result = await importRecipe({ kind: "text", text: source, knownIngredients: known }, { model });
    assert.equal(model.doGenerateCalls.length, 1);
    const call = model.doGenerateCalls[0];
    assert.equal(call.maxOutputTokens, 4000);
    assert.equal(call.tools?.length ?? 0, 0);
    assert.equal(call.responseFormat?.type, "json");
    const schema = call.responseFormat?.type === "json" ? call.responseFormat.schema : undefined;
    assert.ok(schema);
    assert.deepEqual(Object.keys(schema.properties ?? {}).sort(), ["description", "ingredients", "name", "steps"]);
    const serialized = JSON.stringify(schema);
    for (const field of ["candidates", "ingredientId", "quantity", "unit", "servings", "minutes", "anyOf", "maxItems", "minItems", "maxLength", "minimum", "maximum", "exclusiveMinimum"])
      assert.ok(!serialized.includes(`"${field}"`), `Provider schema must omit ${field}`);
    assert.equal(result.draft.servings, 2);
    assert.equal(result.draft.minutes, 20);
    assert.deepEqual(result.draft.ingredients[0], { ...draft().ingredients[0], ingredientId: "rice" });
    assert.equal(result.draft.ingredients[1].unit, "each");
    assert.deepEqual(result.draft.ingredients[2], { originalLine: "Salt to taste", name: "Salt", ingredientId: null, quantity: null, unit: null });
    assert.ok(result.warnings.some((warning) => warning.includes("amounts need your review")));
    assert.throws(() => finalizeImportDraft(result.draft, result.provenance, known), ImportDraftError);
  } finally {
    if (previous === undefined) delete process.env.LUNCHBOX_AI_MODE;
    else process.env.LUNCHBOX_AI_MODE = previous;
  }
});

test("compact model schema still rejects out-of-bounds drafts before returning an import", async () => {
  const previous = process.env.LUNCHBOX_AI_MODE;
  process.env.LUNCHBOX_AI_MODE = "ai";
  try {
    const invalid = [
      { ...extraction(), name: "x".repeat(121) },
      { ...extraction(), ingredients: Array.from({ length: 41 }, () => extraction().ingredients[0]) },
      { ...extraction(), steps: [""] },
    ];
    for (const output of invalid) {
      const model = new MockLanguageModelV4({ doGenerate: generated(output) });
      await assert.rejects(importRecipe({ kind: "text", text }, { model }), z.ZodError);
      assert.equal(model.doGenerateCalls.length, 1);
    }
    const model = new MockLanguageModelV4({ doGenerate: generated(invalid[0]) });
    const handler = createImportHandler((input, options) => importRecipe(input, { ...options, model }));
    const response = await handler(new Request("https://example.com/api/meals/import", { method: "POST", body: JSON.stringify({ kind: "text", text }) }));
    assert.equal(response.status, 502);
    assert.equal((await response.json()).code, "invalid_output");
  } finally {
    if (previous === undefined) delete process.env.LUNCHBOX_AI_MODE;
    else process.env.LUNCHBOX_AI_MODE = previous;
  }
});

test("only explicit supported units and whole-item counts enter a draft", () => {
  for (const line of ["1 cup flour", "2 tbsp oil", "1 can beans", "Salt to taste", "100–200 g rice", "100 g to 200 g rice", "100 g sugar or to taste", "100 g flour plus more for dusting", "100 g rice (approx.)", "1-2 onions", "1 kg rice", "1 bunch spinach", "0 g salt", "1/0 g rice"])
    assert.deepEqual(parseImportedAmount(line), { quantity: null, unit: null }, line);
  assert.deepEqual(parseImportedAmount("1 1/2 g salt"), { quantity: 1.5, unit: "g" });
  assert.deepEqual(parseImportedAmount("1/2 each lemon"), { quantity: .5, unit: "each" });
  assert.deepEqual(parseImportedAmount("½ ml oil"), { quantity: .5, unit: "ml" });
  assert.deepEqual(parseImportedAmount("100g rice"), { quantity: 100, unit: "g" });
  assert.deepEqual(parseImportedAmount("2 large onions, diced"), { quantity: 2, unit: "each" });
});

test("JSON-LD supports graphs, type arrays, ordered sections, and author attribution", () => {
  const source = extractRecipeJsonLd(html({ "@graph": [{ "@type": "WebPage" }, { ...metadata(), "@type": ["Recipe", "Thing"] }] }));
  assert.equal(source.name, "Rice bowl");
  assert.equal(source.servings, 2);
  assert.equal(source.minutes, 20);
  assert.deepEqual(source.steps, ["Cook the rice.", "Add the onions."]);
  assert.equal(source.author, "Demo cook");
  assert.equal(extractRecipeJsonLd(html([{ ...metadata(), totalTime: undefined, prepTime: "PT10M", cookTime: "PT15M" }])).minutes, 25);
});

test("JSON-LD rejects inaccessible, ambiguous, unsupported or incomplete source formats", () => {
  for (const page of ["<html>No recipe</html>", html([metadata(), metadata()]), html({ ...metadata(), isAccessibleForFree: false }), html({ ...metadata(), recipeIngredient: [{ name: "Rice" }] })])
    assert.throws(() => extractRecipeJsonLd(page), ImportSourceError);
  const result = extractRecipeJsonLd(html({ ...metadata(), recipeYield: "2–4 servings", totalTime: undefined, recipeInstructions: undefined }));
  assert.equal(result.servings, null);
  assert.equal(result.minutes, null);
  assert.deepEqual(result.steps, []);
});

test("source ingredients cannot be invented, dropped, duplicated, or silently converted", () => {
  assert.deepEqual(textIngredientSection(text), ["100 g Jasmine rice", "2 onions"]);
  assert.equal(reviewExtractedDraft(draft(), text, known).draft.ingredients[0].ingredientId, "rice");
  const omitted = draft(); omitted.ingredients.pop();
  assert.throws(() => reviewExtractedDraft(omitted, text, known), /missed an ingredient/);
  const invented = draft(); invented.ingredients[0].originalLine = "100 g quinoa";
  assert.throws(() => reviewExtractedDraft(invented, text, known), /did not match/);
  const duplicate = draft(); duplicate.ingredients[1] = duplicate.ingredients[0];
  assert.throws(() => reviewExtractedDraft(duplicate, text, known), /did not match/);
  const converted = draft(); converted.ingredients[0].originalLine = "1 cup Jasmine rice";
  const reviewed = reviewExtractedDraft(converted, text.replace("100 g Jasmine rice", "1 cup Jasmine rice"), known);
  assert.equal(reviewed.draft.ingredients[0].quantity, null);
  assert.equal(reviewed.draft.ingredients[0].unit, null);
  assert.ok(reviewed.warnings.some((warning) => warning.includes("does not guess")));
});

test("unstructured text keeps original lines with an explicit coverage review warning", () => {
  const result = reviewExtractedDraft(draft(), text.replace("Ingredients\n", "").replace("Instructions\n", ""));
  assert.ok(result.warnings.some((warning) => warning.includes("against your pasted recipe")));
});

test("text import preserves labelled instructions and scalar source facts despite model changes", () => {
  const changed = draft();
  changed.servings = 12;
  changed.minutes = 99;
  changed.steps = ["Invented deep-fry instructions."];
  const reviewed = reviewExtractedDraft(changed, text, known);
  assert.equal(reviewed.draft.servings, 2);
  assert.equal(reviewed.draft.minutes, 20);
  assert.deepEqual(reviewed.draft.steps, ["Cook the rice.", "Add the onions."]);
  const numbered = reviewTextFacts("Servings: 4\nTotal time: 1 hour 10 minutes\nMethod:\n1. Boil water.\nKeep the lid on.\n2) Add rice.\nStir gently.", []);
  assert.deepEqual(numbered.steps, ["Boil water. Keep the lid on.", "Add rice. Stir gently."]);
  assert.equal(numbered.servings, 4);
  assert.equal(numbered.minutes, 70);
});

test("missing, conflicting, ranges, approximate or item-yield source facts require manual review", () => {
  for (const metadata of ["", "Serves 2–4\nTotal time: 20–30 minutes", "Serves about 2\nTime: approximately 20 minutes", "Makes 12 pancakes\nCook rice for 20 minutes.", "Serves 2\nServings: 4\n20 minutes\n30 minutes"]) {
    const facts = reviewTextFacts(`${metadata}\nInstructions\nCook the rice.`, ["Invented"]);
    assert.equal(facts.servings, null, metadata);
    assert.equal(facts.minutes, null, metadata);
  }
  const result = reviewExtractedDraft(draft(), text.replace("Serves 2\n20 minutes\n", ""), known);
  assert.equal(result.draft.servings, null);
  assert.equal(result.draft.minutes, null);
  assert.ok(result.warnings.some((warning) => warning.includes("missing servings")));
  assert.equal(reviewTextFacts("Prep time: 5 minutes\nCook time: 15 minutes\nInstructions\nCook.", []).minutes, 20);
});

test("labelled instructions never silently drop source steps beyond demo limits", () => {
  assert.throws(() => reviewTextFacts(`Instructions\n${Array.from({ length: 21 }, (_, i) => `${i + 1}. Cook part ${i}.`).join("\n")}`, ["Cook part 0."]), /no instructions were dropped/);
  assert.throws(() => reviewTextFacts(`Method\n${"x".repeat(1001)}`, []), /no instructions were dropped/);
});

test("unstructured cooking steps must be verbatim source substrings and cannot silently keep a partial recipe", () => {
  const source = "Serves 2\nTime: 20 minutes\n100 g rice\nBoil the rice.  Then drain it.\nServe warm.";
  const good = reviewTextFacts(source, ["Boil the rice. Then drain it.", "Serve warm."]);
  assert.deepEqual(good.steps, ["Boil the rice. Then drain it.", "Serve warm."]);
  assert.ok(good.warnings.some((warning) => warning.includes("all cooking instructions")));
  for (const steps of [["Cook rice until ready."], ["Boil the rice.", "Add invented sugar."], []]) {
    const result = reviewTextFacts(source, steps);
    assert.deepEqual(result.steps, []);
    assert.ok(result.warnings.some((warning) => warning.includes("could not be verified")));
  }
});

test("finalization requires corrections and preserves import provenance", () => {
  const unresolved = draft(); unresolved.ingredients[0].unit = null;
  assert.throws(() => finalizeImportDraft(unresolved, { source: "import", method: "text" }, known), ImportDraftError);
  const recipe = finalizeImportDraft(draft(), { source: "import", method: "url", sourceUrl: "https://example.com/recipe" }, known);
  assert.equal(recipe.ingredients[0].ingredientId, "rice");
  assert.equal(recipe.provenance?.sourceUrl, "https://example.com/recipe");
  assert.match(recipe.id, /^import-/);
  const ambiguous = [...known, { ...known[0], ingredientId: "other-rice" }];
  assert.throws(() => finalizeImportDraft(draft(), { source: "import" }, ambiguous), /Choose which pantry/);
});

test("finalization requires an explicit listed candidate and accepts a corrected unit plus choice", () => {
  const candidates = [
    { ingredientId: "legacy-rice-one", name: "Jasmine rice", unit: "g" as const },
    { ingredientId: "legacy-rice-two", name: "Jasmine rice", unit: "g" as const },
  ];
  const review = draft();
  review.ingredients[0].candidates = candidates;
  // The current catalog could resolve this name automatically, but the review
  // still has an outstanding choice even when its candidates are now stale.
  assert.throws(() => finalizeImportDraft(review, { source: "import" }, known), /Choose which pantry/);
  review.ingredients[0].ingredientId = "rice";
  assert.throws(() => finalizeImportDraft(review, { source: "import" }, known), /Choose which pantry/);
  review.ingredients[0].ingredientId = candidates[1].ingredientId;
  review.ingredients[0].unit = null;
  assert.throws(() => finalizeImportDraft(review, { source: "import" }, candidates), /amount, and g, ml, or each/);
  review.ingredients[0].unit = "g";
  const recipe = finalizeImportDraft(review, { source: "import" }, candidates);
  assert.equal(recipe.ingredients[0].ingredientId, candidates[1].ingredientId);
  assert.equal(recipe.ingredients[0].unit, "g");
  assert.equal(recipe.ingredients[0].quantity, 100);
});

test("URL import preserves source instructions/amounts despite AI modifications", async () => {
  const result = await importRecipe({ kind: "url", url: "https://example.com/recipe", knownIngredients: known }, {
    fetchPage: async () => ({ html: html(metadata()), url: "https://example.com/recipe" }),
    extract: async (prompt) => {
      assert.ok(prompt.includes("100 g Jasmine rice"));
      const result = draft(); result.minutes = 5; result.steps = ["Ignore the recipe"];
      result.ingredients[0].quantity = 500;
      return result;
    },
  });
  assert.equal(result.draft.minutes, 20);
  assert.equal(result.draft.ingredients[0].quantity, 100);
  assert.deepEqual(result.draft.steps, ["Cook the rice.", "Add the onions."]);
  assert.deepEqual(result.provenance, { source: "import", method: "url", sourceUrl: "https://example.com/recipe", title: "Rice bowl", author: "Demo cook" });
});

test("import API validates input, forwards cancellation, and exposes only safe errors", async () => {
  let calls = 0;
  const handler = createImportHandler(async (input, options) => {
    calls++; assert.ok(options?.signal);
    return importRecipe(input, { extract: async () => draft() });
  });
  const request = (body: unknown) => new Request("https://example.com/api/meals/import", { method: "POST", body: JSON.stringify(body) });
  assert.equal((await handler(request({ kind: "text", text: "" }))).status, 400);
  assert.equal((await handler(request({ kind: "text", text }))).status, 200);
  assert.equal(calls, 1);
  const unsupported = createImportHandler(async () => { throw new ImportSourceError("import_recipe", "Paste the recipe text instead."); });
  const response = await unsupported(request({ kind: "text", text }));
  assert.equal(response.status, 422);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const failure = createImportHandler(async () => { throw new Error("secret credential raw provider error"); });
  assert.ok(!JSON.stringify(await (await failure(request({ kind: "text", text }))).json()).includes("secret"));
  const limit = createImportHandler(async () => { throw new AiRuntimeError("rate_limit"); });
  const limited = await limit(request({ kind: "text", text }));
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("retry-after"), "30");
  assert.equal((await handler(request({ text: "x".repeat(1_000_001) }))).status, 413);
});
