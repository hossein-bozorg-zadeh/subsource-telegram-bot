import { escapeHtml, formatCount } from "../lib/format";

export const text = {
  welcome(firstName: string, isAdmin: boolean): string {
    const lines = [
      `👋 Hi, <b>${escapeHtml(firstName)}</b>!`,
      "",
      "I search and download subtitles from <b>SubSource</b>.",
      "",
      "🔍 <b>Search</b> — find a movie or TV show",
      "🆕 <b>Recent</b> — latest uploads",
      "⬇️ <b>Downloads</b> — your history",
      "⚙️ <b>Filters</b> — language, year and type",
      "👤 <b>Profile</b> — your usage",
      "",
      "Use the buttons below or /help for commands.",
    ];

    if (isAdmin) lines.push("", "🛠 You have admin access.");
    return lines.join("\n");
  },

  help(isAdmin: boolean): string {
    const lines = [
      "ℹ️ <b>Commands</b>",
      "",
      "/search &lt;title, IMDb ID or URL&gt; — search SubSource",
      "/recent — newest subtitles",
      "/preview &lt;subtitle id&gt; — preview subtitle text",
      "/downloads — your download history",
      "/filters — language, year and type filters",
      "/me — your profile and usage",
      "/id — show your Telegram ID",
      "/cancel — cancel the current prompt",
      "/help — this message",
      "",
      "You can also send a movie title directly after tapping <b>Search</b>.",
    ];

    if (isAdmin) {
      lines.push(
        "",
        "🛠 <b>Admin</b>",
        "/admin — open the admin panel",
        "/broadcast [message] — send an announcement",
        "/block &lt;id&gt; · /unblock &lt;id&gt; — manage access",
      );
    }

    return lines.join("\n");
  },

  searchPrompt: [
    "🔍 Send the movie or TV show title.",
    "",
    "You can also send an IMDb ID or IMDb URL.",
    "",
    "<i>Tap /cancel to stop.</i>",
  ].join("\n"),

  idleHint: "Tap 🔍 Search to look for subtitles, or use /help to see what I can do.",

  searchTooShort: "The search query must be at least 2 characters long.",

  searchNoResults: "No matches found on SubSource. Try a different title or an IMDb ID.",

  recentEmpty: "There are no recent subtitles to show right now.",

  noSubtitles: "SubSource has no subtitles for this title yet.",

  notAuthorized: "You do not have access to this section.",

  adminPrivateOnly: "🛠 The admin panel is only available in a private chat with me.",

  cancelled: "Cancelled. Use /help to see what I can do.",

  unknownCommand: "Unknown command. Use /help to see the available commands.",

  textOnly: "I can only work with text messages right now. Use /help for commands.",

  maintenance: "🛠 The bot is under maintenance. Please try again later.",

  downloadTooLarge:
    "That subtitle archive is too large for Telegram (over 49 MB). Try another release.",

  downloadSent: "Subtitle sent ✅",

  downloadSentCached: "Subtitle sent from cache ⚡",

  previewUsage: "Usage: /preview <subtitle id>. You can find IDs on any title page.",

  yearPrompt: [
    "📅 Send a release year (for example <code>2019</code>).",
    "",
    "Send <code>any</code> to clear the year filter.",
    "",
    "<i>Tap /cancel to stop.</i>",
  ].join("\n"),

  yearInvalid: "That is not a valid year. Send a four-digit year like 2019, or `any` to clear it.",

  filtersCleared: "♻️ Filters reset.",

  blockedNotice: "🚫 You have been blocked from using this bot. Contact the owner if this is a mistake.",

  broadcastPrompt: [
    "📣 <b>New broadcast</b>",
    "",
    "Send the message to announce. It will be shown to every user who has not blocked the bot.",
    "",
    "<i>Tap /cancel to stop.</i>",
  ].join("\n"),

  broadcastEmpty: "The broadcast message cannot be empty.",

  broadcastTooLong: "That message is too long. Keep it under 3,500 characters.",

  broadcastNoRecipients: "There are no users to broadcast to yet.",

  broadcastStarted: "📣 Broadcast started. I will report back when it finishes.",

  broadcastCancelled: "📣 Broadcast cancelled.",

  broadcastAlreadyDone: "There is no unfinished broadcast to resume.",

  broadcastExpired: "This broadcast draft expired. Start a new one from the admin panel.",

  broadcastResumed: "▶️ Broadcast resumed.",

  adminAddPrompt: [
    "➕ <b>Add admin</b>",
    "",
    "Send the numeric Telegram ID of the new admin.",
    "",
    "Ask them to send /id to this bot if they do not know it.",
    "",
    "<i>Tap /cancel to stop.</i>",
  ].join("\n"),

  adminAddInvalid: "Send a numeric Telegram ID, for example <code>123456789</code>.",

  adminAddSelf: "You are already an admin.",

  adminAddEnvOwner:
    "That user is already an owner through ADMIN_TELEGRAM_IDS.",

  adminAddDone(telegramId: number): string {
    return `✅ <code>${telegramId}</code> is now an admin. They may need to send /start before the panel appears.`;
  },

  adminRemoveSelf: "You cannot remove yourself. Ask another owner to do it.",

  adminRemoveMissing:
    "That user is not a database admin. Owners from ADMIN_TELEGRAM_IDS cannot be removed here.",

  adminRemoveOwner:
    "That admin has the owner role and cannot be removed from the panel.",

  adminRemoveDone(telegramId: number): string {
    return `✅ <code>${telegramId}</code> is no longer an admin.`;
  },

  userNotFound: "That user has never interacted with the bot.",

  userBlocked(telegramId: number): string {
    return `⛔ <code>${telegramId}</code> is blocked.`;
  },

  userUnblocked(telegramId: number): string {
    return `✅ <code>${telegramId}</code> can use the bot again.`;
  },

  userAlreadyBlocked: "That user is already blocked.",

  userAlreadyUnblocked: "That user is not blocked.",

  cannotBlockAdmin: "Administrators cannot be blocked. Remove their admin role first.",

  cannotBlockSelf: "You cannot block yourself.",

  blockUsage: "Usage: /block <telegram id> or /unblock <telegram id>",

  limitPrompt(label: string, current: number, min: number, max: number): string {
    return [
      `⚙️ <b>${escapeHtml(label)}</b>`,
      "",
      `Current value: <b>${formatCount(current)}</b>`,
      `Allowed range: ${formatCount(min)}–${formatCount(max)}`,
      "",
      "Send the new value.",
      "",
      "<i>Tap /cancel to stop.</i>",
    ].join("\n");
  },

  limitInvalid(min: number, max: number): string {
    return `Send a whole number between ${formatCount(min)} and ${formatCount(max)}.`;
  },

  limitSaved(label: string, value: number): string {
    return `✅ ${escapeHtml(label)} is now <b>${formatCount(value)}</b>.`;
  },
};
