import type { AdminRecord, BotUser, DownloadRecord } from "../db";
import type { UserFilters } from "../lib/filters";
import { languageLabel } from "../lib/languages";
import type { BotLimits, LimitName } from "../lib/limits";
import { formatCount } from "../lib/format";
import { keyboard } from "../telegram/api";
import type { InlineKeyboardMarkup } from "../telegram/types";
import { cb } from "./callbacks";

export function mainMenuKeyboard(isAdmin: boolean): InlineKeyboardMarkup {
  const rows = [
    [
      { text: "🔍 Search", callback_data: cb.menu("search") },
      { text: "🆕 Recent", callback_data: cb.menu("recent") },
    ],
    [
      { text: "⬇️ Downloads", callback_data: cb.menu("downloads") },
      { text: "⚙️ Filters", callback_data: cb.menu("filters") },
    ],
    [
      { text: "ℹ️ Help", callback_data: cb.menu("help") },
      { text: "👤 Profile", callback_data: cb.menu("me") },
    ],
  ];

  if (isAdmin) {
    rows.push([{ text: "🛠 Admin panel", callback_data: cb.menu("admin") }]);
  }

  return keyboard(rows);
}

export function profileKeyboard(isAdmin: boolean): InlineKeyboardMarkup {
  return keyboard([
    [
      { text: "⬇️ My downloads", callback_data: cb.menu("downloads") },
      { text: "⚙️ Filters", callback_data: cb.menu("filters") },
    ],
    [{ text: "🏠 Main menu", callback_data: cb.menu("home") }],
    ...(isAdmin
      ? [[{ text: "🛠 Admin panel", callback_data: cb.menu("admin") }]]
      : []),
  ]);
}

export function filtersKeyboard(filters: UserFilters): InlineKeyboardMarkup {
  const typeButton = (type: UserFilters["mediaType"], label: string) => ({
    text: filters.mediaType === type ? `✅ ${label}` : label,
    callback_data: cb.filterType(type),
  });

  return keyboard([
    [
      {
        text: `🌐 ${filters.language ? languageLabel(filters.language) : "Any language"}`,
        callback_data: cb.filterLanguages(),
      },
    ],
    [
      {
        text: `📅 Year: ${filters.year ?? "Any"}`,
        callback_data: cb.filterYear(),
      },
    ],
    [
      typeButton("all", "🎬 All"),
      typeButton("movie", "🎥 Movies"),
      typeButton("series", "📺 TV"),
    ],
    [{ text: "♻️ Reset filters", callback_data: cb.filterReset() }],
    [
      { text: "🏠 Main menu", callback_data: cb.menu("home") },
      { text: "👤 Profile", callback_data: cb.menu("me") },
    ],
  ]);
}

export function filterLanguageKeyboard(
  filters: UserFilters,
  languages: readonly string[],
): InlineKeyboardMarkup {
  const anyLabel =
    filters.language === null ? "✅ Any language" : "🌐 Any language";
  const rows: { text: string; callback_data: string }[][] = [
    [{ text: anyLabel, callback_data: cb.filterLanguage(null) }],
  ];

  for (let index = 0; index < languages.length; index += 2) {
    const pair = languages.slice(index, index + 2).map((code) => ({
      text:
        filters.language === code
          ? `✅ ${languageLabel(code)}`
          : languageLabel(code),
      callback_data: cb.filterLanguage(code),
    }));
    rows.push(pair);
  }

  rows.push([{ text: "← Back to filters", callback_data: cb.menu("filters") }]);
  return keyboard(rows);
}

export function downloadsKeyboard(
  records: DownloadRecord[],
  page: number,
  pages: number,
  isAdmin: boolean,
): InlineKeyboardMarkup {
  const rows: { text: string; callback_data: string }[][] = records.map(
    (record, index) => [
      {
        text: `⬇️ #${index + 1}`,
        callback_data: cb.download(record.subtitle_id),
      },
      {
        text: `👁 #${index + 1}`,
        callback_data: cb.preview(record.subtitle_id, record.movie_id ?? 0),
      },
    ],
  );

  if (pages > 1) {
    const navigation: { text: string; callback_data: string }[] = [];
    if (page > 1) {
      navigation.push({ text: "← Prev", callback_data: cb.downloads(page - 1) });
    }
    navigation.push({ text: `${page}/${pages}`, callback_data: cb.noop() });
    if (page < pages) {
      navigation.push({ text: "Next →", callback_data: cb.downloads(page + 1) });
    }
    rows.push(navigation);
  }

  rows.push([
    { text: "👤 Profile", callback_data: cb.menu("me") },
    { text: "🏠 Menu", callback_data: cb.menu("home") },
  ]);

  if (isAdmin) {
    rows.push([{ text: "🛠 Admin panel", callback_data: cb.menu("admin") }]);
  }

  return keyboard(rows);
}

export function previewKeyboard(
  subtitleId: number,
  movieId: number,
): InlineKeyboardMarkup {
  return keyboard([
    [
      { text: "⬇️ Download", callback_data: cb.download(subtitleId) },
      {
        text: "← Back",
        callback_data: movieId > 0 ? cb.movie(movieId) : cb.recent(1),
      },
    ],
  ]);
}

