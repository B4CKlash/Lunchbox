# Recipe journey: living design brief

Last reviewed: **2026-10-09**. Design-review source baseline: **`7c9c759` on `main`**, before integrating the recipe feed and household pilot. See [the team handoff](TEAM_HANDOFF.md) for current application behavior; the baseline comparisons below retain their original review context.

## Purpose and design character

Help people discover meals they want, learn about their kitchen along the way, and quickly produce a useful grocery list. A complete pantry, a finished profile, and calendar dates should not be prerequisites for getting value.

This is the shared record of the proposed experience, its decisions, and questions still to explore. The audience is the LunchBox team across frontend, meal workflow, pantry/storage, planning, and integration. Agreed design directions are not claims that the app implements them. This document adds no application behavior, API, schema, or storage changes.

The experience should feel fast, forgiving, and connected:

- Show a little information while someone browses; reveal ingredients and instructions when they want detail.
- Collect kitchen information in context, when answering helps with a recipe the person already wants.
- Carry recipes, selections, and serving quantities between stages without making people enter them again. Confirming pantry stock may refresh ideas, but must preserve the active recipe and shortlist.
- Let people return to earlier choices, skip optional setup, and get groceries without scheduling.
- Show what is known and what still needs checking. Use honest demo, AI, and import labels; community testing requires its own evidence.

## Two connected journeys

**Getting started:** optional quick profile → recipe ideas → learn pantry contents while exploring → useful grocery preview.

**Planning meals:** brainstorm → shortlist → inspect → select recipes and total servings → optional allocation/calendar → groceries.

These are journeys, not a compulsory wizard. Shortlisting and inspection can alternate, pantry discoveries can improve later ideas, and groceries can be previewed before dates are chosen.

| Stage | Person's goal and actions | Information and state to carry forward |
| --- | --- | --- |
| Quick start | Optionally share favorite foods, cooking style, available time, and kitchen equipment. Skip to ideas or add detail later. | Locally saved preferences; unanswered questions remain unanswered. Aim for 20–60 seconds, then measure it. The exact minimum question set is open. |
| Brainstorm | Ask for ideas such as “easy,” “fresh,” or “use what I have.” Scan about 10 diverse options. | Titles, brief descriptions, time, serving context, and ingredient coverage. Keep full instructions behind a detail action. About 10 is a design target, not a guarantee or the current provider limit. |
| Narrow down | Keep roughly 1–3 candidates, revisit them, and remove candidates freely. | A temporary shortlist distinct from the permanent recipe box. Three is a typical working set, not an agreed hard limit. |
| Explore and discover stock | Read each recipe and its instructions. Confirm ingredients and quantities already at home, including extra stock. | Recipe context, serving context, and explicit pantry updates. Available, partially available, missing, and unknown ingredients need different treatment. |
| Set servings | Choose one recipe or several and scale each to the total number of servings wanted. | A total serving quantity for each selected recipe; ingredient amounts scale from the recipe's base servings. |
| Allocate and optionally schedule | Allocate those servings across meals, dates, or freezer intentions. Schedule one recipe by itself or several selected recipes together. | Allocation quantities linked to the selected recipe's total. Keep any unallocated servings visible; dates are optional for a grocery preview. |
| Get groceries | Review the combined needs of the selected recipes and servings without first choosing dates. | A clearly identified preview, pantry facts, ingredients still to check, and calculated shortages. A confirmed calendar plan remains distinguishable from this preview. |

## State distinctions and examples

### Journey stage and recipe relationships

The person's current stage describes what they are doing. A recipe's relationships describe how they intend to use it: suggested, shortlisted, saved, selected for groceries, or included in a calendar draft/confirmed plan. These can overlap. Viewing a recipe does not select it; saving it does not schedule it. Removing a shortlist candidate should not remove an independently saved recipe or confirmed meal.

### Pantry knowledge and the black-bean example

