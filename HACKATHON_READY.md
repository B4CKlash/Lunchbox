# LunchBox hackathon preparation

Checked September 29, 2026 on Nate's Mac.

## Start here

Double-click **Start LunchBox.command** to open a terminal in this folder with the prepared Node LTS runtime. Use Zed or Cursor as your editor. Run `codex` in that terminal to work with Codex.

In an existing terminal, run:

```sh
cd /Users/natedawg/Documents/Projects/LunchBox
source ./scripts/use-hackathon-tools.sh
./scripts/check-hackathon.sh
```

The Node installation is specific to this machine, stored in `~/.local/share/lunchbox-toolchain/`. It does not replace the system/Homebrew installation. Teammates can install the version pinned in `.nvmrc` or `.node-version` using their usual Node version manager.

## Verified

| Item | Result |
| --- | --- |
| Node LTS | 24.21.0, official macOS ARM64 distribution; SHA-256 verified |
| npm | 11.19.0 in the prepared terminal |
| pnpm | 12.8.1 |
| Vercel CLI | 61.0.0; matches npm's current release |
| Codex CLI | 0.159.0; matches npm's current release |
| Codex login | Signed in with ChatGPT |
| GitHub CLI | Authenticated as `B4CKlash`; API access verified |
| Local Git repository | `main` branch connected to `https://github.com/B4CKlash/Lunchbox.git`; existing files saved locally |
| Editor | Zed 1.21.0 verified; Cursor also installed |
| Downloads | npm registry connectivity passed |
| Local development | Node started a local HTTP server and fetched its response successfully |
| Workspace | Existing concept HTML, design PDF, and PowerPoint present |

Homebrew is currently blocked by an unaccepted Xcode license. The prepared Node runtime works independently. A future task needing Homebrew or Xcode may still require you to review and accept that license.

## Account and team setup remaining

- Finish Vercel signup and browser/CLI sign-in; confirm `vercel whoami` succeeds. GitHub sign-in reported that it is not connected to a Vercel account. Signup is waiting for your decision because joining accepts Vercel's terms.
- In [Vercel account authentication](https://vercel.com/account/authentication), verify GitHub is connected to `B4CKlash`.
- Choose the Vercel team that will own LunchBox and receive the event credits. Record its exact `team_…` ID from **Settings → General**.
- Confirm your OpenAI API-platform organization at [platform.openai.com](https://platform.openai.com/). ChatGPT/Codex sign-in alone does not verify API organization access or API credits.
- The shared repository is [B4CKlash/Lunchbox](https://github.com/B4CKlash/Lunchbox), created by Nate and currently public. This folder is initialized on `main` with that repository as `origin`. Confirm the deployment owner and add your friends as collaborators when ready.
- Grant the Vercel GitHub App access to `B4CKlash/Lunchbox` and import it from the intended Vercel team. For a personal GitHub repository, its owner must do the import; a collaborator cannot. Organization repositories require suitable organization membership and repository access. App repository access and account login linking are separate checks. See [Vercel's GitHub integration requirements](https://vercel.com/docs/git/vercel-for-github).
- Before pushing, confirm the local Git commit email is a verified address on your GitHub account. Your existing Git identity was preserved, but the current GitHub API credential could not verify the account's email list.

The initial commit is local only. When ready to publish the concept/design files and preparation notes to the public repository, run `git push -u origin main`. This first push also establishes upstream tracking; the empty remote has no branch to track yet.

**Team deployment caveat:** Vercel Hobby does not support collaboration on private repositories. Friends' commits can be blocked from deployment. Public-repository collaboration is free; private collaboration requires an appropriate Pro team setup and may add paid seats. Choose the arrangement with your friends or Vercel staff before importing. No plan upgrade or public repository was created during preparation. See [Vercel's collaboration troubleshooting](https://vercel.com/docs/deployments/troubleshoot-project-collaboration).

## At check-in: redeem the four codes

The [hackathon guide](https://www.aicseattle.com/events/ia40-hackathon) says codes and redemption instructions arrive at your registration email after check-in.

| Credit | Redemption and verification |
| --- | --- |
| Vercel v0 | Follow the check-in email for this code and verify the balance in the intended v0 account. These credits cover AI generation, not hosting. |
| Vercel AI Gateway | The guide directs you to [credits.vercel.sh](https://credits.vercel.sh/) with your email, the receiving team's exact `team_…` ID, and promo code. Submission requests processing; verify the balance in that same team's **AI Gateway → Overview** once applied. |
| OpenAI Codex, $100 | Open your unique redemption link while signed into a **personal ChatGPT workspace**. Business, Team, and managed workspaces are excluded by the guide. |
| OpenAI API, $50 | Open your unique API redemption link and select the API organization intended for this project. Verify that the credit appears there. |

Vercel amounts and expiration dates are in the check-in email. The guide's Vercel accordion is general; follow any product-specific instructions in the email and ask staff if the v0 path differs. Do not assume the four balances are interchangeable or that teammates' codes can be pooled.

When the app needs an API key, create it in the organization/team that received the corresponding credits. Store it only in an ignored local environment file and the server-side Vercel project environment. The prepared `.gitignore` excludes `.env`, `.env.*` except `.env.example`, and `.vercel/`. For AI Gateway, the guide names `AI_GATEWAY_API_KEY` and the OpenAI-compatible endpoint `https://ai-gateway.vercel.sh/v1`. Choose the API route before connecting billing; no key or paid AI request was created during preparation.

## Today's timing — Pacific

| Time | Milestone |
| --- | --- |
| 12:30 PM | Check-in; collect codes |
| 1:00 PM | Kickoff and rules |
| 1:15 PM | Team formation |
| 1:30 PM | Build begins |
| 3:45 PM | Submission form arrives by email and Orena |
| **4:00 PM** | **Submissions close** |
| 4:15 PM | Finalist demos, five minutes each |
| 4:55 PM | Winners announced |

Location: Four Seasons Seattle, 99 Union St, 2nd Floor. Bring the laptop and charger. Venue Wi-Fi details are on the guide.

LunchBox's existing concept demonstrates the pantry → meal plan → shopping → cooking loop. Confirm the kickoff rules about using prepared concepts/code. The advertised challenge is technology that gives time back through useful AI actions; pick one working LunchBox workflow as the core demo. At kickoff, assign the repository/deployment owner, integrate one small workflow early, and leave time to submit before 4 PM.

## Changes made during preparation

- Installed and verified the official Node 24.21.0 LTS distribution outside the workspace.
- Added Node version pins, a terminal launcher, an environment activation helper, a readiness check, and a secrets/build-output `.gitignore`.
- Kept the existing concept/design artifacts intact.
- Connected the local folder to Nate's GitHub repository and saved the existing files in an initial local commit. No files were pushed to GitHub.
- No app scaffold, deployment, credit redemption, API key creation, or paid plan change was performed.
