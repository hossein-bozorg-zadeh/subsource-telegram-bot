import type { Config } from "../config";
import type {
  AdminStats,
  BotUser,
  BroadcastRecord,
  DownloadPage,
  DownloadRecord,
  DownloadWithUser,
  UserCounts,
} from "../db";
import {
  filterSummary,
  mediaTypeLabel,
  type UserFilters,
} from "../lib/filters";
import {
  escapeHtml,
  formatCount,
  formatRelease,
  truncate,
} from "../lib/format";
import { languageLabel } from "../lib/languages";
import {
  LIMIT_DEFINITIONS,
  type BotLimits,
  type LimitName,
} from "../lib/limits";
import type { Movie, Subtitle } from "../subsource/types";
import { APP_VERSION } from "../version";

export function movieTypeLabel(movie: Movie): string {
  if (movie.type === "tvseries") {
    return movie.season ? `TV · Season ${movie.season}` : "TV series";
  }
  return "Movie";
}

export function movieMeta(movie: Movie): string {
  const parts = [
    movie.releaseYear ? String(movie.releaseYear) : null,
    movieTypeLabel(movie),
  ].filter(Boolean);
  return parts.join(" · ");
}

export function subtitleReleaseLabel(subtitle: Subtitle): string {
  const release = formatRelease(subtitle.releaseInfo);
  if (release) return release;
  return subtitle.releaseType ?? subtitle.productionType ?? "";
}

export function subtitleButtonLabel(subtitle: Subtitle): string {
  const parts = [languageLabel(subtitle.language)];
  const release = subtitleReleaseLabel(subtitle);
  if (release) parts.push(release);
  if (subtitle.hearingImpaired) parts.push("HI");

  return truncate(`⬇️ ${parts.join(" · ")}`, 60);
}

/** Recent subtitles span many titles, so the title replaces release details. */
export function recentSubtitleButtonLabel(subtitle: Subtitle): string {
  const parts: string[] = [];
  const title = subtitle.title?.trim();
  if (title) parts.push(truncate(title, 32));

  parts.push(languageLabel(subtitle.language));
  if (subtitle.hearingImpaired) parts.push("HI");
  if (!title) {
    const release = subtitleReleaseLabel(subtitle);
    if (release) parts.push(release);
  }

  return truncate(`⬇️ ${parts.join(" · ")}`, 60);
}

export function subtitleCaption(subtitle: Subtitle): string {
  const lines = [
    `<b>${escapeHtml(truncate(languageLabel(subtitle.language), 40))}</b>`,
  ];

  const release = subtitleReleaseLabel(subtitle);
  if (release) lines.push(escapeHtml(truncate(release, 300)));

  const details: string[] = [];
  if (subtitle.framerate && subtitle.framerate !== "N/A") {
    details.push(`${escapeHtml(truncate(subtitle.framerate, 20))} fps`);
  }
  if (subtitle.hearingImpaired) details.push("Hearing impaired");
  if (subtitle.foreignParts) details.push("Foreign parts");
  if (subtitle.files && subtitle.files > 1) details.push(`${subtitle.files} files`);
  if (typeof subtitle.downloads === "number") {
    details.push(`${formatCount(subtitle.downloads)} downloads`);
  }

  if (details.length > 0) lines.push(details.join(" · "));
  lines.push(`SubSource ID: <code>${subtitle.subtitleId}</code>`);

  return lines.join("\n");
}

const MAX_PREVIEW_CHARS = 2800;

export function previewText(subtitle: Subtitle): string {
  const lines = ["👁 <b>Subtitle preview</b>", ""];

  const title = subtitle.title?.trim();
  if (title) lines.push(`<b>${escapeHtml(truncate(title, 200))}</b>`);

  const release = subtitleReleaseLabel(subtitle);
  const meta = [
    escapeHtml(languageLabel(subtitle.language)),
    release ? escapeHtml(truncate(release, 200)) : null,
  ].filter(Boolean);
  lines.push(meta.join(" · "));

  const preview = subtitle.preview?.trim();
  lines.push("");
  if (preview) {
    lines.push(`<pre>${escapeHtml(truncate(preview, MAX_PREVIEW_CHARS))}</pre>`);
  } else {
    lines.push("<i>No preview text is available for this subtitle.</i>");
  }

  lines.push("", `SubSource ID: <code>${subtitle.subtitleId}</code>`);
  return lines.join("\n");
}

