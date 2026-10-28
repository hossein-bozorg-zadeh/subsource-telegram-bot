import {
  isMediaTypeFilter,
  isSupportedLanguage,
  type MediaTypeFilter,
} from "../lib/filters";
import { LIMIT_CALLBACK_KEYS, limitFromCallbackKey, type LimitName } from "../lib/limits";

export type MenuView =
  | "home"
  | "search"
  | "recent"
  | "help"
  | "me"
  | "downloads"
  | "filters"
  | "admin";

export type AdminView =
  | "home"
  | "stats"
  | "users"
  | "downloads"
  | "broadcast"
  | "admins"
  | "settings";

export type ToggleSetting = "maintenance";
export type BroadcastAction = "new" | "go" | "cancel" | "resume" | "refresh";

export type CallbackAction =
  | { type: "menu"; view: MenuView }
  | { type: "movie"; movieId: number; page: number }
  | { type: "recent"; page: number }
  | { type: "download"; subtitleId: number }
  | { type: "preview"; subtitleId: number; movieId: number }
  | { type: "downloads"; page: number }
  | { type: "filter-language-list" }
  | { type: "filter-language"; language: string | null }
  | { type: "filter-type"; mediaType: MediaTypeFilter }
  | { type: "filter-year" }
  | { type: "filter-reset" }
  | { type: "admin"; view: AdminView; page: number }
  | { type: "admin-toggle"; setting: ToggleSetting; enabled: boolean }
  | { type: "admin-user"; telegramId: number; blocked: boolean; page: number }
  | { type: "admin-add-admin" }
  | { type: "admin-remove-admin"; telegramId: number }
  | { type: "admin-limit"; limit: LimitName }
  | { type: "broadcast"; action: BroadcastAction }
  | { type: "noop" }
  | { type: "unknown" };

const MENU_VIEWS: readonly MenuView[] = [
  "home",
  "search",
  "recent",
  "help",
  "me",
  "downloads",
  "filters",
  "admin",
];
const ADMIN_VIEWS: readonly AdminView[] = [
  "home",
  "stats",
  "users",
  "downloads",
  "broadcast",
  "admins",
  "settings",
];
const TOGGLE_SETTINGS: readonly ToggleSetting[] = ["maintenance"];
const BROADCAST_ACTIONS: readonly BroadcastAction[] = [
  "new",
  "go",
  "cancel",
  "resume",
  "refresh",
];

function positiveInt(value: string | undefined): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function positivePage(value: string | undefined): number {
  return positiveInt(value) ?? 1;
}

/**
 * Telegram limits callback_data to 64 bytes. These compact builders keep every
 * action well under that limit.
 */
export const cb = {
  menu: (view: MenuView): string => `menu:${view}`,
  movie: (movieId: number, page = 1): string => `mv:${movieId}:${Math.max(1, page)}`,
  recent: (page = 1): string => `rc:${Math.max(1, page)}`,
  download: (subtitleId: number): string => `dl:${subtitleId}`,
  preview: (subtitleId: number, movieId = 0): string =>
    `pv:${subtitleId}:${movieId > 0 ? movieId : 0}`,
  downloads: (page = 1): string => `dh:${Math.max(1, page)}`,
  filterLanguages: (): string => "fl:list",
  filterLanguage: (language: string | null): string => `fl:${language ?? "any"}`,
  filterType: (mediaType: MediaTypeFilter): string => `ft:${mediaType}`,
  filterYear: (): string => "fy",
  filterReset: (): string => "fr",
  admin: (view: AdminView, page = 1): string =>
    page > 1 ? `ad:${view}:${Math.max(1, page)}` : `ad:${view}`,
  adminToggle: (setting: ToggleSetting, enabled: boolean): string =>
    `as:${setting}:${enabled ? "1" : "0"}`,
  adminUser: (telegramId: number, blocked: boolean, page = 1): string =>
    `au:${telegramId}:${blocked ? "1" : "0"}:${Math.max(1, page)}`,
  adminAddAdmin: (): string => "aa",
  adminRemoveAdmin: (telegramId: number): string => `ax:${telegramId}`,
  adminLimit: (limit: LimitName): string => `al:${LIMIT_CALLBACK_KEYS[limit]}`,
  broadcast: (action: BroadcastAction): string => `bc:${action}`,
  noop: (): string => "noop",
};

