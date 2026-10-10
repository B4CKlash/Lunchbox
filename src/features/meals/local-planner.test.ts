import assert from "node:assert/strict";
import test from "node:test";
import { MockLanguageModelV4 } from "ai/test";
import { householdStateSchema, type Recipe } from "@/lib/contracts";
import { ensurePilot, applyPilotCommand } from "@/features/planning/pilot";
import { claimsCompletedAction, reviewLocalPlanningDraft, runLocalPlanning, groundLocalPlanningDraft, resolvePlanningDate, reviewLocalPlanningWire, localPlanningWireSchema, type LocalPlanningDraft } from "./local-planner";

const recipe: Recipe = { id: "favorite", name: "Pasta", description: "Family recipe", servings: 2, minutes: 20, ingredients: [{ ingredientId: "pasta", name: "Dry pasta", quantity: 200, unit: "g" }], steps: ["Cook pasta."], provenance: { source: "import", method: "text" } };
const state = () => ensurePilot(householdStateSchema.parse({ version: 1, pantry: [], meals: [], preferences: { servings: 2, maxMinutes: 30, prioritizeUseSoon: true }, workspace: { recipeBox: [{ recipe, source: "import" }] } }), "2026-10-12");
const draft = (patch: Partial<LocalPlanningDraft> = {}): LocalPlanningDraft => ({ intent: "discuss", reply: "Review this idea.", recipes: [], favoriteRecipeIds: [], coverage: [], batches: [], allocations: [], removeAllocationIds: [], purchases: [], stock: [], cooking: [], consumption: [], feedback: [], shopThrough: null, ...patch });
let index = 0;
const ids = () => `test-${index++}`;

test("explicit stable profile assertions bypass model inference and temporary constraints stay request-only", async () => {
  let calls = 0;
  const model = new MockLanguageModelV4({ doGenerate: async () => { calls++; throw new Error("No inference needed"); } });
  const result = await runLocalPlanning(state(), "I dislike vegetables. We don't have an oven.", { model, verify: false, actorMemberId: "partner" });
  assert.equal(calls, 0);
  assert.equal(result.profileChanges?.length, 2);
  assert.deepEqual(result.operations, []);
  assert.deepEqual(result.recipes, []);
  const food = result.profileChanges?.[0];
  assert.equal(food?.type === "upsert_profile_fact" && food.value.kind === "food-dislike" && food.value.scope.kind === "member" && food.value.scope.memberId, "partner");
  await assert.rejects(runLocalPlanning(state(), "I dislike mushrooms tonight.", { model, verify: false }), /No inference needed/);
  assert.equal(calls, 1);
});

test("local planning feedback is attributed by the application to the current requester", () => {
  const result = reviewLocalPlanningWire(state(), { intent: "feedback", reply: "Review this rating.",
    feedback: [{ recipeId: recipe.id, rating: 5, makeAgain: true, notes: "Good" }] }, "partner", "I rate the pasta five out of five.");
  assert.equal(result.operations[0].type === "record_feedback" && result.operations[0].feedback.memberId, "partner");
});

test("local planning preserves favorite provenance without rewriting it", () => {
  const result = reviewLocalPlanningDraft(state(), draft({ intent: "favorite", favoriteRecipeIds: ["favorite"] }), ids);
  assert.deepEqual(result.recipes, [recipe]);
  assert.deepEqual(result.operations, []);
  assert.throws(() => reviewLocalPlanningDraft(state(), draft({ favoriteRecipeIds: ["invented"] }), ids));
});

test("rejected recipes cannot reappear through favorites, batch references, or renamed copies", () => {
  const current = state();
  current.pilot.session.candidates = [recipe];
  current.pilot.session.rejectedRecipeIds = [recipe.id];
  const before = structuredClone(current);
  assert.throws(() => reviewLocalPlanningDraft(current, draft({ intent: "favorite", favoriteRecipeIds: [recipe.id] }), ids), /not available/);
  const batch = { recipeRef: recipe.id, prepareDate: "2026-10-12", portions: 2, reservedExtra: 2, allocations: [] };
  assert.throws(() => reviewLocalPlanningDraft(current, draft({ intent: "place", batches: [batch] }), ids), /available recipe/);
  assert.equal(localPlanningWireSchema(current, "you").safeParse({ intent: "favorite", reply: "Review this favorite.", favoriteRecipeIds: [recipe.id] }).success, false);
  assert.equal(localPlanningWireSchema(current, "you").safeParse({ intent: "place", reply: "Review this batch.", recipes: [], favoriteRecipeIds: [], coverage: [], batches: [batch], allocations: [], removeAllocationIds: [] }).success, false);
  assert.throws(() => reviewLocalPlanningDraft(current, draft({ intent: "generate", recipes: [{ name: "Renamed pasta", description: "Same recipe", servings: recipe.servings, minutes: recipe.minutes, ingredients: recipe.ingredients.map(({ name, quantity, unit }) => ({ name, quantity, unit })), steps: recipe.steps }] }), ids), /ruled out/);
  assert.deepEqual(current, before);
});