An absent pantry record does not prove that an ingredient is absent from the kitchen. The proposed ingredient interface distinguishes unknown, confirmed available, partially available, and confirmed missing. If quantity is unknown, record that uncertainty rather than inventing an amount. Summary wording can say “ingredients to check” alongside confirmed shortages.

Example: a recipe needs black beans. The person says, “I have this can, and four other cans.” The resulting statement is **five cans total**, not five additional cans. Show the existing record and whether the person is setting a total or adding stock before applying the update; revisiting the recipe must not add the same stock again.

Current calculations match canonical ingredient ID **and** unit, using `g`, `ml`, or `each`. A count of cans cannot be converted to grams without an explicit package amount that matches the recipe's measurement basis. Preserve the five-can example as the interaction goal; resolve package entry and quantity confirmation before implementing it.

### Total servings and allocation

The rule is **scale the recipe once to its selected total servings, then distribute those servings**. This concept does not introduce a separate cooking-session planner.

For a recipe with **six total servings**, each of these is a valid intention:

- One meal for six people.
- Six meals for one person.
- Two servings for one meal, two for another, and two earmarked for the freezer.

All three require the same recipe ingredients. Allocated servings plus unallocated servings must equal the total. Moving servings between destinations does not increase that total. If the person lowers the total below the existing allocations, the interface must resolve the mismatch rather than silently changing their intentions.

Freezer allocation records a plan for servings. It does not prove food was cooked, create cooked inventory, or deduct pantry stock. Actual cooking, leftovers tracking, purchases, and inventory transactions remain separate future workflows.

### Grocery preview and confirmed plan

Selection and total servings are enough to preview groceries; calendar placement is optional. Combine scaled requirements across the selected recipes, then subtract matching pantry stock once. Changing a total recalculates requirements. Merely redistributing that total leaves requirements unchanged.

Example: two recipes require 300 g and 200 g of rice. With 400 g recorded on hand, their combined shortage is 100 g. Separate recipe cards cannot each assume that the same stock covers their needs independently in the combined list.

Keep the preview's recipe set visible and distinguish it from the confirmed plan's shopping list. Do not silently replace confirmed meals when someone explores candidates. Current Shopping also includes pantry staple restock reminders; keep those distinguishable from recipe shortages. The exact preview-to-confirmed-list handoff is an open design question.

## Current source baseline

The following describes inspected source at `7c9c759`, not a claim that every path was verified in production. Refresh this baseline against current `main` before scoping implementation. Work in open pull requests is not part of this baseline.

| Area | Exists in inspected source | Proposed experience still to design/build | Evidence |
| --- | --- | --- | --- |
| Preferences | Five-step setup with required selections, custom notes, saved summary, edit, and reset. Meal routes are accessible without completing it. | Explicit quick/skip path, measured 20–60-second setup, and structured kitchen-equipment preferences. | [Onboarding panel](../src/components/onboarding-panel.tsx), [shared contracts](../src/lib/contracts.ts) |
| Accounts and persistence | Optional Supabase account sign-in is separate from kitchen state; kitchen data stays in this browser. | The quick cooking profile remains usable without account creation. This journey does not require household sync. | [Account setup](ACCOUNTS_SETUP.md), [household provider](../src/components/household-provider.tsx) |
| Discovery | Configured live AI or deterministic demo providers, pantry/preference context, recent suggestion history, and refresh after pantry edits. The demo catalog has three recipes; live suggestion generation currently accepts at most three candidates per response. | About 10 diverse concise ideas in a coherent brainstorming experience. | [Providers](../src/features/meals/providers.ts), [live provider](../src/features/meals/live-provider.ts), [demo provider](../src/features/meals/demo-provider.ts) |
| Recipe exploration | Cards show title, description, time, servings, ingredient coverage, per-recipe shortages, and expandable scaled ingredients/instructions. Save, discuss, and add-to-calendar actions share recipe snapshots; reviewed imports retain provenance. | Temporary shortlist and ingredient-row stock confirmation while inspecting a recipe. | [Recipe card](../src/components/recipe-card.tsx), [shared contracts](../src/lib/contracts.ts) |
| Pantry | Separate stock editing, supported quantities/units, locations, tags, and staple restock settings. | Explicit unknown-versus-missing knowledge and package-aware entry from recipe details. | [Pantry panel](../src/components/pantry-panel.tsx), [shared contracts](../src/lib/contracts.ts) |
| Calendar and servings | Draft/commit, an unscheduled tray, per-entry servings, repeat/fill, and saved calendar settings. Unscheduled draft entries must be placed or removed before commit. | One selected recipe's total servings allocated across meals/freezer intentions, plus connected scheduling of several selected recipes. | [Calendar planning](CALENDAR_PLANNING.md), [workspace actions](../src/features/meals/workspace-state.ts) |
| Groceries | Committed-plan requirements are combined before stock is subtracted. Shopping includes staple restock reminders and a date-range filter. Recipe-card shortages exclude restock reminders and describe that recipe alone. | A combined preview from selected recipes before dates/commit, with unknown ingredients still marked for checking. | [Shopping calculation](../src/features/planning/shopping.ts), [shopping panel](../src/components/shopping-panel.tsx), [recipe card](../src/components/recipe-card.tsx) |
| Community evidence | Recipe provenance distinguishes demo, AI, and imported content. | An evidence-backed meaning for “community-tested”; provenance alone is not testing evidence. | [Shared contracts](../src/lib/contracts.ts) |

