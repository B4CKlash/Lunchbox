# LunchBox contributor instructions

LunchBox is a five-person hackathon project. The shared scaffold is in place so each contributor can develop one feature without rebuilding the application foundation. Read `docs/TEAM_HANDOFF.md` before starting work.

## Start and verify

- Use the Node version in `.nvmrc` / `.node-version` and npm with the committed lockfile.
- Run `npm ci`, then `npm run dev`.
- Before a pull request, run `npm run check` and `npm run build`. `check` runs lint, type checking, and tests; the production build is separate.
- Verify the affected user flow in the browser, including relevant loading, empty, and error states. Add focused tests when domain behavior changes.

## Ownership

| Owner | Primary files |
| --- | --- |
| 1. Integration lead | `src/lib/contracts.ts`, application routing, project configuration, dependencies, `.github/`, merging, Vercel deployment |
| 2. Pantry + storage | `src/features/pantry/**` |
| 3. AI workflow | `src/features/meals/**`, `src/app/api/meals/suggest/route.ts` |
| 4. Plan + shopping logic | `src/features/planning/**` |
| 5. Frontend + demo experience | `src/components/**`, `src/app/globals.css` |

- Work on a focused feature branch and open a pull request. Use `codex/` for agent-created branch names unless the user requests another name.
- Keep feature logic in the owning feature directory and screens in `src/components/`. Route files are thin wrappers.
- Shared types and validation live in `src/lib/contracts.ts`. Request contract, dependency, or routing changes through the integration lead rather than introducing parallel definitions or a second application scaffold.
- Cross-owner changes are welcome when coordinated in the pull request. Do not overwrite another contributor's in-progress work.

## Shared behavior

- The flow is pantry → meal suggestions → selected meals → shopping list.
- Match ingredients by canonical ingredient ID **and** unit. `PantryItem.id` corresponds to recipe `ingredientId`, not a stock-lot ID. Supported units are `g`, `ml`, and `each`; do not guess unit conversions or use display names as keys.
- Recipe amounts describe the recipe's base servings. Scale to each planned meal's servings, combine all requirements for an ingredient/unit pair, then subtract available stock once.
- Planning reserves stock conceptually. Adding or removing a planned meal must not deduct or replenish pantry inventory.
- Persist household state through the pantry storage adapter. Keep one versioned household schema and one client provider; do not add competing storage keys or providers.
- The meal endpoint receives `{ pantry, preferences }` and returns `{ source: 'demo' | 'ai', recipes }`. Validate input and output with the shared schemas. Label demo suggestions honestly.
- API credentials belong on the server in ignored environment files or Vercel settings. Do not place secrets in browser code, logs, or committed files.

## Scope and deployment

The scaffold uses Next.js 16, React 19, TypeScript, and Zod 4. It has browser-local saved state and a demo recipe provider. Shared household sync, accounts, live AI, allergen safety, cooking deductions, and purchase workflows are not part of this foundation.

Preserve `LunchBox_Interactive_Concept.html` and the original design portfolio as references. Their broader simulated features are not evidence that the application implements those features.

The integration lead deploys the existing Vercel project `no-name-4c11/lunchbox`. Pull requests receive previews; `main` is the production branch. Use the canonical demo URL, `https://lunchbox-snowy.vercel.app`, and retain deployment protection for preview URLs.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
