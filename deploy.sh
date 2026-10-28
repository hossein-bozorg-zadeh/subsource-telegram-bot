#!/usr/bin/env bash
#
# One-command deployment for the SubSource Telegram bot.
#
#   ./deploy.sh              interactive: prompts for missing values
#   ./deploy.sh --yes        non-interactive: everything must be in the env
#   ./deploy.sh --skip-install --skip-api-check
#
# It creates the D1 database, patches wrangler.jsonc, applies migrations,
# deploys the Worker, uploads secrets, registers the webhook and commands, and
# verifies /health. Safe to re-run.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

DB_NAME="subsource-bot"
ASSUME_YES=0
SKIP_INSTALL=0
SKIP_API_CHECK=0

if [[ -t 1 ]]; then
  C_RESET=$'\033[0m'; C_BOLD=$'\033[1m'; C_DIM=$'\033[2m'
  C_GREEN=$'\033[32m'; C_YELLOW=$'\033[33m'; C_RED=$'\033[31m'; C_BLUE=$'\033[34m'
else
  C_RESET=""; C_BOLD=""; C_DIM=""; C_GREEN=""; C_YELLOW=""; C_RED=""; C_BLUE=""
fi

info() { printf '%s→%s %s\n' "$C_BLUE" "$C_RESET" "$*"; }
ok() { printf '%s✓%s %s\n' "$C_GREEN" "$C_RESET" "$*"; }
warn() { printf '%s!%s %s\n' "$C_YELLOW" "$C_RESET" "$*" >&2; }
die() { printf '%s✗%s %s\n' "$C_RED" "$C_RESET" "$*" >&2; exit 1; }

usage() {
  cat <<'EOF'
Usage: ./deploy.sh [options]

Options:
  -y, --yes            Never prompt. BOT_TOKEN, SUBSOURCE_API_KEY and
                       TELEGRAM_WEBHOOK_SECRET must already be exported.
  --skip-install       Do not run npm install even if node_modules is missing.
  --skip-api-check     Skip the SubSource API key probe.
  -h, --help           Show this help.

Values are read from the environment first, then from .dev.vars.
EOF
}

for arg in "$@"; do
  case "$arg" in
    -y|--yes) ASSUME_YES=1 ;;
    --skip-install) SKIP_INSTALL=1 ;;
    --skip-api-check) SKIP_API_CHECK=1 ;;
    -h|--help) usage; exit 0 ;;
    *) die "Unknown option: $arg (try --help)" ;;
  esac
done

# ---------------------------------------------------------------- prerequisites
command -v node >/dev/null 2>&1 || die "Node.js 20+ is required."
command -v npm >/dev/null 2>&1 || die "npm is required."
command -v curl >/dev/null 2>&1 || die "curl is required."

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[[ "$NODE_MAJOR" -ge 20 ]] || die "Node.js 20+ is required (found $(node -v))."

if [[ -f .dev.vars ]]; then
  set -a
  # shellcheck disable=SC1091
  source .dev.vars
  set +a
  info "Loaded .dev.vars"
fi

# --------------------------------------------------------------------- prompts
prompt_value() { # name label secret allow_empty
  local name="$1" label="$2" secret="$3" allow_empty="$4" current value

  eval "current=\${$name-}"
  if [[ -n "${current:-}" ]]; then
    return 0
  fi

  if [[ "$ASSUME_YES" == "1" ]]; then
    if [[ "$allow_empty" == "1" ]]; then
      return 0
    fi
    die "$name must be set when running with --yes."
  fi

  value=""
  if [[ "$secret" == "1" ]]; then
    read -r -s -p "$label: " value
    printf '\n'
  else
    read -r -p "$label: " value
  fi

  if [[ -z "$value" && "$allow_empty" != "1" ]]; then
    die "$label is required."
  fi

  printf -v "$name" '%s' "$value"
}

prompt_value BOT_TOKEN "Telegram bot token from @BotFather" 1 0
prompt_value SUBSOURCE_API_KEY "SubSource API key" 1 0
prompt_value TELEGRAM_WEBHOOK_SECRET "Webhook secret (leave empty to generate)" 1 1
prompt_value ADMIN_TELEGRAM_IDS "Your Telegram numeric ID (optional, /id later)" 0 1

if [[ -z "${TELEGRAM_WEBHOOK_SECRET:-}" ]]; then
  if command -v openssl >/dev/null 2>&1; then
    TELEGRAM_WEBHOOK_SECRET="$(openssl rand -hex 32)"
  else
    TELEGRAM_WEBHOOK_SECRET="$(node -e 'console.log(require("node:crypto").randomBytes(32).toString("hex"))')"
  fi
  ok "Generated TELEGRAM_WEBHOOK_SECRET"
fi

