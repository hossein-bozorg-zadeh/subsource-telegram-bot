import type { Config } from "../config";
import { LIMIT_KEYS, resolveLimits, type BotLimits } from "../lib/limits";

export function defaultLimits(config: Config): BotLimits {
  return {
    rateLimitPerMinute: config.rateLimitPerMinute,
    downloadLimitPerHour: config.downloadLimitPerHour,
    subtitlesPerPage: config.subtitlesPerPage,
    recentPerPage: config.recentPerPage,
    searchResults: config.searchResults,
  };
}

/**
 * Effective limits = deployment defaults overridden by values an admin saved
 * in the `settings` table. Called once per user interaction.
 */
export async function getLimits(db: D1Database, config: Config): Promise<BotLimits> {
  const rows = await db
    .prepare("SELECT key, value FROM settings")
    .all<{ key: string; value: string }>();

  const values: Record<string, string> = {};
  for (const row of rows.results) values[row.key] = row.value;

  return resolveLimits(values, defaultLimits(config));
}

export { LIMIT_KEYS };
