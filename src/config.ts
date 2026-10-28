import type { Env } from "./env";
import type { LogLevel } from "./lib/logger";

export interface Config {
  botToken: string;
  botUsername: string | null;
  subsourceApiKey: string;
  webhookSecret: string;
  adminIds: ReadonlySet<number>;
  appEnv: string;
  logLevel: LogLevel;
  rateLimitPerMinute: number;
  downloadLimitPerHour: number;
  subtitlesPerPage: number;
  recentPerPage: number;
  searchResults: number;
  /** Storage channel for the subtitle cache; null disables caching. */
  cacheChannelId: number | null;
}

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigurationError";
  }
}

const LOG_LEVELS: readonly LogLevel[] = ["debug", "info", "warn", "error"];

function positiveInt(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new ConfigurationError(`${name} must be a positive integer`);
  }
  return parsed;
}

function boundedInt(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
  name: string,
): number {
  const parsed = positiveInt(value, fallback, name);
  if (parsed < min || parsed > max) {
    throw new ConfigurationError(`${name} must be between ${min} and ${max}`);
  }
  return parsed;
}

function parseAdminIds(value: string | undefined): ReadonlySet<number> {
  const ids = new Set<number>();
  if (!value) return ids;

  for (const part of value.split(/[,\s]+/)) {
    if (!part) continue;
    if (!/^\d+$/.test(part)) {
      throw new ConfigurationError(
        `ADMIN_TELEGRAM_IDS contains an invalid Telegram ID: ${part}`,
      );
    }
    const id = Number(part);
    if (!Number.isSafeInteger(id) || id <= 0) {
      throw new ConfigurationError(
        `ADMIN_TELEGRAM_IDS contains an out-of-range Telegram ID: ${part}`,
      );
    }
    ids.add(id);
  }

  return ids;
}

function parseLogLevel(value: string | undefined): LogLevel {
  const level = (value ?? "info").toLowerCase();
  if (!LOG_LEVELS.includes(level as LogLevel)) {
    throw new ConfigurationError(
      `LOG_LEVEL must be one of: ${LOG_LEVELS.join(", ")}`,
    );
  }
  return level as LogLevel;
}

function parseChannelId(value: string | undefined): number | null {
  const raw = value?.trim();
  if (!raw) return null;
  if (!/^-?\d+$/.test(raw)) {
    throw new ConfigurationError(
      `CACHE_CHANNEL_ID must be a numeric Telegram chat id (e.g. -1001234567890), got: ${raw}`,
    );
  }
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed)) {
    throw new ConfigurationError("CACHE_CHANNEL_ID is out of range");
  }
  return parsed;
}

/**
 * Validate configuration once per request. Failing fast here produces a clear
 * 500 instead of a confusing Telegram API error later.
 */
export function loadConfig(env: Env): Config {
  const botToken = env.BOT_TOKEN?.trim();
  const subsourceApiKey = env.SUBSOURCE_API_KEY?.trim();
  const webhookSecret = env.TELEGRAM_WEBHOOK_SECRET?.trim();

  const missing: string[] = [];
  if (!botToken) missing.push("BOT_TOKEN");
  if (!subsourceApiKey) missing.push("SUBSOURCE_API_KEY");
  if (!webhookSecret) missing.push("TELEGRAM_WEBHOOK_SECRET");

  if (missing.length > 0) {
    throw new ConfigurationError(
      `Missing required environment variables: ${missing.join(", ")}`,
    );
  }

  if (webhookSecret.length < 16) {
    throw new ConfigurationError(
      "TELEGRAM_WEBHOOK_SECRET must be at least 16 characters long",
    );
  }

  const rawUsername = env.BOT_USERNAME?.trim().replace(/^@/, "");

  return {
    botToken: botToken!,
    botUsername: rawUsername ? rawUsername : null,
    subsourceApiKey: subsourceApiKey!,
    webhookSecret: webhookSecret!,
    adminIds: parseAdminIds(env.ADMIN_TELEGRAM_IDS),
    appEnv: env.APP_ENV?.trim() || "production",
    logLevel: parseLogLevel(env.LOG_LEVEL),
    rateLimitPerMinute: boundedInt(
      env.RATE_LIMIT_PER_MINUTE,
      20,
      1,
      10_000,
      "RATE_LIMIT_PER_MINUTE",
    ),
    downloadLimitPerHour: boundedInt(
      env.DOWNLOAD_LIMIT_PER_HOUR,
      30,
      1,
      100_000,
      "DOWNLOAD_LIMIT_PER_HOUR",
    ),
    subtitlesPerPage: boundedInt(
      env.SUBTITLES_PER_PAGE,
      6,
      1,
      25,
      "SUBTITLES_PER_PAGE",
    ),
    recentPerPage: boundedInt(env.RECENT_PER_PAGE, 8, 1, 20, "RECENT_PER_PAGE"),
    searchResults: boundedInt(env.SEARCH_RESULTS, 8, 1, 20, "SEARCH_RESULTS"),
    cacheChannelId: parseChannelId(env.CACHE_CHANNEL_ID),
  };
}