test("model context preserves rejection and supplies all dates in a four-week session", async () => {
  const current = state();
  current.pilot.session.candidates = [recipe];
  current.pilot.session.focusedRecipeId = recipe.id;
  current.pilot.session.rejectedRecipeIds = [recipe.id];
  current.pilot.session.days = 28;
  const before = structuredClone(current);
  const model = new MockLanguageModelV4({ doGenerate: { content: [{ type: "text", text: JSON.stringify({ intent: "discuss", reply: "You could explore a different recipe for this session." }) }], finishReason: { unified: "stop", raw: undefined }, usage: { inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 20, text: 20, reasoning: undefined } }, warnings: [] } });
  await runLocalPlanning(current, "Suggest something different for these four weeks.", { verify: false, model });
  const message = model.doGenerateCalls[0].prompt.find((entry) => entry.role === "user");
  assert.ok(message && Array.isArray(message.content));
  const content = message.content.find((part) => part.type === "text");
  assert.ok(content && content.type === "text");
  const context = JSON.parse(content.text.split("\nCURRENT USER REQUEST")[0]);
  assert.deepEqual(context.savedRecipes, []);
  assert.deepEqual(context.candidates, []);
  assert.deepEqual(context.session.rejectedRecipeIds, [recipe.id]);
  assert.equal(context.session.focusedRecipeId, null);
  assert.equal(context.planningDates.length, 28);
  assert.equal(context.planningDates.at(-1).date, "2026-11-08");
  assert.deepEqual(current, before);
});

test("new local recipes resolve identity independently and remain candidates", () => {
  const current = state();
  const before = structuredClone(current);
  const result = reviewLocalPlanningDraft(current, draft({ intent: "generate", recipes: [{ name: "Fresh pasta", description: "Simple", servings: 2, minutes: 15, ingredients: [{ name: "pasta", quantity: 200, unit: "g" }], steps: ["Cook pasta."] }] }), ids);
  assert.equal(result.recipes[0].ingredients[0].ingredientId, "pasta");
  assert.equal(result.recipes[0].provenance?.source, "ai");
  assert.equal(result.operations.length, 0);
  assert.deepEqual(current, before);
});

test("local batch proposals use one snapshot and domain validation before acceptance", () => {
  const current = state();
  const result = reviewLocalPlanningDraft(current, draft({ intent: "place", batches: [{ recipeRef: "favorite", prepareDate: "2026-10-12", portions: 2, reservedExtra: 0, allocations: [{ memberId: "you", date: "2026-10-13", slot: "lunch", portions: 1 }, { memberId: "partner", date: "2026-10-13", slot: "lunch", portions: 1 }] }] }), ids);
  assert.equal(result.operations[0].type, "create_batch");
  assert.equal(current.pilot.batches.length, 0);
  assert.throws(() => reviewLocalPlanningDraft(current, draft({ batches: [{ recipeRef: "favorite", prepareDate: "2026-10-14", portions: 1, reservedExtra: 0, allocations: [{ memberId: "you", date: "2026-10-13", slot: "lunch", portions: 2 }] }] }), ids));
});

test("unsupported completed action claims and fabricated uncertain quantities are rejected", () => {
  for (const text of ["I scheduled Tuesday lunch.", "I've saved your recipe.", "Your meal has been added."]) {
    assert.equal(claimsCompletedAction(text), true);
    assert.throws(() => reviewLocalPlanningDraft(state(), draft({ reply: text }), ids));
  }
  assert.equal(claimsCompletedAction("I suggest adding this to Tuesday."), false);
  assert.throws(() => reviewLocalPlanningDraft(state(), draft({ stock: [{ name: "pasta", unit: "g", status: "some", quantity: 500 }] }), ids));
});

