# Calendar planning

The Calendar view in `/meals` replaces the selected-meal list. Start with next Monday and seven days, choose breakfast/lunch/snack/dinner slots, and set a meal target. Extend the visible range up to 28 days or browse other weeks. Dates are local date-only values; changing the view never deletes a meal.

## Arrange, review, commit

- Choose a recipe from Ideas, Recipe box, or From chat. Drag it into an empty slot, or select the recipe and tap a slot. Ideas and chat use the existing provider response and display its actual demo/AI source; this release does not connect a live AI provider.
- Drag a placed meal to move it. Dropping onto another meal swaps the two. Select a meal to edit its date, slot, or servings with keyboard/touch controls, view the recipe, or discuss it in chat.
- To plan three lunches, choose a recipe, set the target to three, choose Lunch only and Repeat selected recipe, then Fill open slots. Different recipes uses distinct recipe IDs within the chosen dates and slots; it leaves slots open when the recipe pool runs out. Existing meals count toward the target and stay in place.
- A selected calendar meal can be repeated into a specified number of later empty slots of the same meal type. Add days if the visible range has no room.
- Add to calendar from Suggestions or Chat puts a recipe in the unscheduled tray. Place or remove every unscheduled recipe before committing. Old selected-meal saves remain committed and visible in this tray until assigned dates.
- Commit plan replaces the complete committed plan, including meals outside the visible date range. Grocery list opens the existing aggregate shortages for committed meals. Repeating commit cannot duplicate meals; committing an empty draft clears the plan. Pantry inventory is never deducted.
- Discard draft restores the last committed meals. Drafts save automatically in this browser; they do not affect groceries until committed. Calendar view settings are independent of draft discard.

## Shared state and ownership

This is one coordinated integration slice across frontend, planning, meal workflow, and pantry persistence owners. The only contracts remain in `src/lib/contracts.ts`; the existing household reducer/provider and `lunchbox.household.v1` storage adapter remain the only state path. No package, API route, credentials, or hosting changes are required.

`PlannedMeal` has optional `date` and `slot` fields, supplied together. `state.meals` contains committed snapshots. `workspace.calendar.draft` is null when clean or an independently validated editable snapshot array. Calendar settings and drafts are additive version-1 defaults; legacy pantry, preferences, saved recipes, chat, and committed snapshots are preserved. Arrays enforce the existing 50-meal cap, unique IDs, and one meal per date/slot. The first edit pins the initial displayed week for later visits.

The pure date/fill helpers live in `src/features/planning/calendar.ts`. Ingredient matching and shortage calculations are unchanged: scale servings, combine canonical ingredient ID/unit requirements, and subtract pantry stock once. Chat reviews the current draft as a preview, with a reminder to commit before updating groceries.

## Verification

Run `npm run check` and `npm run build` on the pinned Node runtime. Focused tests cover additive save migration, independent draft/committed persistence, invalid/overlapping entries, commit/discard, unchanged stock, repeat and unique fill, limits, and date arithmetic across DST, leap days, and year boundaries.

Browser acceptance: repeat three lunches → verify empty groceries before commit → commit → verify combined shortages; drag from tray, move and swap occupied meals; edit servings and repeat on mobile; reload and discard drafts; use saved and chat recipes; extend and navigate days; verify loading, empty and retry states. A smaller screen scrolls the calendar horizontally without overflowing the page.