[[ ${#TELEGRAM_WEBHOOK_SECRET} -ge 16 ]] \
  || die "TELEGRAM_WEBHOOK_SECRET must be at least 16 characters."

export BOT_TOKEN SUBSOURCE_API_KEY TELEGRAM_WEBHOOK_SECRET
export ADMIN_TELEGRAM_IDS="${ADMIN_TELEGRAM_IDS:-}"

# ------------------------------------------------------- telegram sanity check
json_field() {
  node -e '
    let raw = "";
    process.stdin.on("data", (chunk) => { raw += chunk; });
    process.stdin.on("end", () => {
      try {
        let value = JSON.parse(raw);
        for (const key of process.argv[1].split(".")) value = value?.[key];
        if (value !== undefined && value !== null) process.stdout.write(String(value));
      } catch {}
    });
  ' "$1"
}

info "Checking the Telegram bot token..."
ME_JSON="$(curl -fsS --max-time 20 "https://api.telegram.org/bot${BOT_TOKEN}/getMe" 2>/dev/null || true)"
BOT_USERNAME="$(printf '%s' "$ME_JSON" | json_field result.username)"
[[ -n "$BOT_USERNAME" ]] || die "Telegram rejected BOT_TOKEN. Check the token from @BotFather."
ok "Bot: @$BOT_USERNAME"

if [[ "$SKIP_API_CHECK" != "1" ]]; then
  info "Checking the SubSource API key..."
  API_STATUS="$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 \
    -H "X-API-Key: $SUBSOURCE_API_KEY" \
    "https://api.subsource.net/api/v1/movies/search?searchType=text&q=matrix&limit=1" || true)"

  if [[ "$API_STATUS" != "200" ]]; then
    warn "SubSource returned HTTP ${API_STATUS:-error} for the key probe."
    if [[ "$ASSUME_YES" == "1" ]]; then
      die "Fix SUBSOURCE_API_KEY or re-run with --skip-api-check."
    fi
    read -r -p "Continue anyway? [y/N] " reply
    [[ "$reply" =~ ^[Yy]$ ]] || die "Aborted."
  else
    ok "SubSource API key works"
  fi
fi

# ------------------------------------------------------------- dependencies
if [[ ! -d node_modules ]]; then
  if [[ "$SKIP_INSTALL" == "1" ]]; then
    die "node_modules is missing. Run npm install (or omit --skip-install)."
  fi
  info "Installing dependencies..."
  npm install
fi

# ------------------------------------------------------------ cloudflare auth
info "Checking Cloudflare authentication..."
WHOAMI="$(npx --no-install wrangler whoami 2>&1 || true)"
if grep -qiE "not authenticated|not logged in|unable to authenticate" <<<"$WHOAMI"; then
  if [[ "$ASSUME_YES" == "1" ]]; then
    die "Not logged in to Cloudflare. Run 'npx wrangler login' first."
  fi
  warn "Not logged in to Cloudflare."
  npx --no-install wrangler login
  WHOAMI="$(npx --no-install wrangler whoami 2>&1 || true)"
  grep -qiE "not authenticated|not logged in|unable to authenticate" <<<"$WHOAMI" \
    && die "Cloudflare login did not complete."
fi
ok "Cloudflare account ready"

# --------------------------------------------------------------------- D1
d1_id_from_json() {
  node -e '
    let raw = "";
    process.stdin.on("data", (chunk) => { raw += chunk; });
    process.stdin.on("end", () => {
      try {
        const list = JSON.parse(raw);
        const match = Array.isArray(list)
          ? list.find((db) => db.name === process.argv[1])
          : null;
        if (match) process.stdout.write(String(match.uuid ?? match.id ?? ""));
      } catch {}
    });
  ' "$1"
}

info "Looking for the D1 database \"$DB_NAME\"..."
DB_ID="$(npx --no-install wrangler d1 list --json 2>/dev/null | d1_id_from_json "$DB_NAME" || true)"

if [[ -z "$DB_ID" ]]; then
  info "Creating D1 database \"$DB_NAME\"..."
  CREATE_OUT="$(npx --no-install wrangler d1 create "$DB_NAME" 2>&1)" || {
    printf '%s\n' "$CREATE_OUT"
    die "Could not create the D1 database."
  }
  printf '%s\n' "$CREATE_OUT"
  DB_ID="$(printf '%s' "$CREATE_OUT" \
    | grep -oE '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}' \
    | head -1 || true)"

  if [[ -z "$DB_ID" ]]; then
    DB_ID="$(npx --no-install wrangler d1 list --json 2>/dev/null | d1_id_from_json "$DB_NAME" || true)"
  fi
fi

[[ -n "$DB_ID" ]] || die "Could not determine the D1 database id."
ok "D1 database: $DB_ID"

node scripts/configure.mjs \
  --database-id "$DB_ID" \
  --database-name "$DB_NAME" \
  --bot-username "$BOT_USERNAME"

# --------------------------------------------------------------- migrations
info "Applying migrations to the remote database..."
if ! npx --no-install wrangler d1 migrations apply "$DB_NAME" --remote </dev/null; then
  die "Migrations failed. Check the D1 database and wrangler output above."
fi
ok "Database schema is up to date"

# ------------------------------------------------------------------ deploy
info "Deploying the Worker..."
DEPLOY_OUT="$(npx --no-install wrangler deploy 2>&1)" || {
  printf '%s\n' "$DEPLOY_OUT"
  die "wrangler deploy failed."
}
printf '%s\n' "$DEPLOY_OUT"

PARSED_URL="$(printf '%s' "$DEPLOY_OUT" \
  | grep -oE 'https://[A-Za-z0-9._-]+\.workers\.dev' \
  | head -1 || true)"

WORKER_URL="${WORKER_URL:-}"
if [[ -n "$PARSED_URL" ]]; then
  WORKER_URL="$PARSED_URL"
fi

if [[ -z "$WORKER_URL" ]]; then
  if [[ "$ASSUME_YES" == "1" ]]; then
    die "Could not detect the Worker URL. Set WORKER_URL and re-run."
  fi
  read -r -p "Worker URL (https://...workers.dev): " WORKER_URL
fi

WORKER_URL="${WORKER_URL%/}"
[[ "$WORKER_URL" == https://* ]] || die "WORKER_URL must start with https://"
ok "Worker URL: $WORKER_URL"

# ----------------------------------------------------------------- secrets
put_secret() { # name value
  local name="$1" value="$2" output
  if [[ -z "$value" ]]; then
    return 0
  fi

  if ! output="$(printf '%s' "$value" | npx --no-install wrangler secret put "$name" 2>&1)"; then
    printf '%s\n' "$output"
    die "Could not set secret $name."
  fi
  ok "Secret $name set"
}

info "Uploading secrets..."
put_secret BOT_TOKEN "$BOT_TOKEN"
put_secret SUBSOURCE_API_KEY "$SUBSOURCE_API_KEY"
put_secret TELEGRAM_WEBHOOK_SECRET "$TELEGRAM_WEBHOOK_SECRET"
put_secret ADMIN_TELEGRAM_IDS "${ADMIN_TELEGRAM_IDS:-}"

# Keep local tooling in sync with what was deployed.
node scripts/env-file.mjs .dev.vars \
  "BOT_TOKEN=$BOT_TOKEN" \
  "SUBSOURCE_API_KEY=$SUBSOURCE_API_KEY" \
  "TELEGRAM_WEBHOOK_SECRET=$TELEGRAM_WEBHOOK_SECRET" \
  "ADMIN_TELEGRAM_IDS=${ADMIN_TELEGRAM_IDS:-}" \
  "BOT_USERNAME=$BOT_USERNAME" \
  "WORKER_URL=$WORKER_URL"

# ------------------------------------------------------- webhook + commands
info "Registering the Telegram webhook..."
BOT_TOKEN="$BOT_TOKEN" \
TELEGRAM_WEBHOOK_SECRET="$TELEGRAM_WEBHOOK_SECRET" \
WORKER_URL="$WORKER_URL" \
node scripts/set-webhook.mjs

info "Registering bot commands..."
BOT_TOKEN="$BOT_TOKEN" node scripts/set-commands.mjs

# --------------------------------------------------------------- health check
info "Checking $WORKER_URL/health ..."
HEALTH=""
for attempt in 1 2 3 4 5 6; do
  HEALTH="$(curl -fsS --max-time 10 "$WORKER_URL/health" 2>/dev/null || true)"
  if [[ -n "$HEALTH" ]]; then
    break
  fi
  sleep 2
done

if [[ -z "$HEALTH" ]]; then
  warn "The Worker did not answer /health yet. Check 'npx wrangler tail'."
else
  ok "Worker health: $HEALTH"
fi

# ------------------------------------------------------------------- summary
printf '\n%s%sDeployment complete%s\n\n' "$C_BOLD" "$C_GREEN" "$C_RESET"
printf '  Bot:       %shttps://t.me/%s%s\n' "$C_DIM" "$BOT_USERNAME" "$C_RESET"
printf '  Worker:    %s\n' "$WORKER_URL"
printf '  Database:  %s\n' "$DB_ID"

if [[ -z "${ADMIN_TELEGRAM_IDS:-}" ]]; then
  printf '\n%sNext:%s open the bot, send /id, then grant yourself admin access:\n' "$C_YELLOW" "$C_RESET"
  printf '  printf %s | npx wrangler secret put ADMIN_TELEGRAM_IDS\n' "'123456789'"
  printf 'Then reopen the bot and send /admin.\n'
else
  printf '\n%sNext:%s open the bot and send /admin.\n' "$C_YELLOW" "$C_RESET"
fi