test("one person's coverage and a purchase become reviewable shared commands", () => {
  const current = state();
  const result = reviewLocalPlanningDraft(current, draft({ coverage: [{ memberId: "you", date: "2026-10-13", slot: "lunch", reason: "work" }], purchases: [{ name: "Dry pasta", quantity: 500, unit: "g" }] }), ids);
  assert.deepEqual(result.operations.map((operation) => operation.type), ["set_coverage", "record_purchase"]);
  assert.equal(current.pantry.length, 0);
  assert.equal(current.pilot.coverage.length, 0);
});


test("cancelled local inference stops before contacting any model", async () => {
  await assert.rejects(runLocalPlanning(state(), "Find a favorite", { verify: false, signal: AbortSignal.abort() }), { name: "AbortError" });
});


test("speaker aliases map to authenticated members and weekday words use date arithmetic", () => {
  const current = state();
  current.pilot.session.startDate = "2026-10-08";
  current.pilot.session.focusDate = "2026-10-08";
  const source = draft({ intent: "coverage", coverage: [{ memberId: "requester", date: "Tuesday", slot: "lunch", reason: "work" }] });
  const grounded = groundLocalPlanningDraft(current, source, "partner");
  assert.equal(grounded.coverage[0].memberId, "partner");
  assert.equal(grounded.coverage[0].date, "2026-10-13");
  assert.equal(resolvePlanningDate("Monday", "2026-10-12"), "2026-10-12");
  assert.equal(resolvePlanningDate("next Monday", "2026-10-12"), "2026-10-19");
  assert.equal(resolvePlanningDate("Friday", "2026-12-31"), "2027-01-01");
  assert.throws(() => groundLocalPlanningDraft(current, { ...source, coverage: [{ ...source.coverage[0], memberId: "you" }] }, "partner"));
  assert.throws(() => groundLocalPlanningDraft(current, source, "outsider"));
});


test("clarification wire results have no mutation surface, including contradictory extra fields", () => {
  const current = state();
  const before = structuredClone(current);
  const result = reviewLocalPlanningWire(current, { intent: "clarify", reply: "Please provide the purchased amount in grams." }, "you");
  assert.deepEqual(result.operations, []);
  assert.deepEqual(result.recipes, []);
  assert.deepEqual(current, before);
  assert.equal(localPlanningWireSchema(current, "you").safeParse({ intent: "clarify", reply: "I need a quantity.", stock: [{ name: "Dry pasta", unit: "g", status: "out", quantity: null }] }).success, false);
  assert.equal(localPlanningWireSchema(current, "you").safeParse({ intent: "coverage", reply: "Review work lunch.", coverage: [], purchases: [{ name: "Dry pasta", unit: "g", quantity: 500 }] }).success, false);
});

test("prepared allocation and consumption wire schemas constrain exact existing entities", () => {
  let current = state();
  current.pantry = [{ id: "pasta", name: "Dry pasta", unit: "g", quantity: 500, location: "Cupboard", useSoon: false, tag: "special" }];
  current = applyPilotCommand(current, { id: "create", expectedRevision: 0, operation: { type: "create_batch", batch: { id: "existing-batch", recipe, prepareDate: "2026-10-12", yield: 4, reservedExtra: 2 }, allocations: [{ id: "existing-lunch", batchId: "existing-batch", memberId: "you", date: "2026-10-13", slot: "lunch", portions: 1 }] } }).state;
  current = applyPilotCommand(current, { id: "cook", expectedRevision: 1, operation: { type: "cook_batch", batchId: "existing-batch", actualPortions: 4, freezerPortions: 2 } }).state;
  const allocation = { batchId: "existing-batch", memberId: "other", date: "Friday", slot: "dinner", portions: 2 };
  const result = reviewLocalPlanningWire(current, { intent: "allocate-prepared", reply: "Review these freezer portions for Friday.", allocations: [allocation] }, "you");
  assert.equal(result.operations.length, 1);
  assert.equal(result.operations[0].type, "allocate");
  if (result.operations[0].type === "allocate") {
    assert.equal(result.operations[0].allocation.batchId, "existing-batch");
    assert.equal(result.operations[0].allocation.memberId, "partner");
    assert.equal(result.operations[0].allocation.date, "2026-10-16");
  }
  assert.equal(localPlanningWireSchema(current, "you").safeParse({ intent: "allocate-prepared", reply: "Review", allocations: [{ ...allocation, batchId: "made-up" }] }).success, false);
  assert.equal(localPlanningWireSchema(current, "you").safeParse({ intent: "consume", reply: "Review", consumption: [{ allocationId: "made-up", fromFreezer: false }] }).success, false);
  const eaten = reviewLocalPlanningWire(current, { intent: "consume", reply: "Review recording this meal as eaten.", consumption: [{ allocationId: "existing-lunch", fromFreezer: false }] }, "you");
  assert.equal(eaten.operations[0].type, "consume");
  assert.equal(current.pilot.prepared[0].consumed, 0);
});