For current provider operation, use the [AI demo runbook](AI_DEMO_RUNBOOK.md). The [recipe workspace plan](RECIPE_WORKSPACE_PLAN.md) records earlier delivery scope and future slices; its original demo-only descriptions are historical. Preserve the [interactive concept](../LunchBox_Interactive_Concept.html) and original design portfolio as references.

## Idea register

Keep stable IDs when wording changes. **Design status:** `Captured`, `Exploring`, `Agreed`, `Deferred`. **Delivery status:** `Not started`, `In progress`, `Verified`. An agreed direction can still have unresolved interface details. Delivery status below refers to the proposed enhancement, even where parts already exist in the baseline. Owner roles are coordination recommendations, not assignments accepted by teammates.

| ID / stage | Idea and user value | Design / delivery status | Owner role | Next question or action; evidence/date |
| --- | --- | --- | --- | --- |
| J-01 · Quick start | Skippable locally saved preferences get someone to useful ideas quickly. | Agreed / Not started | Frontend + meal workflow | Explore Q-01; user decision D-02, 2026-10-09. |
| J-02 · Brainstorm | About 10 concise, diverse ideas reduce effort before detailed reading. | Agreed / Not started | Meal workflow + frontend | Explore Q-02; original idea captured 2026-10-09. |
| J-03 · Shortlist | Keep roughly 1–3 temporary candidates without filling the recipe box. | Agreed / Not started | Frontend + meal workflow | Explore Q-03; original idea captured 2026-10-09. |
| J-04 · Inspect | Shared recipe detail carries context between browsing, discussion, selection, and planning. | Agreed / Not started | Frontend | Sketch the handoffs with J-03/J-05; existing detail is baseline, connected journey captured 2026-10-09. |
| J-05 · Pantry discovery | Confirm stock within ingredients, including extras, to onboard through recipes. | Agreed / Not started | Pantry/storage + frontend | Explore Q-04/Q-05 using the five-can example; captured 2026-10-09. |
| J-06 · Servings | Scale each selected recipe to total servings so people can choose quantities directly. | Agreed / Not started | Planning + frontend | Carry the total through J-07/J-08; clarified by user in D-04, 2026-10-09. |
| J-07 · Allocation/calendar | Allocate servings across meals or freezer intentions; schedule one or several recipes smoothly. | Agreed / Not started | Planning + frontend | Explore Q-06; six-servings example and D-04, 2026-10-09. |
| J-08 · Groceries | Preview combined groceries before dates so first use produces an actionable result. | Agreed / Not started | Planning + pantry/storage + frontend | Explore Q-07; user decision D-03, 2026-10-09. |
| J-09 · Equipment | Match ideas to available kitchenware, reducing unusable suggestions. | Captured / Not started | Meal workflow + frontend | Explore Q-08; original vision captured 2026-10-09. |
| J-10 · Recipe confidence | Prefer recipes with credible community testing evidence. | Captured / Not started | Meal workflow + integration lead | Explore Q-09 before defining a claim or badge; original vision captured 2026-10-09. |