export function adminHomeKeyboard(): InlineKeyboardMarkup {
  return keyboard([
    [
      { text: "📊 Stats", callback_data: cb.admin("stats") },
      { text: "👥 Users", callback_data: cb.admin("users") },
    ],
    [
      { text: "⬇️ Downloads", callback_data: cb.admin("downloads") },
      { text: "📣 Broadcast", callback_data: cb.admin("broadcast") },
    ],
    [
      { text: "🔐 Admins", callback_data: cb.admin("admins") },
      { text: "⚙️ Settings", callback_data: cb.admin("settings") },
    ],
    [{ text: "🏠 Main menu", callback_data: cb.menu("home") }],
  ]);
}

export function adminSectionKeyboard(
  active: "stats" | "users" | "downloads",
): InlineKeyboardMarkup {
  return keyboard([
    [
      { text: "🔄 Refresh", callback_data: cb.admin(active) },
      { text: "← Admin panel", callback_data: cb.admin("home") },
    ],
    [{ text: "🏠 Main menu", callback_data: cb.menu("home") }],
  ]);
}

export function adminUsersKeyboard(
  users: BotUser[],
  page: number,
  pages: number,
): InlineKeyboardMarkup {
  const rows: { text: string; callback_data: string }[][] = users.map(
    (user, index) => [
      {
        text: user.is_blocked
          ? `✅ Unblock ${index + 1}`
          : `⛔ Block ${index + 1}`,
        callback_data: cb.adminUser(user.telegram_id, !user.is_blocked, page),
      },
    ],
  );

  if (pages > 1) {
    const navigation: { text: string; callback_data: string }[] = [];
    if (page > 1) {
      navigation.push({ text: "← Prev", callback_data: cb.admin("users", page - 1) });
    }
    navigation.push({ text: `${page}/${pages}`, callback_data: cb.noop() });
    if (page < pages) {
      navigation.push({ text: "Next →", callback_data: cb.admin("users", page + 1) });
    }
    rows.push(navigation);
  }

  rows.push([
    { text: "🔄 Refresh", callback_data: cb.admin("users", page) },
    { text: "← Admin panel", callback_data: cb.admin("home") },
  ]);
  rows.push([{ text: "🏠 Main menu", callback_data: cb.menu("home") }]);

  return keyboard(rows);
}

export function adminAdminsKeyboard(records: AdminRecord[]): InlineKeyboardMarkup {
  const rows: { text: string; callback_data: string }[][] = records.map(
    (record) => [
      {
        text: `❌ Remove ${record.telegram_id}${record.role === "owner" ? " (owner)" : ""}`,
        callback_data: cb.adminRemoveAdmin(record.telegram_id),
      },
    ],
  );

  rows.push([{ text: "➕ Add admin", callback_data: cb.adminAddAdmin() }]);
  rows.push([
    { text: "🔄 Refresh", callback_data: cb.admin("admins") },
    { text: "← Admin panel", callback_data: cb.admin("home") },
  ]);
  rows.push([{ text: "🏠 Main menu", callback_data: cb.menu("home") }]);

  return keyboard(rows);
}

const LIMIT_ORDER: readonly LimitName[] = [
  "rateLimitPerMinute",
  "downloadLimitPerHour",
  "subtitlesPerPage",
  "recentPerPage",
  "searchResults",
];

const LIMIT_TEXT: Record<LimitName, string> = {
  rateLimitPerMinute: "⏱ Searches/min",
  downloadLimitPerHour: "⬇️ Downloads/hour",
  subtitlesPerPage: "📄 Subtitles/page",
  recentPerPage: "🆕 Recent/page",
  searchResults: "🔎 Results",
};

export function adminSettingsKeyboard(
  maintenance: boolean,
  limits: BotLimits,
): InlineKeyboardMarkup {
  const limitRows = LIMIT_ORDER.map((name) => [
    {
      text: `${LIMIT_TEXT[name]}: ${formatCount(limits[name])}`,
      callback_data: cb.adminLimit(name),
    },
  ]);

  return keyboard([
    [
      {
        text: maintenance ? "✅ Disable maintenance mode" : "🛠 Enable maintenance mode",
        callback_data: cb.adminToggle("maintenance", !maintenance),
      },
    ],
    ...limitRows,
    [
      { text: "🔄 Refresh", callback_data: cb.admin("settings") },
      { text: "← Admin panel", callback_data: cb.admin("home") },
    ],
    [{ text: "🏠 Main menu", callback_data: cb.menu("home") }],
  ]);
}

export function adminBroadcastKeyboard(unfinished: boolean): InlineKeyboardMarkup {
  const rows: { text: string; callback_data: string }[][] = [
    [{ text: "📣 New broadcast", callback_data: cb.broadcast("new") }],
  ];

  if (unfinished) {
    rows.push([{ text: "▶️ Resume broadcast", callback_data: cb.broadcast("resume") }]);
  }

  rows.push([
    { text: "🔄 Refresh", callback_data: cb.broadcast("refresh") },
    { text: "← Admin panel", callback_data: cb.admin("home") },
  ]);
  rows.push([{ text: "🏠 Main menu", callback_data: cb.menu("home") }]);

  return keyboard(rows);
}

export function broadcastPreviewKeyboard(recipients: number): InlineKeyboardMarkup {
  return keyboard([
    [
      {
        text: `✅ Send to ${formatCount(recipients)} user${recipients === 1 ? "" : "s"}`,
        callback_data: cb.broadcast("go"),
      },
    ],
    [{ text: "❌ Cancel", callback_data: cb.broadcast("cancel") }],
  ]);
}
