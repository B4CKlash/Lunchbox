# LunchBox

**Your kitchen, connected.**

LunchBox connects the food you have, the meals you plan, and the groceries you need. The goal is to give people time back by turning everyday meal decisions into a practical kitchen workflow.

## Try the app

[Open LunchBox](https://lunchbox-snowy.vercel.app).

The shared hackathon foundation provides a pantry → meal suggestions → shopping flow, with sample ingredients, a demo recipe provider, serving calculations, and browser-local saved state. It gives five contributors clear places to build without recreating the core application.

There is no connected AI, shared database, or account system yet. Suggestions are labeled as demo results. Planning meals calculates shortages without deducting pantry inventory.

## Run locally

Use Node **24.21.0** (see `.nvmrc`) and npm:

```sh
git clone https://github.com/B4CKlash/Lunchbox.git
cd Lunchbox
npm ci
npm run dev
```

Open `http://localhost:3000`. The home page redirects to `/pantry`; `/meals` and `/shopping` complete the demo.

```sh
npm run check  # lint, type checking, and tests
npm run build  # production build
npm run start  # serve the production build
```

The app uses Next.js 16, React 19, TypeScript, and Zod 4. On Nate's prepared Mac, run `source ./scripts/use-hackathon-tools.sh` to enable the installed tools. Other contributors should use their own Node installation.

## Work as a team

Read [the team handoff](docs/TEAM_HANDOFF.md) for ownership, first tasks, contracts, and completion criteria. [AGENTS.md](AGENTS.md) gives coding agents the same boundaries.

| Owner | Entry point |
| --- | --- |
| Integration lead | Shared contracts, routes, configuration, CI, merges, deployment |
| Pantry + storage | `src/features/pantry/` |
| AI workflow | `src/features/meals/`, `/api/meals/suggest` |
| Plan + shopping logic | `src/features/planning/` |
| Frontend + demo experience | `src/components/`, `src/app/globals.css` |

Pull current `main`, work on a feature branch, and open a focused pull request. Coordinate shared contract changes through the integration lead. Run checks and the production build before handoff.

Vercel is connected to this repository: pull requests get previews and `main` deploys to [the canonical app](https://lunchbox-snowy.vercel.app). Reuse the existing `no-name-4c11/lunchbox` project.

## Original concept and references

The broader idea connects the food you have, meals you plan, groceries you buy, and what you cook. Purchase confirmation, cooking updates, leftovers, and undo remain design references beyond this initial app foundation.

| File | Purpose |
| --- | --- |
| [Interactive concept](LunchBox_Interactive_Concept.html) | Original clickable design; open directly in a browser without installation |
| [Design portfolio — PDF](LunchBox_Product_Design_Portfolio.pdf) | Product and visual design reference |
| [Design portfolio — PowerPoint](LunchBox_Product_Design_Portfolio.pptx) | Editable presentation of the concept |
| [Hackathon preparation](HACKATHON_READY.md) | Setup notes, event timing, and credit redemption checklist |

Keep API keys in ignored environment files and server-side Vercel settings. No API key is needed for the demo provider.

Built for the [IA40 Hackathon](https://www.aicseattle.com/events/ia40-hackathon), September 29, 2026.
