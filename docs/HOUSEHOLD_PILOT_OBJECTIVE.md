<proposed_plan>
# LunchBox: collaborative meal planning with a resident AI agent

## 1. The experience we’re building

**Meal planning is a human–agent conversation, supported by a visible calendar, recipe cards, and a live grocery preview.**

You enter a planning workspace and describe the situation:

> “We need lunches through Thursday. Work covers my Tuesday lunch, we’re out Friday, and I want to use the vegetables we brought home.”

The agent identifies the gaps, retrieves favorites, creates new recipes, and suggests how cooking batches could cover several occasions. You steer the conversation until the choices fit.

The system has three connected parts:

| Part | Responsibility |
|---|---|
| **Kitchen knowledge** | Inventory, prepared food, preferences, equipment, favorites, and feedback |
| **Collaborative planning** | Conversation, recipe exploration, meal coverage, and portion allocation |
| **Shopping and cooking** | Grocery needs, purchases, ingredient use, leftovers, and freezer meals |

The first release supports you and your wife using the same household from separate devices. Success means completing a real planning, shopping, and cooking cycle without maintaining a parallel meal plan elsewhere.

## 2. The collaborative planning workspace

**A persistent planning session**

The main planning screen combines conversation, the calendar, and contextual recipe cards. On mobile, these become coordinated views that retain the same focus.

A session remembers:

- Which dates and people you are planning for.
- Covered meals and remaining gaps.
- Current food preferences, effort limits, and available equipment.
- Recipes under discussion, alternatives you rejected, and choices already made.
- Relevant pantry items, prepared meals, and grocery implications.

Leaving the workspace preserves the session. Returning refreshes it against the latest household state.

**An agent that reacts while you plan**

The agent responds to conversation and meaningful planning interactions: selecting a meal gap, discussing a recipe, changing a constraint, or adding relevant inventory.

Examples include:

- “Find something from our favorites for Wednesday.”
- “Dream up something different with these vegetables.”
- “Could one cooking session cover dinner and two lunches?”
- “Make this quicker.”
- “Change the cuisine but keep the same ingredients.”
- “Reserve two portions for the freezer.”

Selecting a recipe gives the conversation a shared focus. Suggestions explain what they cover and what additional ingredients they require.

Relevant interactions can refresh suggestions during the active session. Requests are coalesced and stale responses discarded; there is no continuous generation timer.

**Clear action boundaries**

- Discussing or revising a recipe creates a candidate.
- Choosing a card or saying “put this on Tuesday” applies that specific calendar change.
- A broad request to fill several days produces a reviewable proposal.
- Applied changes show a receipt and offer undo.
- Inventory and feedback updates inform future suggestions; they do not independently rearrange existing meals.

Planning sessions hold conversation and candidates. **There is one live calendar, without a separate committed-week copy or a weekly lock.**

## 3. Household behavior and data

**Coverage and cooking batches**

Track meal needs per person. A work lunch can cover you while leaving your wife’s lunch open.

Separate preparing food from eating it:

- A cooking batch holds a recipe snapshot, preparation date, and intended yield.
- Meal allocations distribute portions across people and dates.
- One six-portion pasta batch can cover three two-person occasions, with its ingredients counted once.
- Allocations cannot exceed available portions or precede preparation.
- Removing an allocation reduces an uncooked batch’s yield, except for explicitly reserved extra portions.
- Cooked food remains available independently of its calendar allocations.

Start with seven visible days and lunch/dinner slots. Allow other slots and additional weeks without changing existing entries or shopping scope.

**Flexible inventory**

Support exact amounts when available and qualitative states such as “some,” “low,” or “out.” Optional detail includes use-soon flags, dates, purchase lots, and farm/source notes.

Preserve canonical ingredient identity and supported units. Never turn uncertain stock into invented quantities.

Shopping distinguishes:

- **Calculated shortages**, where quantities are known.
- **Stock checks**, where the household needs to confirm sufficiency.

“We have enough for this” resolves the relevant requirement without fabricating a pantry balance. Material changes reopen that check.

**Shopping, cooking, and prepared food**

Shopping uses an editable “shop through” date and upcoming uncooked preparation batches. Calendar browsing does not change this horizon.

- Combine ingredient requirements and subtract matching stock once.
- Include batches being cooked now for future freezer meals.
- Confirmed purchases add inventory, even if the original meal is later canceled.
- Confirmed cooking records ingredient use and actual portions produced.
- Prepared portions can be allocated to later meals; recording consumption reduces their balance.
- Dates passing never automatically mark meals cooked or eaten.
- Purchases, cooking, and corrections must be retry-safe.

