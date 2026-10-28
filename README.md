# SubSource Telegram Bot — Cloudflare Workers

A Telegram bot that searches and downloads subtitles from
[SubSource.net](https://subsource.net) using their public API, running entirely
on **Cloudflare Workers** with **D1** for storage. No servers, no polling loop,
no runtime npm dependencies.

The bot is feature-complete for day-to-day use: user search/download flows,
filters, download history, subtitle previews, per-user limits, and a full
Telegram admin panel with broadcasts, user blocking and admin management.

---

## Features

### For users

- `/start` — welcome screen with inline menu
- `/search <title | IMDb ID | IMDb URL>` — movie and TV search
- `/recent` — latest uploads with pagination
- Movie / TV detail page with subtitle pagination
- One-tap subtitle download (ZIP) with a caption describing language, release,
  framerate, HI/foreign-parts flags and download count
- 👁 **Preview** — read subtitle text before downloading
- `/downloads` — personal download history with re-download and preview buttons
- `/filters` — language, release year and movie/TV filters applied everywhere
- `/preview <subtitle id>` — open a preview directly
- `/me` — personal search/download counters
- `/id` — show the Telegram ID needed for admin access
- `/help`, `/cancel`
- Per-user rate limits for searches, previews and downloads

### For admins (private chat only)

- `/admin` or the **Admin panel** button
- **Stats** — users, 24h activity, searches, downloads, DB admins
- **Users** — paginated list with block/unblock buttons
- **Downloads** — recent downloads with user, title and language
- **Broadcast** — preview, confirm, batched sending, progress, resume
- **Admins** — add/remove database admins (env owners are protected)
- **Settings** — maintenance toggle and runtime-editable limits/pages
- `/broadcast [message]`, `/block <id>`, `/unblock <id>`
- Every privileged action is written to an audit table

---

## One-command deployment

If you just want it live, run:

```bash
npm install
npx wrangler login     # once per machine
./deploy.sh
```

`deploy.sh` asks only for missing values and then:

1. validates the Telegram bot token and SubSource API key,
2. logs in to Cloudflare if needed,
3. creates the D1 database (or reuses it) and patches `wrangler.jsonc`,
4. applies all migrations,
5. deploys the Worker and detects its `workers.dev` URL,
6. uploads `BOT_TOKEN`, `SUBSOURCE_API_KEY`, `TELEGRAM_WEBHOOK_SECRET` and
   `ADMIN_TELEGRAM_IDS` as secrets,
7. registers the webhook and the bot commands,
8. verifies `/health` and prints the next steps.

Values are read from the environment first, then from `.dev.vars`. The script
writes the final values back to `.dev.vars` (mode `0600`) so later runs are
non-interactive.

Useful flags:

```bash
./deploy.sh --yes                 # no prompts; values must be exported
./deploy.sh --skip-install        # never run npm install
./deploy.sh --skip-api-check      # skip the SubSource key probe
npm run deploy:all                # same script through npm
```

It is safe to re-run: the database is reused, migrations are incremental,
secrets are overwritten and the webhook is re-registered.

### Grant yourself admin access

If `ADMIN_TELEGRAM_IDS` was empty, open the bot, send `/id`, then:

```bash
printf '%s' '123456789' | npx wrangler secret put ADMIN_TELEGRAM_IDS
```

Send `/admin` again. Once you are an admin you can add other admins from the
panel without touching secrets.

---

## Manual deployment

```bash
npm install
npm run db:create
```

Put the printed `database_id` into `wrangler.jsonc`, then:

```bash
npm run db:migrate
wrangler secret put BOT_TOKEN
wrangler secret put SUBSOURCE_API_KEY
wrangler secret put TELEGRAM_WEBHOOK_SECRET   # openssl rand -hex 32
wrangler secret put ADMIN_TELEGRAM_IDS        # e.g. 123456789
npm run deploy
```

Set the public username in `wrangler.jsonc` so `/search@MyBot` works:

```jsonc
"vars": {
  "APP_ENV": "production",
  "BOT_USERNAME": "MyBot",
  "LOG_LEVEL": "info"
}
```

Then register the webhook:

```bash
cp .dev.vars.example .dev.vars
# fill in BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET and WORKER_URL
npm run webhook:set
npm run commands:set
```

The webhook URL is `https://<WORKER_URL>/telegram/webhook`.
`TELEGRAM_WEBHOOK_SECRET` must be at least 16 characters; Telegram sends it in
the `X-Telegram-Bot-Api-Secret-Token` header and the Worker rejects requests
without it.

---

## Local development

```bash
cp .dev.vars.example .dev.vars
# fill in the values
npm run db:migrate:local
npm run dev
```

Wrangler serves the Worker at `http://localhost:8787`. Telegram cannot reach
localhost, so expose it with a tunnel:

```bash
cloudflared tunnel --url http://localhost:8787
```

Set `WORKER_URL` in `.dev.vars` to the tunnel URL and run
`npm run webhook:set`. Change it back and re-run when you deploy.

Local endpoints:

```bash
curl http://localhost:8787/
curl http://localhost:8787/health
```

Test and type-check:

```bash
npm run check        # tsc --noEmit + vitest
npm test             # tests only
npm run typecheck
```

---

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/` | Worker name/version and route list |
| `GET` | `/health` | D1 connectivity health check |
| `POST` | `/telegram/webhook` | Telegram updates (secret header required) |

There is no public admin web UI. The admin panel is inside Telegram.

---

## Configuration

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `DB` | yes | — | D1 binding, configured in `wrangler.jsonc` |
| `BOT_TOKEN` | yes | — | Secret from BotFather |
| `SUBSOURCE_API_KEY` | yes | — | Secret from SubSource |
| `TELEGRAM_WEBHOOK_SECRET` | yes | — | 16+ chars, secret |
| `ADMIN_TELEGRAM_IDS` | no | empty | Comma/space-separated owner IDs |
| `BOT_USERNAME` | no | empty | Bot username without `@` |
| `APP_ENV` | no | `production` | Label in admin screens |
| `LOG_LEVEL` | no | `info` | `debug`, `info`, `warn`, `error` |
| `RATE_LIMIT_PER_MINUTE` | no | `20` | Searches/recent/previews per minute |
| `DOWNLOAD_LIMIT_PER_HOUR` | no | `30` | Per-user downloads per hour |
| `SUBTITLES_PER_PAGE` | no | `6` | Subtitle rows per title page |
| `RECENT_PER_PAGE` | no | `8` | Recent rows per page |
| `SEARCH_RESULTS` | no | `8` | Search results per query |

The four numeric limits/pages can also be changed at runtime from
**Admin panel → Settings**; values stored in D1 override the deployment
defaults. Admins are exempt from rate limits and maintenance mode.

---

## Admin panel cheat sheet

| Screen | What you can do |
| --- | --- |
| Stats | Users, active users, searches, downloads, DB admins |
| Users | Page through accounts, block or unblock with one tap |
| Downloads | Last 12 downloads with user, title and language |
| Broadcast | Write a message, preview it, confirm, watch progress, resume |
| Admins | Add by Telegram ID, remove DB admins (env owners are protected) |
| Settings | Maintenance mode and editable limits/pages |

Broadcasts are sent in batches of 20 (four concurrent requests). Each Worker
invocation has an ~18 second budget; if there are more users, the job pauses and
resumes from the stored cursor. A cron runs every 10 minutes to finish paused
jobs, and the admin panel also has a **Resume** button. HTML is attempted first
and automatically retried as plain text for messages with invalid entities.

Blocked users are skipped. Users who blocked the bot simply count as failed
deliveries and are not retried destructively.

---

## Project layout

```text
src/
  index.ts                Worker entry: routing, webhook auth, health, cron
  config.ts               Environment validation
  env.ts                  Worker bindings
  version.ts
  bot/
    dispatch.ts           Update -> user/session/context -> route
    context.ts            Per-update context (reply/edit/answer/session)
    callbacks.ts          Compact callback_data codec
    keyboards.ts          Inline keyboards
    text.ts               User-facing copy
    presenters.ts         Screen/caption renderers
    limits.ts             Per-user limit enforcement
    parse-command.ts      /command@Bot parsing
  handlers/
    user.ts               Search, movie, recent, download, preview, filters
    admin.ts              Admin panel, broadcasts, admins, limits, blocking
    broadcast.ts          Batched delivery + cron resume
  subsource/              Typed SubSource API client
  telegram/               Typed Telegram Bot API client
  db/                     D1 queries (users, admins, broadcasts, ...)
  lib/                    Formatting, logger, errors, IMDb, filters, limits
migrations/
  0001_init.sql
  0002_features.sql
scripts/
  env.mjs                 .dev.vars loader
  env-file.mjs            Safe .dev.vars upsert
  configure.mjs           Patches wrangler.jsonc
  set-webhook.mjs
  set-commands.mjs
deploy.sh                 One-command production deployment
test/                     Vitest unit tests
```

---

## Database

`migrations/0001_init.sql` creates the core tables:

- `users` — one row per Telegram account, `is_blocked`, filter settings JSON
- `admins` — DB-managed admins
- `sessions` — expiry-based multi-step flow state
- `processed_updates` — webhook de-duplication
- `rate_limits` — fixed-window counters
- `settings` — maintenance and runtime limits
- `search_log`, `downloads` — audit/statistics tables

`migrations/0002_features.sql` adds:

- `downloads.title` — readable titles in download history
- `broadcasts` — message, status, cursor, sent/failed counters
- `admin_actions` — audit trail for privileged actions

A cron every 10 minutes removes expired sessions, old rate-limit rows and old
processed updates, releases stale broadcasts, and resumes paused broadcasts.

---

## Extending the bot

1. **New callback** — add an action to `src/bot/callbacks.ts`, keep
   `callback_data` under 64 bytes, add a keyboard button in
   `src/bot/keyboards.ts`, route it from `src/bot/dispatch.ts`.
2. **New user screen** — add a handler in `src/handlers/user.ts`.
3. **New admin feature** — add a view or action to `src/handlers/admin.ts`,
   guard it with `ensureAdmin` and record it with `logAdminAction`.
4. **New storage** — add a migration (never edit an applied one), query helpers
   in `src/db/`, and export them from `src/db/index.ts`.
5. **Multi-step input** — call `ctx.setSession("name", data, ttl)`, then handle
   the session in `routeSession` in `src/bot/dispatch.ts`.

---

## Limits and security notes

- Telegram bot upload limit is 50 MB; downloads over 49 MB are refused politely.
- SubSource free keys allow 60 requests/minute, 1,800/hour and 7,200/day. Keep
  the bot’s per-user limits below your plan.
- The API key never leaves the Worker. Users never supply their own key.
- Webhook requests are authenticated with the secret token header.
- Every D1 write is parameterized.
- User-facing HTML is escaped, and URLs rendered into `href` attributes are
  escaped too.
- Duplicate Telegram retries are dropped atomically via `processed_updates`.
- Broadcasts are claimed atomically so cron and an admin cannot double-send.
- Logs are structured JSON and visible in Workers Logs / `wrangler tail`.

---

## Troubleshooting

| Symptom | Check |
| --- | --- |
| `401 unauthorized` from the webhook | `TELEGRAM_WEBHOOK_SECRET` differs between Telegram and the Worker; re-run `npm run webhook:set` |
| Bot does not respond | `npm run webhook:info`; then `npx wrangler tail` |
| `SubSource rejected the API key` | `SUBSOURCE_API_KEY` is wrong, expired or regenerated |
| `no such table` | Run `npm run db:migrate` (remote) / `npm run db:migrate:local` |
| Admin button missing | Your numeric ID is not in `ADMIN_TELEGRAM_IDS` or `admins` |
| `Missing required environment variables` | Set the secrets with `wrangler secret put` |
| `/health` returns 503 | D1 binding/database ID is wrong or migrations were not applied |
| Broadcast stuck on “Paused” | Cron resumes within 10 minutes, or tap **Resume** in the panel |
| `deploy.sh` cannot find the Worker URL | Export `WORKER_URL` and re-run |
