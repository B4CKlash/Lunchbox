import assert from "node:assert/strict";
import test from "node:test";
import { householdStateSchema, type PilotOperation } from "@/lib/contracts";
import { applyPilotCommand, ensurePilot } from "./pilot";
import { directPlacementForRequest } from "./direct-placement";

function fixture() {
  const recipe = { id: "pasta", name: "Tomato pasta", description: "A favorite", servings: 2, minutes: 20, ingredients: [{ ingredientId: "pasta", name: "Pasta", quantity: 200, unit: "g" as const }], steps: ["Cook pasta."] };
  const state = ensurePilot(householdStateSchema.parse({ version: 1, pantry: [], meals: [], preferences: { servings: 2, maxMinutes: 30, prioritizeUseSoon: true } }), "2026-10-12");
  state.pilot.session = { ...state.pilot.session, startDate: "2026-10-12", days: 7, focusSlot: "lunch", focusedRecipeId: recipe.id, candidates: [recipe] };
  const placement = { type: "create_batch" as const, batch: { id: "batch", recipe, prepareDate: "2026-10-13", yield: 2, reservedExtra: 0 }, allocations: ["you", "partner"].map((memberId) => ({ id: `allocation-${memberId}`, memberId, batchId: "batch", date: "2026-10-13", slot: "lunch" as const, portions: 1 })) };
  return { state, placement };
}

test("explicit focused single placement is grounded, atomic, retry-safe and undoable", () => {
  const { state, placement } = fixture();
  const request = "Put this on Tuesday lunch for both of us, one portion each.";
  assert.deepEqual(directPlacementForRequest(state, request, "partner", [placement]), placement);
  assert.deepEqual(directPlacementForRequest(state, "Please schedule Tomato pasta for 2026-10-13.", "you", [placement]), placement);
  const operation: PilotOperation = { type: "receive_planning_result", baseRevision: 0, session: { ...state.pilot.session, messages: [{ id: "reply", role: "assistant", text: "Requested placement", recipes: [], servings: 2 }] }, directPlacement: { jobId: "a4d5c196-38fc-458b-949b-0481c121adab", request, actorMemberId: "partner", change: placement } };
  const command = { id: "direct-once", expectedRevision: 0, operation };
  const applied = applyPilotCommand(state, command);
  assert.equal(applied.state.pilot.allocations.length, 2);
  assert.equal(applied.state.pilot.session.messages[0].id, "reply");
  assert.ok(applied.receipt.inverse);
  assert.equal(applyPilotCommand(applied.state, command).duplicate, true);
  const undone = applyPilotCommand(applied.state, { id: "undo", expectedRevision: 1, operation: { type: "undo", receiptId: applied.receipt.id } }).state;
  assert.equal(undone.pilot.batches.length, 0);
  assert.equal(undone.pilot.session.messages[0].id, "reply");
});

test("ambiguous, broad, modified and collateral placements remain proposals", () => {
  const { state, placement } = fixture();
  for (const request of ["Could you put this on Tuesday?", "Put this on Tuesday and Wednesday", "Put this on Tuesday lunch and buy pasta", "Put another recipe on Tuesday", "Put this on Tuesday lunch for my friend", "Put this on Tuesday lunch, one portion.", "Put this on Tuesday lunch for both of us, one portion.", "[LunchBox context refresh]\nPut this on Tuesday"]) assert.equal(directPlacementForRequest(state, request, "you", [placement]), null);
  const broad = structuredClone(state); broad.pilot.session.days = 14;
  assert.equal(directPlacementForRequest(broad, "Put this on Tuesday", "you", [placement]), null);
  const different = structuredClone(placement); different.batch.recipe.minutes = 10;
  assert.equal(directPlacementForRequest(state, "Put this on Tuesday", "you", [different]), null);
  const extras = structuredClone(placement); extras.batch.reservedExtra = 1; extras.batch.yield = 3;
  assert.equal(directPlacementForRequest(state, "Put this on Tuesday", "you", [extras]), null);
  assert.equal(directPlacementForRequest(state, "Put this on Tuesday", "you", [placement, { type: "set_shop_through", date: "2026-10-20" }]), null);
  const occupied = structuredClone(state); occupied.pilot.coverage.push({ id: "work", memberId: "partner", date: "2026-10-13", slot: "lunch", reason: "work" });
  assert.equal(directPlacementForRequest(occupied, "Put this on Tuesday", "you", [placement]), null);
  const forActor = structuredClone(placement); forActor.batch.yield = 1; forActor.allocations = [forActor.allocations[1]];
  assert.ok(directPlacementForRequest(state, "Put this on Tuesday for me", "partner", [forActor]));
  assert.ok(directPlacementForRequest(state, "Put this on Tuesday for me, one portion.", "partner", [forActor]));
  assert.equal(directPlacementForRequest(state, "Put this on Tuesday for me", "you", [forActor]), null);
  const onePersonScope = structuredClone(state); onePersonScope.pilot.session.memberIds = ["partner"];
  for (const audience of ["both", "both of us", "us"]) assert.equal(directPlacementForRequest(onePersonScope, `Put this on Tuesday for ${audience}`, "partner", [forActor]), null, "explicit household language cannot shrink to the selected calendar scope");
  assert.ok(directPlacementForRequest(onePersonScope, "Put this on Tuesday", "partner", [forActor]), "an omitted audience uses the visible planning scope");
  assert.throws(() => applyPilotCommand(state, { id: "invalid", expectedRevision: 0, operation: { type: "receive_planning_result", baseRevision: 0, session: state.pilot.session, directPlacement: { jobId: "a4d5c196-38fc-458b-949b-0481c121adab", request: "Put this on Tuesday", actorMemberId: "you", change: different } } }));
  assert.equal(state.pilot.batches.length, 0);
});