**Preferences and learning**

Store household and individual preferences, equipment, favorites, recipe ratings, “make again,” and cooking notes.

Feedback influences retrieval and recommendations. Suggested preference changes remain visible and editable. Start with practical food goals rather than calorie or macro tracking.

## 4. Technical foundation

**Extend the existing application**

Use current remote `main`, preserving the existing Next.js app, recipe imports, ingredient resolver, validation, and Vercel project. Keep the continuous recipe-feed PR separate.

Retain one shared contract definition, one household provider, and one persistence interface. Both UI controls and agent tools invoke the same validated domain commands.

Add shared types for planning sessions, household members, flexible stock, cooking batches, meal allocations, prepared portions, feedback, proposals, and action receipts.

**Shared household persistence**

Extend the existing Supabase authentication integration with household membership, partner invitations, and server-authorized storage.

Use a versioned household snapshot, revision checks, and command history. Synchronize both devices and surface conflicting or unsaved edits.

Migration must preserve existing pantry data, recipe provenance, preferences, calendar entries, and conversation history. Preserve old drafts as recoverable proposals; never infer that repeated recipe names represent one batch. Keep a recovery copy before importing browser data.

**Hosted application, local inference**

The app and shared household data remain hosted. Your Mac runs Ollama and an authenticated worker that connects outward to receive AI jobs.

- Keep AI SDK behind a configurable model adapter.
- Route recipe generation, conversational planning, and AI-assisted extraction through local inference.
- Evaluate `qwen3.5:9b` first, then the 27B variant if quality requires it; pin the tested model.
- Keep Ollama private to the Mac and disable cloud inference.
- Never silently fall back to a paid API.

Jobs carry the session context and household revision. The hosted service validates returned commands before applying them. Cancellation, duplicate completion, stale state, and worker interruption must be handled explicitly.

If the Mac is asleep, manual planning, inventory, and shopping remain usable. The assistant shows that local AI is offline and provides retry.

The same model and job interfaces support future hosted workers or API providers.

## 5. Delivery, tracking, and acceptance

Use a Linear project named **LunchBox — Household Pilot**, reusing an existing matching project. Linear currently requires reauthentication; the revised roadmap has not yet been published there.

| Milestone | Deliverable | Acceptance |
|---|---|---|
| **1. Prove the planning interaction** | Conversation, calendar, focused recipe cards, grocery preview, and resumable session using clearly labeled fixtures | You can explore, steer, select, and revise meals through one coherent workflow |
| **2. Build household and planning foundations** | Shared persistence, migration, individual coverage, batches, and live shopping calculations | Both devices agree; batch portions and groceries calculate correctly |
| **3. Connect local intelligence** | Model adapter, Mac worker, job lifecycle, recipe retrieval/generation, and shared action tools | The same planning session works with real local inference |
| **4. Close the household loops** | Flexible stock checks, purchases, cooking, prepared meals, ratings, and feedback | Changes after shopping and cooking remain consistent |
| **5. Run the real household pilot** | Mobile refinement, recovery checks, and a complete shopping cycle | Both of you can plan and adapt an actual week comfortably |

Create focused Linear issues with dependencies, acceptance examples, ownership, and linked PRs. Develop locally with a separate development database; verify protected previews before enabling the household pilot in production.

**Required end-to-end demonstration**

During one conversation:

1. Mark only your Tuesday lunch as covered.
2. Retrieve a favorite and generate a new vegetable-focused recipe.
3. Revise a candidate’s cuisine or preparation effort.
4. Allocate one pasta batch across multiple meals.
5. Accept selected placements and inspect updated groceries.
6. Change an occasion to eating out.
7. Record a purchase and confirm canceled meal ingredients remain in inventory.
8. Cook a batch, reserve freezer portions, and schedule them later.
9. Rate the recipe, leave, and resume with current household context.

**Release gates**

Run `npm run check`, `npm run build`, and desktop/mobile verification. Test migration, authorization, concurrent edits, uncertain stock, stale proposals, cancellation, worker loss, and duplicate purchase/cooking requests.

Evaluate local AI across 20 representative scenarios, twice each. Require at least 90% task completion, no unsupported claims of completed actions, and no invalid state changes. Measure latency before choosing the final model.

External calendar connections, autonomous replanning, retailer purchasing, precise nutrition tracking, and public SaaS onboarding remain later milestones.
</proposed_plan>