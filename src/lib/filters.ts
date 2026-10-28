import { languageLabel } from "./languages";

export type MediaTypeFilter = "all" | "movie" | "series";

export interface UserFilters {
  language: string | null;
  year: number | null;
  mediaType: MediaTypeFilter;
}

export const DEFAULT_FILTERS: UserFilters = {
  language: null,
  year: null,
  mediaType: "all",
};

/**
 * SubSource language codes shown in the filter picker. The API accepts more,
 * but a curated list keeps the inline keyboard usable on a phone.
 */
export const FILTER_LANGUAGES: readonly string[] = [
  "english",
  "spanish",
  "spanish_spain",
  "french",
  "german",
  "italian",
  "portuguese",
  "brazilian_portuguese",
  "russian",
  "turkish",
  "arabic",
  "dutch",
  "polish",
  "greek",
  "romanian",
  "hungarian",
  "czech",
  "swedish",
  "norwegian",
  "danish",
  "finnish",
  "ukrainian",
  "hebrew",
  "hindi",
  "indonesian",
  "vietnamese",
  "thai",
  "japanese",
  "korean",
  "chinese_simplified",
  "chinese_traditional",
  "farsi_persian",
  "serbian_latin",
  "serbian_cyrillic",
];

const LANGUAGE_SET = new Set(FILTER_LANGUAGES);
const MEDIA_TYPES: readonly MediaTypeFilter[] = ["all", "movie", "series"];

export function isSupportedLanguage(code: string | null | undefined): code is string {
  return typeof code === "string" && LANGUAGE_SET.has(code);
}

export function isMediaTypeFilter(value: string | null | undefined): value is MediaTypeFilter {
  return typeof value === "string" && MEDIA_TYPES.includes(value as MediaTypeFilter);
}

/** Parses the JSON stored in `users.settings` without trusting its contents. */
export function parseFilters(raw: string | null | undefined): UserFilters {
  if (!raw) return { ...DEFAULT_FILTERS };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ...DEFAULT_FILTERS };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ...DEFAULT_FILTERS };
  }

  const record = parsed as Record<string, unknown>;
  const language = isSupportedLanguage(record.language as string | undefined)
    ? (record.language as string)
    : null;
  const year = isValidYear(record.year) ? (record.year as number) : null;
  const mediaType = isMediaTypeFilter(record.mediaType as string | undefined)
    ? (record.mediaType as MediaTypeFilter)
    : "all";

  return { language, year, mediaType };
}

export function serializeFilters(filters: UserFilters): string {
  return JSON.stringify({
    language: filters.language,
    year: filters.year,
    mediaType: filters.mediaType,
  });
}

export function mergeFilters(current: UserFilters, patch: Partial<UserFilters>): UserFilters {
  return {
    language: patch.language === undefined ? current.language : patch.language,
    year: patch.year === undefined ? current.year : patch.year,
    mediaType: patch.mediaType === undefined ? current.mediaType : patch.mediaType,
  };
}

export function filtersActive(filters: UserFilters): boolean {
  return filters.language !== null || filters.year !== null || filters.mediaType !== "all";
}

export function mediaTypeLabel(mediaType: MediaTypeFilter): string {
  switch (mediaType) {
    case "movie":
      return "Movies";
    case "series":
      return "TV series";
    default:
      return "Movies & TV";
  }
}

export function filterSummary(filters: UserFilters): string {
  const parts = [
    filters.language ? languageLabel(filters.language) : "Any language",
    filters.year ? String(filters.year) : "Any year",
    mediaTypeLabel(filters.mediaType),
  ];
  return parts.join(" · ");
}

export function isValidYear(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1900 &&
    value <= new Date().getFullYear() + 3
  );
}

export type YearInputResult = { ok: true; year: number | null } | { ok: false };

/**
 * Accepts a bare year, or one of the reset words. `null` means "clear the
 * filter" and is different from an invalid value, which keeps the prompt open.
 */
export function parseYearInput(input: string, now: Date = new Date()): YearInputResult {
  const value = input.trim().toLowerCase();
  if (!value) return { ok: false };

  if (["any", "all", "clear", "off", "none", "-", "0"].includes(value)) {
    return { ok: true, year: null };
  }

  if (!/^\d{4}$/.test(value)) return { ok: false };

  const year = Number(value);
  if (!isValidYearWithNow(year, now)) return { ok: false };

  return { ok: true, year };
}

function isValidYearWithNow(year: number, now: Date): boolean {
  return Number.isInteger(year) && year >= 1900 && year <= now.getFullYear() + 3;
}