export function decodeCallback(data: string | undefined): CallbackAction {
  if (!data) return { type: "unknown" };

  const [prefix, first, second, third] = data.split(":");

  switch (prefix) {
    case "menu": {
      if (first && MENU_VIEWS.includes(first as MenuView)) {
        return { type: "menu", view: first as MenuView };
      }
      return { type: "unknown" };
    }
    case "mv": {
      const movieId = positiveInt(first);
      const page = second === undefined ? 1 : positiveInt(second);
      if (movieId && page) return { type: "movie", movieId, page };
      return { type: "unknown" };
    }
    case "rc": {
      const page = positiveInt(first);
      if (page) return { type: "recent", page };
      return { type: "unknown" };
    }
    case "dl": {
      const subtitleId = positiveInt(first);
      if (subtitleId) return { type: "download", subtitleId };
      return { type: "unknown" };
    }
    case "pv": {
      const subtitleId = positiveInt(first);
      const movieId = second === "0" ? 0 : positiveInt(second);
      if (subtitleId && movieId !== null) {
        return { type: "preview", subtitleId, movieId };
      }
      return { type: "unknown" };
    }
    case "dh": {
      const page = positiveInt(first);
      if (page) return { type: "downloads", page };
      return { type: "unknown" };
    }
    case "fl": {
      if (first === "list") return { type: "filter-language-list" };
      if (first === "any") return { type: "filter-language", language: null };
      if (isSupportedLanguage(first)) {
        return { type: "filter-language", language: first };
      }
      return { type: "unknown" };
    }
    case "ft": {
      if (isMediaTypeFilter(first)) return { type: "filter-type", mediaType: first };
      return { type: "unknown" };
    }
    case "fy":
      return { type: "filter-year" };
    case "fr":
      return { type: "filter-reset" };
    case "ad": {
      if (first && ADMIN_VIEWS.includes(first as AdminView)) {
        return {
          type: "admin",
          view: first as AdminView,
          page: second === undefined ? 1 : positivePage(second),
        };
      }
      return { type: "unknown" };
    }
    case "as": {
      if (first && TOGGLE_SETTINGS.includes(first as ToggleSetting)) {
        if (second === "1") {
          return { type: "admin-toggle", setting: first as ToggleSetting, enabled: true };
        }
        if (second === "0") {
          return { type: "admin-toggle", setting: first as ToggleSetting, enabled: false };
        }
      }
      return { type: "unknown" };
    }
    case "au": {
      const telegramId = positiveInt(first);
      const blocked = second === "1" ? true : second === "0" ? false : null;
      if (telegramId && blocked !== null) {
        return {
          type: "admin-user",
          telegramId,
          blocked,
          page: third === undefined ? 1 : positivePage(third),
        };
      }
      return { type: "unknown" };
    }
    case "aa":
      return { type: "admin-add-admin" };
    case "ax": {
      const telegramId = positiveInt(first);
      if (telegramId) return { type: "admin-remove-admin", telegramId };
      return { type: "unknown" };
    }
    case "al": {
      const limit = limitFromCallbackKey(first);
      if (limit) return { type: "admin-limit", limit };
      return { type: "unknown" };
    }
    case "bc": {
      if (first && BROADCAST_ACTIONS.includes(first as BroadcastAction)) {
        return { type: "broadcast", action: first as BroadcastAction };
      }
      return { type: "unknown" };
    }
    case "noop":
      return { type: "noop" };
    default:
      return { type: "unknown" };
  }
}
