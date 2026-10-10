# Five-person team handoff

The common foundation is ready for feature work. Everyone builds on the same routes, household state, contracts, and deployment. The first demo follows one path: edit a sample pantry, choose meal suggestions, and see the combined ingredients still needed.

## Start here

```sh
git switch main
git pull --ff-only
npm ci
npm run dev
```

Use Node 24.21.0, pinned in `.nvmrc` and `.node-version`. On Nate's prepared Mac, `source ./scripts/use-hackathon-tools.sh` enables the installed tools. Other contributors can use their usual Node version manager.

Open `http://localhost:3000`. The home route redirects to `/pantry`; `/meals` and `/shopping` complete the flow. Create a feature branch from current `main`, keep the pull request focused on your area, and include how to try the change.

Before handing work back:

```sh
npm run check
npm run build
```

`check` runs lint, type checking, and tests. `build` verifies the production app separately. Use `npm run start` after a build to run that production build locally.

## Household pilot extension

The integrated application follows [the household pilot objective](HOUSEHOLD_PILOT_OBJECTIVE.md). `/meals` is a persistent conversation, live calendar, focused recipe cards, and grocery preview. `/recipes` preserves the continuous recipe feed, favorites, and reviewed imports. Earlier calendar drafts are recoverable proposals; there is no second committed-week calendar in the pilot.

Read [delivery status](HOUSEHOLD_PILOT_DELIVERY.md), [development setup](HOUSEHOLD_DEVELOPMENT.md), [shared household verification](HOUSEHOLD_SERVER_VERIFICATION.md), and [the local worker runbook](LOCAL_AI_WORKER.md). Earlier calendar runbooks describe the previous arrange/commit workflow. Recipe-library suggestions, chat, and imports preserve existing Gateway deployments; selecting `LUNCHBOX_AI_BACKEND=local-worker` routes them through the authenticated worker. Shared households default to the worker, and the new-development example selects it explicitly. The pilot planning conversation uses its own clearly labeled fixture or local-worker mode.

Recipe blocks retain their direction and original serving quantities through reload and pantry/preference changes. Shared-mode generation saves each half-block before requesting the next one. Feed controls and history use the same validated household commands, preserving current planning proposals and Undo.

The household provider and storage adapter remain the single state boundary. `HouseholdState.version: 1` gains an additive, versioned `pilot` object. `ensurePilot` migrates earlier data without discarding originals; `applyPilotCommand` is shared by manual UI, server commands, and validation of local AI proposals. `buildPilotShoppingList` uses upcoming uncooked batches through the explicit shopping horizon. Planning never consumes inventory.

Shared mode uses authenticated Supabase membership, stable account-to-person IDs, a revision-checked household snapshot, and command history. Local storage is an account-scoped cache with pending commands; the separate recovery archive is backup-only. Before import, join, account transitions, and resets, preserve the original browser data. Pending edits cannot be silently rebased over another person's full pantry or session.

Ollama stays on the Mac. An authenticated outbound worker receives jobs, generates candidates and proposed actions, and returns them for validation and review. The fixture helper remains clearly labeled. Production household enablement, the hosted development database, protected preview verification, and the actual household pilot are release gates, not consequences of a passing local test.

## Recipe journey design record

Read [the living recipe journey brief](RECIPE_JOURNEY_DESIGN.md) for quick onboarding, brainstorming, shortlisting, pantry discovery inside recipes, total-serving allocation, and grocery previews before scheduling. It tracks agreed directions, open questions, recommended slices, and future acceptance examples separately from the inspected app baseline. These proposals are design work, not implemented feature claims; use the stable idea and decision IDs when refining them.

## Ownership and first tasks

| Person | Owns | First task | Done when |
| --- | --- | --- | --- |
| **1. Integration lead** | Contracts, routes, configuration, dependencies, CI, merges, deployment | Keep one working foundation and integrate the four feature slices | Checks pass, `main` deploys, and the complete pantry → meals → shopping path works |
| **2. Pantry + storage** | `src/features/pantry/**` | Improve the sample pantry and storage behavior; coordinate add/edit controls with frontend | Ingredient amounts and use-soon flags survive reload; empty and invalid stored data have a safe, clear outcome |
| **3. AI workflow** | `src/features/meals/**`, `src/app/api/meals/suggest/route.ts` | Implement a real provider behind the existing suggestion contract, retaining the demo provider for a key-free demo | Pantry and preferences produce validated recipes; the UI identifies demo versus AI results and can save a selected meal; provider failures are recoverable |
| **4. Plan + shopping logic** | `src/features/planning/**` | Extend and test serving calculations and combined shortages | Multiple meals sharing an ingredient subtract stock only once, serving changes update shortages, and incompatible units stay separate |
| **5. Frontend + demo experience** | `src/components/**`, `src/app/globals.css` | Adapt the existing visual concept into a clear three-screen demo | Pantry editing, selecting meals, and viewing shopping needs work on desktop and mobile with loading, empty, and error states |

These are ownership boundaries, not separate apps. Ask the integration lead for shared contract, dependency, or routing changes. Coordinate UI additions with frontend and domain behavior with the relevant feature owner. Do not introduce a second provider, storage format, API shape, or routing structure in a feature branch.

## Foundation map

| Area | Responsibility |
| --- | --- |
| `src/lib/contracts.ts` | Shared TypeScript types and Zod schemas; integration-owned source of truth |
| `src/app/pantry/`, `src/app/meals/`, `src/app/shopping/` | Thin route wrappers around the screens |
| `src/app/api/meals/suggest/route.ts` | Server endpoint for validated meal suggestions |
| `src/components/household-provider.tsx` | One client household state provider and feature coordination |
| `src/components/**` | Screen panels and reusable UI |
| `src/features/pantry/**` | Sample household, versioned storage, scoped cache/recovery, and remote persistence adapter |
| `src/features/meals/**` | Recipe providers, canonical imports, local model adapter, and authenticated jobs |
| `src/features/planning/**` | Validated pilot commands, per-person coverage, batches, inventory/cooking, and shopping calculations |
| `.github/` | Shared checks and contribution workflow |