export function filtersText(filters: UserFilters): string {
  const lines = [
    "⚙️ <b>Filters</b>",
    "",
    `🌐 Language: <b>${escapeHtml(filters.language ? languageLabel(filters.language) : "Any")}</b>`,
    `📅 Year: <b>${filters.year ?? "Any"}</b>`,
    `🎬 Type: <b>${escapeHtml(mediaTypeLabel(filters.mediaType))}</b>`,
    "",
    `<i>Active: ${escapeHtml(filterSummary(filters))}</i>`,
    "",
    "Filters apply to search, recent uploads and title pages.",
  ];

  return lines.join("\n");
}

function downloadTitle(record: DownloadRecord): string {
  return record.title?.trim() || `Subtitle ${record.subtitle_id}`;
}

export function downloadsText(page: DownloadPage): string {
  const lines = [
    "⬇️ <b>Your downloads</b>",
    `Total: <b>${formatCount(page.total)}</b> · Page ${page.page} of ${page.pages}`,
    "",
  ];

  if (page.results.length === 0) {
    lines.push("You have not downloaded any subtitles yet.", "", "Find something with /search.");
    return lines.join("\n");
  }

  page.results.forEach((record, index) => {
    const language = record.language ? languageLabel(record.language) : "Unknown";
    lines.push(
      `${index + 1}. <b>${escapeHtml(truncate(downloadTitle(record), 80))}</b> — ${escapeHtml(language)}`,
      `   ${escapeHtml(record.created_at.slice(0, 16))} UTC · <code>${record.subtitle_id}</code>`,
    );
  });

  return lines.join("\n");
}

function downloadUserName(record: DownloadWithUser): string {
  const name = [record.first_name, record.last_name].filter(Boolean).join(" ").trim();
  if (name) return name;
  if (record.username) return `@${record.username}`;
  return `User ${record.telegram_id}`;
}

export function adminDownloadsText(records: DownloadWithUser[]): string {
  const lines = ["⬇️ <b>Recent downloads</b>", ""];

  if (records.length === 0) {
    lines.push("No downloads yet.");
    return lines.join("\n");
  }

  records.forEach((record, index) => {
    const language = record.language ? languageLabel(record.language) : "Unknown";
    const username =
      record.username && !downloadUserName(record).startsWith("@")
        ? ` @${escapeHtml(record.username)}`
        : "";

    lines.push(
      `${index + 1}. <b>${escapeHtml(truncate(downloadTitle(record), 70))}</b> — ${escapeHtml(language)}`,
      `   ${escapeHtml(truncate(downloadUserName(record), 50))}${username} · <code>${record.telegram_id}</code>`,
      `   ${escapeHtml(record.created_at.slice(0, 16))} UTC`,
    );
  });

  return lines.join("\n");
}

export function adminHomeText(
  stats: AdminStats,
  maintenance: boolean,
  appEnv: string,
): string {
  return [
    "🛠 <b>Admin panel</b>",
    "",
    `👥 Users: <b>${formatCount(stats.totalUsers)}</b>`,
    `🟢 Active in last 24h: <b>${formatCount(stats.activeUsers24h)}</b>`,
    `⬇️ Downloads in last 24h: <b>${formatCount(stats.downloads24h)}</b>`,
    `🔧 Maintenance mode: <b>${maintenance ? "ON" : "OFF"}</b>`,
    "",
    `<i>Environment: ${escapeHtml(appEnv)}</i>`,
    "",
    "Choose a section below.",
  ].join("\n");
}

export function adminStatsText(stats: AdminStats, appEnv: string): string {
  return [
    "📊 <b>Bot statistics</b>",
    "",
    `👥 Users: <b>${formatCount(stats.totalUsers)}</b>`,
    `🟢 Active in last 24h: <b>${formatCount(stats.activeUsers24h)}</b>`,
    `🔎 Searches in last 24h: <b>${formatCount(stats.searches24h)}</b>`,
    `⬇️ Downloads in last 24h: <b>${formatCount(stats.downloads24h)}</b>`,
    `🔐 DB admins: <b>${formatCount(stats.admins)}</b>`,
    "",
    `<i>Environment: ${escapeHtml(appEnv)} · Version: ${escapeHtml(APP_VERSION)}</i>`,
  ].join("\n");
}

