/**
 * Bindings and deployment variables available to the Worker.
 *
 * Secrets are configured with `wrangler secret put <NAME>`:
 *   - BOT_TOKEN
 *   - SUBSOURCE_API_KEY
 *   - TELEGRAM_WEBHOOK_SECRET
 *   - ADMIN_TELEGRAM_IDS (optional, comma-separated)
 *
 * Non-secret values can live in `wrangler.jsonc` under `vars`.
 */
export interface Env {
  DB: D1Database;

  BOT_TOKEN: string;
  SUBSOURCE_API_KEY: string;
  TELEGRAM_WEBHOOK_SECRET: string;

  ADMIN_TELEGRAM_IDS?: string;
  BOT_USERNAME?: string;
  APP_ENV?: string;
  LOG_LEVEL?: string;
  RATE_LIMIT_PER_MINUTE?: string;
  DOWNLOAD_LIMIT_PER_HOUR?: string;
  SUBTITLES_PER_PAGE?: string;
  RECENT_PER_PAGE?: string;
  SEARCH_RESULTS?: string;

  /**
   * Optional private channel used as a subtitle cache. The bot must be an
   * admin there. When set, downloaded subtitles are stored in the channel and
   * repeat requests are served with copyMessage instead of a SubSource call.
   */
  CACHE_CHANNEL_ID?: string;
}