The stack is Next.js 16 App Router, React 19, TypeScript, Zod 4, and npm. Keep the route wrappers small so interface work and domain work can progress independently.

The starter functions are ready to extend:

- `src/features/pantry/seed.ts`: `createSampleHousehold()` returns a fresh sample household.
- `src/features/pantry/storage.ts`: `loadHousehold(storage)` and `saveHousehold(storage, state)` use `HOUSEHOLD_STORAGE_KEY` (`lunchbox.household.v1`). Loading returns `null` for absent, invalid, or unavailable stored data; saving reports failure to the caller so the UI can warn the user.
- `src/features/meals/demo-provider.ts`: async `suggestMeals(input)` returns validated demo recipes, filtered by preparation time and ranked using pantry coverage and the use-soon preference.
- `src/features/planning/shopping.ts`: `buildShoppingList(pantry, meals)` returns combined shortages without mutating the pantry.

## Shared data and API

Read the current schemas in `src/lib/contracts.ts` before implementing against them. The key types are:

| Type | Meaning |
| --- | --- |
| `PantryItem` | Canonical `id`, display `name`, `quantity`, `unit`, storage `location`, and `useSoon` |
| `Preferences` | Requested `servings`, `maxMinutes`, and `prioritizeUseSoon` |
| `Recipe` | Base servings, duration, ingredient amounts, and preparation steps |
| `PlannedMeal` | A selected recipe snapshot and the desired servings |
| `HouseholdState` | Schema `version: 1`, pantry, preferences, and selected meals |
| `ShoppingItem` | Ingredient ID and unit, total required, available stock, and remaining quantity to buy |

The client sends `POST /api/meals/suggest` with:

```ts
{ pantry: PantryItem[], preferences: Preferences }
```

The response is:

```ts
{ source: 'demo' | 'ai', recipes: Recipe[] }
```

The starter provider returns `source: 'demo'`. A live provider must keep this contract, validate generated output, and keep credentials on the server. Selecting a suggestion saves a recipe snapshot in household state so later provider changes do not rewrite the plan.

Without shared configuration, household state is saved in this browser through the pantry adapter. Shared mode uses authorized Supabase persistence and a scoped local cache. Both modes use the same contracts and provider; never add a parallel household schema or silently reset old data.

The profile/package follow-up keeps additive, default-empty `pilot.profileFacts`, `pilot.packageStock` and `pilot.packagePurchases` in that snapshot. Containers are observations, not new recipe units or implicit gram equivalents. Use `prepareNaturalStockEntry` and the reviewed domain commands for natural quantity input; exact container counts are whole numbers. `record_stock_entries` distinguishes current measured totals from additions, preserving uncertain balances.

Use `buildRecommendationContext` for planning, suggestions and recipe chat. Direct recipe requests carry its bounded `recommendationContext`; authenticated workers rebuild it from their saved household and actor. Use `recommendationContextKey` for cancellation and stale display, while revision/job checks continue to authorize writes. Typed profile facts supersede older prose; only the current human message can authorize conversation learning. Accept recipe-chat jobs with `receive_recipe_chat_result` so the completed job identity, transcript, provenance and profile effects persist together. Keep recipe extraction faithful to source snapshots.

## Calculation rules

1. Use canonical ingredient IDs, not display names, for matching. `PantryItem.id` is the ingredient identity used by a recipe's `ingredientId`, not a separate stock-lot ID.
2. Match on the pair `(ingredientId, unit)`. The supported units are `g`, `ml`, and `each`; no unit conversion is implied.
3. Scale recipe quantities by `planned servings / recipe base servings`.
4. Combine scaled requirements across all planned meals before subtracting matching pantry stock once.
5. Keep only positive shortages in the shopping list.
6. Do not deduct pantry stock when a meal is planned. Removing a planned meal changes requirements, not inventory.

For example, two planned meals need 300 g and 200 g of rice. With 400 g in the pantry, the shopping list needs 100 g. Stock cannot be counted separately against each meal.

## Deployment

The canonical app is [LunchBox on Vercel](https://lunchbox-snowy.vercel.app). The existing Vercel project is `no-name-4c11/lunchbox`, connected to [B4CKlash/Lunchbox](https://github.com/B4CKlash/Lunchbox), with `main` as the production branch.

- Git pushes and pull requests trigger Vercel previews; merges to `main` trigger production deployment.
- The integration lead handles project linking and deployment settings. Reuse the existing project.
- Preview URLs can require Vercel authentication. Keep protection enabled; the integration lead can verify protected previews with `vercel curl`.
- Use the canonical production URL for the team demo.
- The Vercel account also contains `lunchbox-9ezx`, connected to the same repository. The canonical project for this team is `lunchbox`.

## Demo scope and design reference

This pilot adds household sync, local AI transport, purchases, cooking, prepared portions, and feedback. Their deployment and real-household acceptance remain gated in the delivery tracker. Allergen guarantees, nutrition tracking, retailer purchases, autonomous replanning, and public SaaS onboarding remain outside scope.

[The original interactive concept](../LunchBox_Interactive_Concept.html) and the PDF/PowerPoint design portfolio remain available as design references. The concept contains simulated behavior; use tested application commands and the delivery tracker to determine what is actually implemented and verified.