function displayName(user: BotUser): string {
  const name = [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
  if (name) return name;
  if (user.username) return `@${user.username}`;
  return `User ${user.telegram_id}`;
}

export function adminUsersText(counts: UserCounts, users: BotUser[]): string {
  const lines = [
    "👥 <b>Recent users</b>",
    `Total: <b>${formatCount(counts.total)}</b> · Blocked: <b>${formatCount(counts.blocked)}</b>`,
    "",
  ];

  if (users.length === 0) {
    lines.push("No users yet.");
    return lines.join("\n");
  }

  users.forEach((user, index) => {
    const name = escapeHtml(truncate(displayName(user), 60));
    const username =
      user.username && !displayName(user).startsWith("@")
        ? ` @${escapeHtml(user.username)}`
        : "";
    const blocked = user.is_blocked ? "⛔ " : "";
    const lastSeen = user.last_seen_at.slice(0, 16);

    lines.push(
      `${index + 1}. ${blocked}<b>${name}</b>${username}`,
      `   <code>${user.telegram_id}</code> · ${escapeHtml(lastSeen)} UTC`,
    );
  });

  lines.push("", "Use the buttons below to block or unblock a user.");
  return lines.join("\n");
}

export function adminAdminsText(
  envAdminIds: ReadonlySet<number>,
  records: { telegram_id: number; role: string; created_at: string }[],
): string {
  const envIds = [...envAdminIds].sort((a, b) => a - b);
  const lines = [
    "🔐 <b>Admins</b>",
    "",
    `<b>Owners from ADMIN_TELEGRAM_IDS</b> (${formatCount(envIds.length)})`,
    envIds.length > 0
      ? envIds.map((id) => `• <code>${id}</code>`).join("\n")
      : "<i>None configured.</i>",
    "",
    `<b>Database admins</b> (${formatCount(records.length)})`,
  ];

  if (records.length === 0) {
    lines.push("<i>No database admins yet.</i>");
  } else {
    records.forEach((record, index) => {
      lines.push(
        `${index + 1}. <code>${record.telegram_id}</code> · ${escapeHtml(record.role)} · ${escapeHtml(record.created_at.slice(0, 16))} UTC`,
      );
    });
  }

  lines.push(
    "",
    "Env owners cannot be removed here. Database admins can be added or removed.",
  );

  return lines.join("\n");
}

export function adminBroadcastText(broadcast: BroadcastRecord | null): string {
  if (!broadcast) {
    return [
      "📣 <b>Broadcast</b>",
      "",
      "No broadcasts yet.",
      "",
      "Send an announcement to every user who has not blocked the bot.",
    ].join("\n");
  }

  const processed = broadcast.sent + broadcast.failed;
  const remaining = Math.max(0, broadcast.total - processed);
  const status =
    broadcast.status === "done"
      ? "✅ Done"
      : broadcast.status === "cancelled"
        ? "🚫 Cancelled"
        : broadcast.status === "running"
          ? "📤 Sending"
          : "⏸ Paused";

  return [
    "📣 <b>Broadcast</b>",
    "",
    `Status: <b>${status}</b>`,
    `Sent: <b>${formatCount(broadcast.sent)}</b> · Failed: <b>${formatCount(broadcast.failed)}</b>`,
    `Remaining: <b>${formatCount(remaining)}</b> of ${formatCount(broadcast.total)}`,
    `Started: ${escapeHtml(broadcast.created_at.slice(0, 16))} UTC`,
    "",
    `<i>Paused broadcasts resume automatically within 10 minutes, or tap Resume.</i>`,
  ].join("\n");
}

export function broadcastPreviewText(message: string, recipients: number): string {
  return [
    "📣 <b>Broadcast preview</b>",
    "",
    `Recipients: <b>${formatCount(recipients)}</b>`,
    "Blocked users are skipped.",
    "",
    escapeHtml(truncate(message, 1500)),
    "",
    "<i>Send it now? This cannot be undone.</i>",
  ].join("\n");
}

export function adminSettingsText(
  config: Config,
  maintenance: boolean,
  limits: BotLimits,
): string {
  const limitLines = (Object.keys(LIMIT_DEFINITIONS) as LimitName[]).map((name) => {
    const definition = LIMIT_DEFINITIONS[name];
    return `• ${definition.shortLabel}: <b>${formatCount(limits[name])}</b>`;
  });

  return [
    "⚙️ <b>Settings</b>",
    "",
    `🔧 Maintenance mode: <b>${maintenance ? "ON" : "OFF"}</b>`,
    maintenance
      ? "Only admins can use the bot while this is on."
      : "Everyone can use the bot right now.",
    "",
    "<b>Per-user limits</b> (tap a button to change)",
    ...limitLines,
    "",
    "<b>Runtime</b>",
    `Environment: ${escapeHtml(config.appEnv)}`,
    `Version: ${escapeHtml(APP_VERSION)}`,
  ].join("\n");
}
