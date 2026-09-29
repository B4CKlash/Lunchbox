#!/bin/zsh
# Open a terminal in this workspace with the prepared Node LTS runtime.
cd -- "${0:A:h}" || exit 1
source ./scripts/use-hackathon-tools.sh || exit 1
printf '\nLunchBox workspace: %s\n' "$PWD"
printf 'Start Codex with: codex\n'
printf 'Check Vercel login with: vercel whoami\n\n'
exec /bin/zsh -i
