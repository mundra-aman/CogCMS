#!/usr/bin/env bash
# CogNerd CMS — repository-owned production deployment to Vercel.
#
# Usage: scripts/deploy.sh [--scope <team>] [--project <name>] [--host <origin>]
#                          [--dry-run] [--skip-gates] [--yes]
#
# Steps, each failing closed: preflight → gates → staged production-target deployment
# (no domain) → staged health → promote → production health → rollback instructions.
# Environment variables are Vercel project settings; this script never reads or writes them.
set -euo pipefail

SCOPE="${VERCEL_SCOPE:-}"
PROJECT="${VERCEL_PROJECT:-}"
HOST="${CMS_PUBLIC_ORIGIN:-}"
DRY_RUN=0
SKIP_GATES=0
ASSUME_YES=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --scope) SCOPE="$2"; shift 2 ;;
    --project) PROJECT="$2"; shift 2 ;;
    --host) HOST="$2"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    --skip-gates) SKIP_GATES=1; shift ;;
    --yes) ASSUME_YES=1; shift ;;
    -h|--help) sed -n '2,9p' "$0"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

die() { echo "deploy: $*" >&2; exit 1; }
step() { printf '\n== %s\n' "$*"; }
run() {
  if [[ $DRY_RUN -eq 1 ]]; then printf '[dry-run] %s\n' "$*"; else "$@"; fi
}
health_ok() {
  # $1 = URL, $2 = optional protection-bypass secret. Requires {"ok":true,"db":true}.
  local body
  if [[ -n "${2:-}" ]]; then
    body=$(curl -fsS -H "x-vercel-protection-bypass: $2" "$1" 2>/dev/null) || return 1
  else
    body=$(curl -fsS "$1" 2>/dev/null) || return 1
  fi
  [[ "$body" == *'"ok":true'* && "$body" == *'"db":true'* ]]
}
wait_health() {
  # $1 = URL, $2 = bypass secret (may be empty). Alias propagation can take a moment.
  local _attempt
  for _attempt in 1 2 3 4 5 6; do
    if health_ok "$1" "${2:-}"; then return 0; fi
    sleep 5
  done
  return 1
}

step "Preflight"
[[ -n "$SCOPE" && -n "$PROJECT" && -n "$HOST" ]] || die "explicit scope, project and host are required (flags or environment)"
[[ "$SCOPE" =~ ^[a-zA-Z0-9][a-zA-Z0-9_-]*$ && "$PROJECT" =~ ^[a-zA-Z0-9][a-zA-Z0-9_-]*$ ]] || die "invalid scope or project"
[[ "$HOST" =~ ^https://[a-zA-Z0-9.-]+(:[0-9]+)?$ ]] || die "host must be an explicit HTTPS origin without a path or credentials"
[[ -f package.json ]] || die "run from the repository root"
[[ -f .vercelignore ]] || die ".vercelignore is missing"
{ grep -qxF '.env' .vercelignore && grep -qxF '.env.*' .vercelignore; } \
  || die ".vercelignore must list both .env and .env.* so no environment file can be uploaded"
{ git diff --quiet && git diff --cached --quiet; } || die "working tree must be clean (commit or stash first)"
[[ -z "$(git ls-files --others --exclude-standard)" ]] || die "working tree must be clean (untracked files present)"
COMMIT=$(git rev-parse --short HEAD)
BRANCH=$(git branch --show-current || echo detached)
echo "commit $COMMIT on $BRANCH -> $SCOPE/$PROJECT -> $HOST"
if [[ $DRY_RUN -eq 0 ]]; then
  command -v vercel >/dev/null || die "vercel CLI not found"
  vercel whoami --scope "$SCOPE" >/dev/null || die "vercel CLI is not authenticated for scope $SCOPE"
  vercel link --yes --scope "$SCOPE" --project "$PROJECT" >/dev/null
fi

if [[ $SKIP_GATES -eq 0 ]]; then
  step "Gates: typecheck, test, build"
  run npm run typecheck
  run npm test
  MONGOMS_DISABLE_POSTINSTALL=1 run npm run build
else
  step "Gates skipped (--skip-gates)"
fi

step "Stage: production-target deployment without a domain"
if [[ $DRY_RUN -eq 1 ]]; then
  run vercel deploy --prod --skip-domain --yes --scope "$SCOPE"
  STAGED="https://<staged-deployment>.vercel.app"
else
  DEPLOY_OUTPUT=$(vercel deploy --prod --skip-domain --yes --scope "$SCOPE")
  # Vercel 59 emits JSON in agent mode; only an immutable deployment URL
  # may reach a health request or promotion. Never echo malformed CLI output.
  STAGED=$(printf '%s' "$DEPLOY_OUTPUT" | node -e '
    const fs = require("node:fs");
    try {
      const raw = fs.readFileSync(0, "utf8").trim();
      let url = raw;
      if (raw.startsWith("{")) {
        const result = JSON.parse(raw);
        if (result.status !== undefined && result.status !== "ok") throw Error();
        url = result.deployment?.url ?? result.url;
      }
      if (typeof url !== "string" || !/^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(url)) throw Error();
      process.stdout.write(url);
    } catch { console.error("deploy: invalid Vercel deployment result"); process.exit(1); }
  ') || die "could not identify staged deployment; nothing promoted"
fi
echo "staged: $STAGED"

step "Verify staged: $STAGED/api/health"
BYPASS="${VERCEL_AUTOMATION_BYPASS_SECRET:-}"
if [[ $DRY_RUN -eq 1 ]]; then
  echo "[dry-run] curl $STAGED/api/health (expects ok:true, db:true)"
else
  # An empty bypass permits public health checks, never waives them. --yes
  # cannot promote an unhealthy or inaccessible protected deployment.
  wait_health "$STAGED/api/health" "$BYPASS" || die "staged deployment failed its health check; nothing was promoted"
  echo "staged health ok"
fi

step "Promote"
run vercel promote "$STAGED" --yes --scope "$SCOPE"

step "Verify production: $HOST/api/health"
if [[ $DRY_RUN -eq 1 ]]; then
  echo "[dry-run] curl $HOST/api/health (expects ok:true, db:true)"
elif ! wait_health "$HOST/api/health" ""; then
  echo "production health check FAILED after promotion." >&2
  echo "Roll back now:  vercel rollback --yes --scope $SCOPE" >&2
  exit 1
fi

step "Release record"
echo "commit=$COMMIT branch=$BRANCH staged=$STAGED promoted_to=$HOST at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "Rollback to the previous production deployment:  vercel rollback --yes --scope $SCOPE"
echo "Or promote any earlier deployment:                vercel promote <url> --yes --scope $SCOPE"
