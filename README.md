# LunchBox

**Your kitchen, connected.**

LunchBox connects the food you have, the meals you plan, and the groceries you need. The goal is to give people time back by turning everyday meal decisions into a practical kitchen workflow.

## The idea

1. Record what's in your pantry, fridge, freezer, garden, or farm share.
2. Choose meals that use what you already have.
3. Plan servings and turn missing ingredients into a grocery list.
4. Confirm what you actually bought and put away.
5. Record what you cooked, update inventory, and keep track of leftovers.

The hackathon build will explore AI that helps carry out this workflow. The current prototype demonstrates the interactions with sample data.

## Current status

This repository contains an interactive concept, design materials, and development setup helpers. It does not yet contain a production application, backend, or connected AI service.

The concept supports meal planning, saved recipes, pantry edits, shopping checkoffs, confirmed purchases, cooking updates, leftovers, and undo. It uses three sample recipes and a fixed sample week. Changes stay in the browser when local storage is available.

AI generation, recipe import, nutrition calculations, household synchronization, and external integrations are proposed features, not working integrations in this prototype.

## Try the concept

```sh
git clone https://github.com/B4CKlash/Lunchbox.git
cd Lunchbox
```

Open [LunchBox_Interactive_Concept.html](LunchBox_Interactive_Concept.html) in your browser. No installation, API key, or build step is required for the concept. Use its reset control to restore the sample household.

## What's here

| File | Purpose |
| --- | --- |
| [Interactive concept](LunchBox_Interactive_Concept.html) | Clickable kitchen workflow with browser-local sample data |
| [Design portfolio — PDF](LunchBox_Product_Design_Portfolio.pdf) | Product and visual design reference |
| [Design portfolio — PowerPoint](LunchBox_Product_Design_Portfolio.pptx) | Editable presentation of the concept |
| [Hackathon preparation](HACKATHON_READY.md) | Setup notes, event timing, and credit redemption checklist |
| `.nvmrc` / `.node-version` | Pinned Node version: 24.21.0 |
| `scripts/` | Helpers for the prepared development environment |

## Development setup

For the application build, install the Node version pinned in this repository and use npm or pnpm. There is no `package.json` or application development command yet; the team will add these with the application scaffold.

On Nate's prepared Mac, double-click **Start LunchBox.command**, or run these commands from the repository folder:

```sh
source ./scripts/use-hackathon-tools.sh
./scripts/check-hackathon.sh
```

These helpers use a Node installation stored outside the repository on Nate's Mac. Other contributors should install Node with their own preferred version manager. The readiness check also expects the Vercel CLI, Codex CLI, and GitHub CLI with their respective accounts signed in.

Keep API keys in ignored environment files and server-side deployment settings. The repository ignores local environment files, dependencies, build output, and Vercel project metadata; `.env.example` can be committed with placeholders when the app needs one.

## Working together

- Start from the latest `main` and use a branch for your work.
- Keep changes focused and describe how to try them in your pull request.
- Agree on the app scaffold, deployment owner, and one complete demo workflow at kickoff.
- Keep the prototype's simulated behavior clearly distinguished from connected features as the build develops.

Built for the [IA40 Hackathon](https://www.aicseattle.com/events/ia40-hackathon), September 29, 2026.
