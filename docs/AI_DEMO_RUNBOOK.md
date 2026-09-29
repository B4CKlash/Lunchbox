# LunchBox AI demo

This integration extends the existing `no-name-4c11/lunchbox` project and its Git deployments. Production remains <https://lunchbox-snowy.vercel.app>. Previews retain Vercel authentication.

## Configuration

- `LUNCHBOX_AI_MODE=ai` selects the live provider. Omitted or `demo` selects honest sample suggestions/chat. Imports require the live connection.
- `LUNCHBOX_AI_MODEL=google/gemini-2.5-flash` is the initial model. Check the [eligible model catalog](https://vercel.com/ai-gateway/models?freeTier=true) before changing it.
- Deployed functions use the project's enabled Vercel OIDC identity through request context, resolved by the Gateway SDK. Do not require an environment token in deployed functions or copy a local token into production. Local development can obtain its short-lived identity through `vercel env pull .env.local`. Keep this file ignored and refresh expired identity tokens.
- Use existing Gateway credits only. Verify the available allowance, disabled automatic top-ups, and no enabled team BYOK credentials in the [team Gateway dashboard](https://vercel.com/no-name-4c11/~/ai-gateway) before live tests. Do not buy credits, enable top-ups, or add separately billed provider keys. See [Gateway pricing](https://vercel.com/docs/ai-gateway/pricing).
- The gifted and monthly credits shown in v0 billing do not establish the Gateway allowance. For a new Gateway account, choose **Use Free AI Gateway Credit**; Vercel may require the account owner to complete card verification before free requests work. The dashboard states that this verification does not charge the card. Keep automatic reload disabled, and never enter card details into chat or source code. A zero balance before the first request is not sufficient evidence that the free allowance is unavailable.
- Apply one project firewall rule matching `/api/meals/suggest`, `/api/meals/chat`, and `/api/meals/import`, counting by IP, with a fixed 60-second window and limit 20. Exceeding it returns 429. Vercel counters are regional; this is not a global account spending cap.

## Behavior and boundaries

Open Meals after reloading any tab left open before AI was enabled; the header should say **AI kitchen assistant**. In Suggestions, changing servings, cooking time, or use-soon priority automatically requests recipes after a 350ms pause for rapid edits. Saving changes in Your preferences or Your pantry also refreshes ideas when you return to Meals. Reloading Meals starts another generation, and **Generate more** requests another set without changing settings and switches from Recipe box to For you. This responds to edits and explicit refreshes; it does not generate continuously on a timer or while browsing other pages. Saved recipes and calendar snapshots stay unchanged until the user acts on them.

The existing version-1 household workspace now retains up to 30 recent recipe names under `workspace.suggestions`, so variety context survives navigation and page reloads. These are sent as optional `recentRecipeNames` with the current pantry and full preferences. The model is instructed to create different dishes; normalized matching titles are rejected during evaluation, with the existing one-step repair opportunity. Semantic variety still depends on the model. Successful results update memory without triggering another generation. Saving a recipe updates ingredient references without making another AI request. All memory uses the existing household storage adapter and key; old saves gain empty defaults without losing kitchen, recipe box, or calendar data.

Adding a pantry item or increasing its stock records that canonical ingredient/unit pair as pending. The next request sends these as optional `preferredIngredients`; the server resolves them against positive current stock and uses current pantry names. It asks for at least one dish using a newly added/restocked item (for example, one apple), giving the model one bounded correction opportunity if the initial batch omits them. Food and time constraints take precedence; a specific explanation is displayed alongside alternatives if the item cannot fit. Depleted or removed items lose priority, and a successful current batch clears pending additions. Failed, cancelled, empty, or stale responses do not consume newer pantry changes. Earlier saves cannot reconstruct which old inventory entries were recently added; new additions/restocks are tracked after this update.

Suggestions expose only the new-recipe evaluation tool; chat retains all three tools. A failed evaluation returns a retryable validation error instead of claiming no dishes match. When the model needs clarification before proposing recipes, the optional response `explanation` reaches the empty state and its **Ask in Chat** action. Explanations also appear alongside nonempty batches when pantry priorities cannot be followed. Optional API fields preserve older callers.

Suggestions and chat use AI SDK 7.0.122 and a server-only `ToolLoopAgent`. Its three read-only tools find stored favorites, validate new recipe proposals, and calculate plan shortages. Recipes are returned only through validated tool references. Existing favorites retain their IDs, base ingredient quantities, and provenance; revisions get new IDs. Gemini 2.5 uses a preparation phase with tools followed by a separate structured-response phase without tools; the entire interaction stays within three model calls.

Each request has a 45-second total deadline, a maximum of three model steps, 4,000 output tokens per step, no application retries, a 50-second browser timeout, and a 60-second function allowance. Cancellation propagates to body reading, URL retrieval, and generation. Logs include operation, model, timing, usage, and error category, without pantry contents, recipe text, or secrets. AI failures return public errors, never sample recipes relabeled as AI.

Assistant source (`demo` or `ai`) is separate from recipe provenance (`demo`, `ai`, or `import`). Import attribution is carried on recipe snapshots through saving, discussion, planning, and reload. All household state still uses the existing version-1 adapter; old saves gain additive defaults. State remains local to the current browser.

The shared ingredient resolver uses existing household identities, authored catalog aliases, and stable custom IDs. It never uses fuzzy names as shopping keys, converts units, or merges old IDs. Ambiguous matches require a choice. Pantry entry reuses identities from saved recipes, calendar drafts, and committed meals. Shopping scales base quantities to committed servings, combines ingredient/unit requirements, and subtracts stock once. Planning never deducts inventory. Add to calendar stages a draft; place meals and Commit plan to update groceries. Chat labels draft shortages as a preview.

Imports always open a review form. Source ingredient lines remain visible. Missing servings, time, quantities, and units stay unresolved; only positive quantities in `g`, `ml`, or `each` can be saved. Unsupported measures, ranges, and “to taste” require a person's correction. Users can edit names and steps or add a missing ingredient. The final validated recipe uses the same Save/Add to plan actions as recommendations.

The model receives a small extraction schema for recipe text, ingredient names, original lines, and steps. Amounts, units, identity choices, servings, and time are resolved from the source by the app and checked against the complete shared draft schema. Sending the entire editable review schema to Gemini can exceed its structured-output complexity limit.

Public URL imports support Schema.org Recipe JSON-LD objects, arrays, graphs, and ordered instruction sections. Fetching permits HTTPS public hosts only, pins the validated address, checks every redirect, allows at most three redirects, and enforces a ten-second deadline and two-megabyte decoded response limit. Blocked, restricted, ambiguous, or unsupported pages offer paste-text input while retaining the URL. No browser automation or paywall access is used. Source content is data, never agent instructions.

## Release demonstration

Use a fresh demo browser household so personal saved state is untouched. Complete these steps on a protected preview, then repeat on the canonical production URL after merging:

1. Ask for a dish that needs something absent from the pantry, such as a simple lasagna. If needed, increase the preparation-time preference first. Confirm the AI label, quantities, and missing ingredients. Discuss a revision, Save, and Add to calendar.
2. Open Add recipe → Paste text. Use a short recipe with an explicit Ingredients section, base servings, time, and steps. Include an unsupported measure to demonstrate the review requirement, then enter a measured quantity and supported unit. Save and add it to the calendar draft.
3. Import a real public recipe URL. `https://www.bbcgoodfood.com/recipes/easy-pancakes` exposes supported recipe data. Its yield is a pancake count, so base servings must be reviewed; spoon measures and optional ingredients also need measured corrections. Preserve the original link and author, then save and plan the recipe.
4. In chat, ask to find the saved AI recipe. Verify that its original quantities and ID are reused even when stock is insufficient.
5. Place all three meals into calendar slots and Commit plan. View the combined shopping list, change a planned meal's servings, commit again, and confirm shortages change while pantry quantities remain unchanged. Add a missing ingredient through the pantry form and confirm that stock reduces the existing shortage.
6. Reload and check favorites, imports, attribution, and plan snapshots. Verify desktop and mobile layout plus loading, cancellation, unavailable-credit, validation, and empty states.

Run `npm run check` and `npm run build` before the integration PR. The quoted test glob includes nested API/feature tests; tests use injected model responses and never consume Gateway credits.

## Disable AI safely

Set `LUNCHBOX_AI_MODE=demo` and redeploy the current code. This keeps the additive storage reader, imported recipes, favorites, planning, and shopping usable. New imports are unavailable until AI returns. Do not roll back to an old schema reader that discards imported recipe provenance.