test("latest make-again feedback retrieves cooked recipe snapshots with their original provenance", () => {
  const current = state();
  current.workspace.recipeBox = [];
  current.pilot.batches = [{ id: "cooked", recipe, prepareDate: "2026-10-12", yield: 2, reservedExtra: 2, status: "cooked" }];
  current.pilot.prepared = [{ batchId: "cooked", produced: 2, consumed: 0, freezerPortions: 2, ingredientUses: recipe.ingredients }];
  current.pilot.feedback = [{ id: "rating", recipeId: recipe.id, rating: 5, makeAgain: true, notes: "Keep this one" }];
  const result = reviewLocalPlanningWire(current, { intent: "favorite", reply: "Here is the recipe you marked make again.", favoriteRecipeIds: [recipe.id] }, "you");
  assert.deepEqual(result.recipes, [recipe]);
  assert.deepEqual(result.recipes[0].provenance, recipe.provenance);
  current.pilot.feedback.push({ id: "later", recipeId: recipe.id, rating: 1, makeAgain: false, notes: "Changed my mind" });
  assert.throws(() => reviewLocalPlanningWire(current, { intent: "favorite", reply: "Review", favoriteRecipeIds: [recipe.id] }, "you"));
});


test("date arguments are grounded without restricting broad planning to the focused occasion", () => {
  const current = state();
  current.pilot.session.startDate = "2026-10-08";
  current.pilot.session.focusDate = "2026-10-08";
  const coverage = { intent: "coverage", reply: "Review work lunch.", coverage: [{ memberId: "requester", date: "2026-10-20", slot: "lunch", reason: "work" }] };
  assert.equal(localPlanningWireSchema(current, "partner", "Only my Tuesday lunch is covered by work.").safeParse(coverage).success, false);
  const grounded = reviewLocalPlanningWire(current, { ...coverage, coverage: [{ ...coverage.coverage[0], date: "Tuesday" }] }, "partner", "Only my Tuesday lunch is covered by work.");
  assert.equal(grounded.operations[0].type, "set_coverage");
  if (grounded.operations[0].type === "set_coverage") assert.equal(grounded.operations[0].coverage.date, "2026-10-13");
  assert.equal(localPlanningWireSchema(current, "you", "Change shop through to October 23, 2026.").safeParse({ intent: "horizon", reply: "Review", shopThrough: "2026-10-23" }).success, true);
  const planned = { intent: "place", reply: "Review the week.", recipes: [], favoriteRecipeIds: [], coverage: [], allocations: [], removeAllocationIds: [], batches: [{ recipeRef: recipe.id, prepareDate: "2026-10-08", portions: 2, reservedExtra: 0, allocations: [{ memberId: "requester", date: "2026-10-09", slot: "lunch", portions: 1 }, { memberId: "other", date: "2026-10-10", slot: "dinner", portions: 1 }] }] };
  assert.equal(localPlanningWireSchema(current, "you", "Fill this week from the favorite.").safeParse(planned).success, true);
  assert.equal(localPlanningWireSchema(current, "you", "Schedule a meal tomorrow.").safeParse(planned).success, false);
});

test("new multi-occasion batches cannot accidentally use unavailable existing-batch allocations", () => {
  const current = state();
  const request = "Prepare a batch Monday for dinner and Tuesday lunch.";
  const planned = { intent: "place", reply: "Review this batch plan.", recipes: [], favoriteRecipeIds: [], coverage: [], allocations: [], removeAllocationIds: [], batches: [{ recipeRef: recipe.id, prepareDate: "Monday", portions: 2, reservedExtra: 0, allocations: [{ memberId: "requester", date: "Monday", slot: "dinner", portions: 1 }, { memberId: "other", date: "Tuesday", slot: "lunch", portions: 1 }] }] };
  const result = reviewLocalPlanningWire(current, planned, "you", request);
  assert.equal(result.operations.length, 1);
  assert.equal(result.operations[0].type, "create_batch");
  assert.equal(localPlanningWireSchema(current, "you", request).safeParse({ ...planned, allocations: [{ batchId: "unavailable", memberId: "requester", date: "Monday", slot: "dinner", portions: 1 }] }).success, false);
  assert.equal(current.pilot.batches.length, 0);
});

