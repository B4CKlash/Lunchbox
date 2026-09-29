#!/bin/zsh
# Read-only readiness check. No deployment, account changes, or AI usage.
cd -- "${0:A:h}/.." || exit 1
source ./scripts/use-hackathon-tools.sh || exit 1
failed=0
check() {
  local label="$1"
  shift
  printf '\n%s\n' "$label"
  if ! "$@"; then
    printf 'NEEDS ATTENTION: %s\n' "$label" >&2
    failed=1
  fi
}
check 'Node runtime' node --version
check 'npm package manager' npm --version
check 'pnpm package manager' pnpm --version
check 'Vercel CLI' vercel --version
check 'Vercel account' vercel whoami
check 'Codex CLI' codex --version
check 'Codex account' codex login status
check 'GitHub account' gh api user --jq .login
check 'Package registry connection' npm ping
printf '\nThis checks tools and sign-ins. Project access and credits require their own dashboard checks.\n'
exit "$failed"