## Decision log

| ID | Date | Decision | Reason / affected ideas |
| --- | --- | --- | --- |
| D-01 | 2026-10-09 | Keep a living design brief in repository docs, linked from the team handoff. | User chose a shared design record over a build specification or storyboard alone; all ideas. |
| D-02 | 2026-10-09 | Quick preferences are skippable and saved locally. | Get people to useful recipes immediately and enrich the profile later; J-01. Account creation is not a prerequisite. |
| D-03 | 2026-10-09 | A grocery preview is available from selected recipes and servings before dates. | Early value without compulsory scheduling; J-08. |
| D-04 | 2026-10-09 | Scale a recipe to total servings, then allocate those servings. | User clarified that a cooking-session planner adds unwanted complexity: six servings can be one meal for six or six meals for one; J-06/J-07. |
| D-05 | 2026-10-09 | Preserve the full vision and recommend phased delivery. | Keep equipment and community-tested recipes visible without making them prerequisites for the first useful journey; all ideas. |

Append revisions with the superseded decision ID and reason instead of silently erasing earlier reasoning.

## Open questions and design exercises

These questions guide later design work; they do not block capturing the agreed direction. Resolve relevant questions before marking a feature ready for implementation.

| ID | Related ideas | Question / next exercise | Owner role |
| --- | --- | --- | --- |
| Q-01 | J-01 | What is the smallest useful first profile? Sketch one skippable entry screen and time it with first-time users; defer questions that do not improve initial ideas. | Frontend + meal workflow |
| Q-02 | J-02 | What makes the first set diverse and scannable? Sketch a roughly 10-idea list, define useful variety, and decide how to present fewer valid results or loading failures honestly. | Meal workflow + frontend |
| Q-03 | J-03/J-04 | How does a temporary shortlist survive navigation, regeneration, and reload? Sketch selecting, inspecting, removing, and saving candidates without conflating the actions. | Frontend + pantry/storage |
| Q-04 | J-05 | How are unknown, partial, and confirmed-missing stock shown without extra onboarding friction? Walk through one recipe with an initially empty pantry record; preserve its open detail and shortlist when stock changes trigger new suggestions. | Pantry/storage + frontend |
| Q-05 | J-05 | How are package count, explicit package amount, total-stock edits, and additive edits presented? Walk through five cans, an existing stock record, and an unknown can size without guessing conversions. | Pantry/storage + integration lead |
| Q-06 | J-06/J-07 | What is the simplest allocation control, including changing totals and selecting several recipes? Sketch six servings in the three example distributions; keep unallocated servings visible and avoid a cooking-session planner. | Planning + frontend |
| Q-07 | J-08 | How does a selected-recipe preview coexist with the confirmed list, date filters, and staple restock reminders? Sketch the handoff without silently replacing a confirmed plan or promising completeness while ingredients are unknown. | Planning + pantry/storage + frontend |
| Q-08 | J-01/J-09 | Which equipment choices materially change suggestions, and when should they be asked? Identify a small useful set and distinguish explicit preferences from assumptions. | Meal workflow + frontend |
| Q-09 | J-10 | What evidence qualifies a recipe as community-tested, where does it come from, and how is it maintained? Define the claim before designing ratings or badges. | Meal workflow + integration lead |

## Recommended delivery sequence