test("qualitative stock grammar cannot contain a numeric amount", () => {
  const current = state();
  const qualitative = { intent: "stock", reply: "Review this stock correction.", stock: [{ name: "Spinach", unit: "g", status: "some", quantity: null }] };
  assert.equal(localPlanningWireSchema(current, "you").safeParse(qualitative).success, true);
  assert.equal(localPlanningWireSchema(current, "you").safeParse({ ...qualitative, stock: [{ ...qualitative.stock[0], quantity: 500 }] }).success, false);
  assert.equal(localPlanningWireSchema(current, "you").safeParse({ ...qualitative, stock: [{ ...qualitative.stock[0], status: "exact" }] }).success, false);
  const result = reviewLocalPlanningWire(current, qualitative, "you");
  assert.equal(result.operations[0].type, "set_stock");
  if (result.operations[0].type === "set_stock") assert.equal(result.operations[0].stock.quantity, undefined);
});

test("local inference masks historical quantities only when current stock overrides them", async () => {
  const current = state();
  current.pantry = [{ id: "spinach", name: "Spinach", unit: "g", quantity: 913, location: "Fridge", useSoon: true, tag: "special" }];
  const output = { content: [{ type: "text" as const, text: JSON.stringify({ intent: "discuss", reply: "Review the stock check before shopping." }) }], finishReason: { unified: "stop" as const, raw: undefined }, usage: { inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 20, text: 20, reasoning: undefined } }, warnings: [] };
  const capture = async () => {
    const model = new MockLanguageModelV4({ doGenerate: output });
    await runLocalPlanning(current, "Explain the current stock.", { verify: false, model });
    const message = model.doGenerateCalls[0].prompt.find((entry) => entry.role === "user");
    assert.ok(message && Array.isArray(message.content));
    const content = message.content.find((part) => part.type === "text");
    assert.ok(content && content.type === "text");
    return JSON.parse(content.text.split("\nCURRENT USER REQUEST")[0]);
  };
  const exact = await capture();
  assert.equal(JSON.stringify(exact.pantry), JSON.stringify(ensurePilot(current).pantry));
  current.pilot.stock = [{ ingredientId: "spinach", name: "Spinach", unit: "g", status: "some" }, { ingredientId: "farm-chard", name: "Farm chard", unit: "g", status: "low" }];
  const uncertain = await capture();
  assert.equal(uncertain.pantry[0].quantity, undefined);
  assert.equal(uncertain.pantry[0].quantityKnown, false);
  assert.equal(uncertain.pantry[0].status, "some");
  assert.ok(uncertain.knownIngredients.some((entry: { ingredientId: string }) => entry.ingredientId === "farm-chard"));
  assert.equal(JSON.stringify(uncertain).includes("913"), false);
  assert.equal(current.pantry[0].quantity, 913);
});

test("attempt reporting distinguishes a blocked completion claim from the corrected accepted reply", async () => {
  const response = (reply: string) => ({ content: [{ type: "text" as const, text: JSON.stringify({ intent: "discuss", reply }) }], finishReason: { unified: "stop" as const, raw: undefined }, usage: { inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 20, text: 20, reasoning: undefined } }, warnings: [] });
  const model = new MockLanguageModelV4({ doGenerate: [response("Scheduled all your meals."), response("Review the proposed meals before applying them.")] });
  const attempts: boolean[] = [];
  const result = await runLocalPlanning(state(), "Discuss the plan.", { model, verify: false, onGeneratedAttempt: ({ unsupportedClaim }) => attempts.push(unsupportedClaim) });
  assert.deepEqual(attempts, [true, false]);
  assert.equal(claimsCompletedAction(result.reply), false);
  assert.equal(result.operations.length, 0);
});

