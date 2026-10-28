export const LIMIT_KEYS = {
  rateLimitPerMinute: "rate_limit_per_minute",
  downloadLimitPerHour: "download_limit_per_hour",
  subtitlesPerPage: "subtitles_per_page",
  recentPerPage: "recent_per_page",
  searchResults: "search_results",
} as const;

export type LimitName = keyof typeof LIMIT_KEYS;

/** Short keys used in callback_data so Telegram's 64-byte limit is never hit. */
export type LimitCallbackKey = "rate" | "download" | "subtitles" | "recent" | "results";

export const LIMIT_CALLBACK_KEYS: Record<LimitName, LimitCallbackKey> = {
  rateLimitPerMinute: "rate",
  downloadLimitPerHour: "download",
  subtitlesPerPage: "subtitles",
  recentPerPage: "recent",
  searchResults: "results",
};

const CALLBACK_TO_LIMIT = new Map<LimitCallbackKey, LimitName>(
  Object.entries(LIMIT_CALLBACK_KEYS).map(([name, key]) => [
    key as LimitCallbackKey,
    name as LimitName,
  ]),
);

export interface LimitDefinition {
  key: string;
  label: string;
  shortLabel: string;
  min: number;
  max: number;
}

export const LIMIT_DEFINITIONS: Record<LimitName, LimitDefinition> = {
  rateLimitPerMinute: {
    key: LIMIT_KEYS.rateLimitPerMinute,
    label: "Searches and recent views per minute",
    shortLabel: "Searches/min",
    min: 1,
    max: 10_000,
  },
  downloadLimitPerHour: {
    key: LIMIT_KEYS.downloadLimitPerHour,
    label: "Subtitle downloads per hour",
    shortLabel: "Downloads/hour",
    min: 1,
    max: 100_000,
  },
  subtitlesPerPage: {
    key: LIMIT_KEYS.subtitlesPerPage,
    label: "Subtitles per title page",
    shortLabel: "Subtitles/page",
    min: 1,
    max: 25,
  },
  recentPerPage: {
    key: LIMIT_KEYS.recentPerPage,
    label: "Recent subtitles per page",
    shortLabel: "Recent/page",
    min: 1,
    max: 20,
  },
  searchResults: {
    key: LIMIT_KEYS.searchResults,
    label: "Search results per query",
    shortLabel: "Results",
    min: 1,
    max: 20,
  },
};

export interface BotLimits {
  rateLimitPerMinute: number;
  downloadLimitPerHour: number;
  subtitlesPerPage: number;
  recentPerPage: number;
  searchResults: number;
}

export function limitFromCallbackKey(key: string | undefined): LimitName | null {
  if (!key) return null;
  return CALLBACK_TO_LIMIT.get(key as LimitCallbackKey) ?? null;
}

export function parseLimitValue(
  raw: string | number | null | undefined,
  definition: LimitDefinition,
): number | null {
  if (raw === null || raw === undefined) return null;

  const text = String(raw).trim();
  if (!/^\d+$/.test(text)) return null;

  const value = Number(text);
  if (!Number.isSafeInteger(value)) return null;
  if (value < definition.min || value > definition.max) return null;

  return value;
}

/**
 * Settings rows override the deployment defaults. Invalid or out-of-range
 * values fall back instead of breaking the bot.
 */
export function resolveLimits(
  values: Readonly<Record<string, string | null | undefined>>,
  defaults: BotLimits,
): BotLimits {
  const resolved = { ...defaults };

  for (const name of Object.keys(LIMIT_DEFINITIONS) as LimitName[]) {
    const value = parseLimitValue(values[LIMIT_KEYS[name]], LIMIT_DEFINITIONS[name]);
    if (value !== null) resolved[name] = value;
  }

  return resolved;
}