These slices are recommendations, not approved release commitments. The first concrete design exercise is Q-01 followed by a walkthrough of Q-03/Q-04/Q-07: skip setup, inspect candidates, confirm stock, and preview groceries.

| Slice | Result | Ideas and readiness |
| --- | --- | --- |
| 1 · First useful journey | Simplify entry, improve concise discovery, shortlist candidates, confirm ingredients in context, choose total servings, and preview combined groceries. | J-01–J-06/J-08. Resolve Q-01–Q-05/Q-07; scope focused implementation PRs rather than one broad rewrite. |
| 2 · Planning continuity | Allocate total servings and schedule one recipe or several selected recipes while preserving grocery quantities. | J-07, extending J-06/J-08. Resolve Q-06 and the preview/confirmed-list handoff. |
| 3 · Recommendation depth | Add equipment-aware matching, richer recipe diversity, and credible community-testing evidence. | J-09/J-10 plus deeper J-02. Resolve Q-08/Q-09; earlier discovery need not claim community testing. |

Future implementation keeps shared types/validation in `src/lib/contracts.ts`, feature logic in its owning directory, and the existing household provider/storage adapter as the state path. Coordinate API, contract, persistence migration, and route changes with the integration lead; this brief does not predefine a new wire format or competing state model.

## Acceptance examples and maintenance

The following are acceptance examples for future implementation, not completed feature tests:

| ID | Scenario | Expected result |
| --- | --- | --- |
| A-01 | A new person skips profile setup with no recorded pantry. | Useful ideas remain available; inventory uncertainty stays visible. Measure quick-profile completion against the 20–60-second target separately. |
| A-02 | Someone shortlists three recipes, inspects each, returns to ideas, and removes one. | Candidate context remains available; independently saved recipes and confirmed meals are unaffected. |
| A-03 | Someone confirms one can of beans and four others, then revisits the ingredient. | The recorded statement is five cans total, with no duplicate addition. Unknown package sizes remain unresolved instead of being converted to grams. |
| A-04 | Six servings are allocated to one meal for six, six meals for one, or two meals plus freezer portions. | Ingredient requirements are identical; allocations and any unallocated servings reconcile with six. Pantry stock remains unchanged. |
| A-05 | Someone selects two recipes and servings without choosing dates. | A combined grocery preview is available and identifiable; the confirmed plan is preserved. |
| A-06 | Two selected recipes need 300 g and 200 g of rice; stock is 400 g. | Combined rice shortage is 100 g. Matching uses ingredient ID/unit; incompatible units stay separate. |
| A-07 | A total changes from six to eight servings, then the same eight servings are moved between destinations. | The total change recalculates requirements; the redistribution does not. Reducing below allocated quantities prompts resolution. |
| A-08 | Some ingredients are unknown, others are partially available, and others are confirmed missing. | The interface distinguishes checking from buying and does not imply complete inventory knowledge. |
| A-09 | Suggestions are loading, empty, unavailable, or cannot be saved locally. | Explain the outcome and offer recovery without silently losing candidates, confirmed pantry entries, or the plan. |
| A-10 | A contributor reviews a proposed feature or recipe confidence claim. | Its design/delivery status and evidence are visible; AI/import provenance is not presented as community testing. |
| A-11 | Confirming pantry stock triggers a successful suggestion refresh while a candidate is open. | The active recipe, serving context, and shortlist survive replacement of the suggestion set. |

When updating this brief, keep IDs stable, date the change, record the reasoning, and update the affected idea's next action. Mark delivery `In progress` with an implementation branch/PR; use `Verified` only with the merged change and dated checks/browser evidence. Refresh the baseline when its source changes, and preserve superseded decisions in the log.

For this documentation change, review relative links, terminology, baseline claims, register completeness, and consistency with the examples. Before its PR, run `npm run check` and `npm run build` on the pinned Node runtime. Future application PRs also verify affected flows, loading/empty/error states, and the relevant examples on desktop/mobile, with focused domain tests where behavior changes. No new application tests are required for this brief itself.