test("an exact copied or scaled recipe preserves identity while real content changes remain new", () => {
  const candidate = { name: recipe.name, description: recipe.description, servings: 6, minutes: recipe.minutes, ingredients: [{ name: "Dry pasta", quantity: 600, unit: "g" as const }], steps: recipe.steps };
  const input = draft({ intent: "place", recipes: [candidate], favoriteRecipeIds: [recipe.id], batches: [{ recipeRef: "new:0", prepareDate: "2026-10-12", portions: 6, reservedExtra: 6, allocations: [] }] });
  const result = reviewLocalPlanningDraft(state(), input, ids);
  assert.deepEqual(result.recipes, [recipe]);
  assert.equal(result.operations[0].type, "create_batch");
  if (result.operations[0].type === "create_batch") assert.deepEqual(result.operations[0].batch.recipe, recipe);
  for (const changed of [
    { ...candidate, minutes: 15 },
    { ...candidate, steps: ["Toast the pasta before cooking it."] },
    { ...candidate, ingredients: [{ ...candidate.ingredients[0], quantity: 601 }] },
    { ...candidate, ingredients: [{ ...candidate.ingredients[0], unit: "ml" as const }] },
  ]) {
    const revised = reviewLocalPlanningDraft(state(), draft({ intent: "revise", recipes: [changed] }), ids);
    assert.notEqual(revised.recipes[0].id, recipe.id);
    assert.equal(revised.recipes[0].provenance?.source, "ai");
  }
});

test("action intents need real payloads and unavailable entity actions are absent", () => {
  const current = state();
  const schema = localPlanningWireSchema(current, "you");
  for (const empty of [
    { intent: "place", recipes: [], favoriteRecipeIds: [], coverage: [], batches: [], allocations: [], removeAllocationIds: [] },
    { intent: "purchase", purchases: [] }, { intent: "stock", stock: [] },
    { intent: "favorite", favoriteRecipeIds: [] }, { intent: "coverage", coverage: [] },
    { intent: "generate", recipes: [] }, { intent: "feedback", feedback: [] },
    { intent: "horizon", shopThrough: null },
    { intent: "cook", cooking: [{ batchId: "unavailable", actualPortions: 6, freezerPortions: 0 }] },
    { intent: "allocate-prepared", allocations: [] },
    { intent: "consume", consumption: [{ allocationId: "unavailable", fromFreezer: false }] },
  ]) assert.equal(schema.safeParse({ reply: "Review this proposal.", ...empty }).success, false, empty.intent);
  assert.equal(schema.safeParse({ intent: "clarify", reply: "Which batch did you cook?" }).success, true);
});

test("conversation author references stay with the original person after another member speaks", async () => {
  const current = state();
  current.pilot.session.messages = [
    { id: "earlier-owner", role: "user", authorMemberId: "you", text: "My work covers lunch.", recipes: [], servings: 2 },
    { id: "earlier-partner", role: "user", authorMemberId: "partner", text: "I need dinner.", recipes: [], servings: 2 },
    { id: "legacy", role: "user", text: "Consider pasta.", recipes: [], servings: 2 },
  ];
  const output = { content: [{ type: "text" as const, text: JSON.stringify({ intent: "discuss", reply: "Review the remaining meals." }) }], finishReason: { unified: "stop" as const, raw: undefined }, usage: { inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 20, text: 20, reasoning: undefined } }, warnings: [] };
  const model = new MockLanguageModelV4({ doGenerate: output });
  await runLocalPlanning(current, "What remains for me?", { model, verify: false, actorMemberId: "partner" });
  const prompt = model.doGenerateCalls[0].prompt;
  const user = prompt.find((message) => message.role === "user");
  assert.ok(user && Array.isArray(user.content));
  const text = user.content.find((part) => part.type === "text");
  assert.ok(text?.type === "text");
  const sent = JSON.parse(text.text.split("\nCURRENT USER REQUEST")[0]);
  assert.deepEqual(sent.session.messages.map((message: { author?: string }) => message.author), ["other", "requester", undefined]);
  assert.equal(sent.actorMemberId, "requester");
  assert.match(JSON.stringify(prompt.find((message) => message.role === "system")), /within that past message refer to its author/);
});

test("read-only favorite retrieval may describe proven existing facts without permitting new action claims", () => {
  const current = state();
  const result = reviewLocalPlanningWire(current, { intent: "favorite", favoriteRecipeIds: [recipe.id], reply: "Pasta is marked as a favorite." }, "you");
  assert.deepEqual(result.recipes, [recipe]);
  assert.throws(() => reviewLocalPlanningWire(current, { intent: "favorite", favoriteRecipeIds: [recipe.id], reply: "I marked Pasta as a favorite." }, "you"));
  assert.throws(() => reviewLocalPlanningWire(current, { intent: "feedback", feedback: [{ recipeId: recipe.id, rating: 5, makeAgain: true, notes: "Good" }], reply: "Pasta is marked as a favorite." }, "you"));
});
