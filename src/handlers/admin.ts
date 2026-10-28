import type { BotContext } from "../bot/context";
import type { AdminView, BroadcastAction, ToggleSetting } from "../bot/callbacks";
import {
  adminAdminsKeyboard,
  adminBroadcastKeyboard,
  adminHomeKeyboard,
  adminSectionKeyboard,
  adminSettingsKeyboard,
  adminUsersKeyboard,
  broadcastPreviewKeyboard,
} from "../bot/keyboards";
import {
  adminAdminsText,
  adminBroadcastText,
  adminDownloadsText,
  adminHomeText,
  adminSettingsText,
  adminStatsText,
  adminUsersText,
  broadcastPreviewText,
} from "../bot/presenters";
import { text } from "../bot/text";
import {
  addAdmin,
  countBroadcastRecipients,
  countUsers,
  createBroadcast,
  getAdmin,
  getAdminStats,
  getBooleanSetting,
  getBroadcast,
  getLatestBroadcast,
  getLatestUnfinishedBroadcast,
  getLimits,
  getUser,
  isBotAdmin,
  listAdmins,
  listRecentDownloads,
  listUsers,
  logAdminAction,
  MAINTENANCE_KEY,
  removeAdmin,
  setSetting,
  setUserBlocked,
} from "../db";
import {
  LIMIT_DEFINITIONS,
  LIMIT_KEYS,
  parseLimitValue,
  type LimitName,
} from "../lib/limits";
import { deliverBroadcast } from "./broadcast";

const USERS_PER_PAGE = 6;
const MAX_BROADCAST_CHARS = 3500;
const BROADCAST_BUDGET_MS = 18_000;
const RESUME_BUDGET_MS = 15_000;

function chatType(ctx: BotContext): string | null {
  return ctx.message?.chat.type ?? ctx.callback?.message?.chat.type ?? null;
}

async function ensureAdmin(ctx: BotContext): Promise<boolean> {
  if (!ctx.isAdmin) {
    if (ctx.callback) {
      await ctx.answer(text.notAuthorized, true);
    } else {
      await ctx.reply(text.notAuthorized);
    }
    return false;
  }

  if (chatType(ctx) !== "private") {
    if (ctx.callback) {
      await ctx.answer(text.adminPrivateOnly, true);
    } else {
      await ctx.reply(text.adminPrivateOnly);
    }
    return false;
  }

  return true;
}

async function respond(ctx: BotContext, message: string): Promise<void> {
  if (ctx.callback) {
    await ctx.answer(message, true);
  } else {
    await ctx.reply(message);
  }
}

function audit(
  ctx: BotContext,
  action: string,
  target: string | number | null = null,
  details: string | null = null,
): Promise<void> {
  return logAdminAction(ctx.db, ctx.userId, action, target, details).catch((error) => {
    ctx.logger.warn("audit_log_failed", {
      action,
      error: error instanceof Error ? error.message : String(error),
    });
  });
}

/**
 * Renders one admin screen. Callbacks edit the existing message; plain
 * commands fall back to a new message through `ctx.edit`.
 */
export async function handleAdminPanel(
  ctx: BotContext,
  view: AdminView = "home",
  page = 1,
): Promise<void> {
  if (!(await ensureAdmin(ctx))) return;

  await ctx.answer();
  await ctx.clearSession();

  switch (view) {
    case "stats": {
      const stats = await getAdminStats(ctx.db);
      await ctx.edit(adminStatsText(stats, ctx.config.appEnv), {
        reply_markup: adminSectionKeyboard("stats"),
      });
      return;
    }

    case "users": {
      const [counts, users] = await Promise.all([
        countUsers(ctx.db),
        listUsers(ctx.db, page, USERS_PER_PAGE),
      ]);

      await ctx.edit(adminUsersText(counts, users.results), {
        reply_markup: adminUsersKeyboard(users.results, users.page, users.pages),
      });
      return;
    }

    case "downloads": {
      const downloads = await listRecentDownloads(ctx.db, 12);
      await ctx.edit(adminDownloadsText(downloads.results), {
        reply_markup: adminSectionKeyboard("downloads"),
      });
      return;
    }

    case "broadcast": {
      const latest = await getLatestBroadcast(ctx.db);
      const unfinished =
        latest !== null &&
        (latest.status === "pending" || latest.status === "running");

      await ctx.edit(adminBroadcastText(latest), {
        reply_markup: adminBroadcastKeyboard(unfinished),
      });
      return;
    }

    case "admins": {
      const admins = await listAdmins(ctx.db);
      await ctx.edit(adminAdminsText(ctx.config.adminIds, admins.results), {
        reply_markup: adminAdminsKeyboard(admins.results),
      });
      return;
    }

    case "settings": {
      const [maintenance, limits] = await Promise.all([
        getBooleanSetting(ctx.db, MAINTENANCE_KEY, false),
        getLimits(ctx.db, ctx.config),
      ]);

      await ctx.edit(adminSettingsText(ctx.config, maintenance, limits), {
        reply_markup: adminSettingsKeyboard(maintenance, limits),
      });
      return;
    }

    default: {
      const [stats, maintenance] = await Promise.all([
        getAdminStats(ctx.db),
        getBooleanSetting(ctx.db, MAINTENANCE_KEY, false),
      ]);

      await ctx.edit(adminHomeText(stats, maintenance, ctx.config.appEnv), {
        reply_markup: adminHomeKeyboard(),
      });
    }
  }
}

export async function toggleAdminSetting(
  ctx: BotContext,
  setting: ToggleSetting,
  enabled: boolean,
): Promise<void> {
  if (!(await ensureAdmin(ctx))) return;

  if (setting !== "maintenance") {
    await ctx.answer(text.notAuthorized, true);
    return;
  }

  await setSetting(ctx.db, MAINTENANCE_KEY, enabled ? "1" : "0");
  await audit(ctx, "maintenance", enabled ? "on" : "off");

  await ctx.answer(
    enabled ? "Maintenance mode enabled. Only admins can use the bot." : "Maintenance mode disabled.",
  );
  await handleAdminPanel(ctx, "settings");
}

/* ------------------------------- users ------------------------------- */

export async function toggleUserBlock(
  ctx: BotContext,
  telegramId: number,
  blocked: boolean,
  page = 1,
): Promise<void> {
  if (!(await ensureAdmin(ctx))) return;

  if (telegramId === ctx.userId) {
    await respond(ctx, text.cannotBlockSelf);
    return;
  }

  if (await isBotAdmin(ctx.db, telegramId, ctx.config.adminIds)) {
    await respond(ctx, text.cannotBlockAdmin);
    return;
  }

  const user = await getUser(ctx.db, telegramId);
  if (!user) {
    await respond(ctx, text.userNotFound);
    return;
  }

  if (Boolean(user.is_blocked) === blocked) {
    await respond(ctx, blocked ? text.userAlreadyBlocked : text.userAlreadyUnblocked);
    return;
  }

  await setUserBlocked(ctx.db, telegramId, blocked);
  await audit(ctx, blocked ? "block-user" : "unblock-user", telegramId);

  if (blocked) {
    await ctx.api.sendMessage(telegramId, text.blockedNotice).catch(() => undefined);
  }

  await respond(ctx, blocked ? text.userBlocked(telegramId) : text.userUnblocked(telegramId));
  await handleAdminPanel(ctx, "users", page);
}

export async function handleBlockCommand(
  ctx: BotContext,
  blocked: boolean,
): Promise<void> {
  if (!(await ensureAdmin(ctx))) return;

  const raw = ctx.args.trim();
  if (!/^\d+$/.test(raw) || Number(raw) <= 0) {
    await ctx.reply(text.blockUsage);
    return;
  }

  await toggleUserBlock(ctx, Number(raw), blocked, 1);
}

/* ------------------------------- admins ------------------------------ */

export async function startAddAdmin(ctx: BotContext): Promise<void> {
  if (!(await ensureAdmin(ctx))) return;

  await ctx.answer();
  await ctx.setSession("admin.add-admin", {}, 10 * 60);
  await ctx.edit(text.adminAddPrompt, {
    reply_markup: { inline_keyboard: [[{ text: "❌ Cancel", callback_data: "ad:admins" }]] },
  });
}

export async function handleAddAdminInput(ctx: BotContext, input: string): Promise<void> {
  if (!(await ensureAdmin(ctx))) return;

  const raw = input.trim();
  if (!/^\d+$/.test(raw)) {
    await ctx.reply(text.adminAddInvalid);
    return;
  }

  const telegramId = Number(raw);
  if (!Number.isSafeInteger(telegramId) || telegramId <= 0) {
    await ctx.reply(text.adminAddInvalid);
    return;
  }

  if (telegramId === ctx.userId || ctx.config.adminIds.has(telegramId)) {
    await ctx.reply(ctx.config.adminIds.has(telegramId) ? text.adminAddEnvOwner : text.adminAddSelf);
    return;
  }

  if (await getAdmin(ctx.db, telegramId)) {
    await ctx.reply(`<code>${telegramId}</code> is already a database admin.`);
    return;
  }

  await addAdmin(ctx.db, telegramId, "admin", ctx.userId);
  await audit(ctx, "add-admin", telegramId);
  await ctx.clearSession();
  await ctx.reply(text.adminAddDone(telegramId));
  await handleAdminPanel(ctx, "admins");
}

export async function removeAdminAction(
  ctx: BotContext,
  telegramId: number,
): Promise<void> {
  if (!(await ensureAdmin(ctx))) return;

  if (telegramId === ctx.userId) {
    await respond(ctx, text.adminRemoveSelf);
    return;
  }

  const record = await getAdmin(ctx.db, telegramId);
  if (!record) {
    await respond(ctx, text.adminRemoveMissing);
    return;
  }

  if (record.role === "owner") {
    await respond(ctx, text.adminRemoveOwner);
    return;
  }

  await removeAdmin(ctx.db, telegramId);
  await audit(ctx, "remove-admin", telegramId);
  await respond(ctx, text.adminRemoveDone(telegramId));
  await handleAdminPanel(ctx, "admins");
}

/* ------------------------------- limits ------------------------------ */

export async function startLimitEdit(
  ctx: BotContext,
  limit: LimitName,
): Promise<void> {
  if (!(await ensureAdmin(ctx))) return;

  const definition = LIMIT_DEFINITIONS[limit];
  const limits = await getLimits(ctx.db, ctx.config);

  await ctx.answer();
  await ctx.setSession("admin.limit", { limit }, 10 * 60);
  await ctx.edit(
    text.limitPrompt(
      definition.label,
      limits[limit],
      definition.min,
      definition.max,
    ),
    {
      reply_markup: {
        inline_keyboard: [[{ text: "❌ Cancel", callback_data: "ad:settings" }]],
      },
    },
  );
}

export async function handleLimitInput(ctx: BotContext, input: string): Promise<void> {
  if (!(await ensureAdmin(ctx))) return;

  const name = ctx.session?.data.limit;
  const limit =
    typeof name === "string" && name in LIMIT_DEFINITIONS
      ? (name as LimitName)
      : null;

  if (!limit) {
    await ctx.clearSession();
    await ctx.reply(text.notAuthorized);
    return;
  }

  const definition = LIMIT_DEFINITIONS[limit];
  const value = parseLimitValue(input, definition);

  if (value === null) {
    await ctx.reply(text.limitInvalid(definition.min, definition.max));
    return;
  }

  await setSetting(ctx.db, LIMIT_KEYS[limit], String(value));
  await audit(ctx, "set-limit", LIMIT_KEYS[limit], String(value));
  await ctx.clearSession();
  await ctx.reply(text.limitSaved(definition.shortLabel, value));
  await handleAdminPanel(ctx, "settings");
}

/* ----------------------------- broadcast ----------------------------- */

export async function startBroadcast(ctx: BotContext): Promise<void> {
  if (!(await ensureAdmin(ctx))) return;

  await ctx.answer();
  await ctx.setSession("admin.broadcast", {}, 10 * 60);
  await ctx.edit(text.broadcastPrompt, {
    reply_markup: { inline_keyboard: [[{ text: "❌ Cancel", callback_data: "bc:cancel" }]] },
  });
}

export async function prepareBroadcast(
  ctx: BotContext,
  rawMessage: string,
): Promise<void> {
  if (!(await ensureAdmin(ctx))) return;

  const message = rawMessage.trim();
  if (!message) {
    await ctx.reply(text.broadcastEmpty);
    return;
  }

  if (message.length > MAX_BROADCAST_CHARS) {
    await ctx.reply(text.broadcastTooLong);
    return;
  }

  const recipients = await countBroadcastRecipients(ctx.db);
  if (recipients === 0) {
    await ctx.reply(text.broadcastNoRecipients);
    return;
  }

  await ctx.setSession("admin.broadcast", { message }, 10 * 60);
  await ctx.edit(broadcastPreviewText(message, recipients), {
    reply_markup: broadcastPreviewKeyboard(recipients),
  });
}

export async function confirmBroadcast(ctx: BotContext): Promise<void> {
  if (!(await ensureAdmin(ctx))) return;

  const message = ctx.session?.data.message;
  if (ctx.session?.name !== "admin.broadcast" || typeof message !== "string") {
    await ctx.answer(text.broadcastExpired, true);
    return;
  }

  const total = await countBroadcastRecipients(ctx.db);
  if (total === 0) {
    await ctx.answer(text.broadcastNoRecipients, true);
    return;
  }

  const id = await createBroadcast(ctx.db, message, ctx.userId, total);
  await audit(ctx, "broadcast", id, `${total} recipients`);
  await ctx.clearSession();

  await ctx.answer(text.broadcastStarted);

  // Start delivery before touching the panel message: a failed edit (old
  // message, Telegram hiccup) must never leave the broadcast stuck pending.
  const run = deliverBroadcast(ctx.services, id, {
    budgetMs: BROADCAST_BUDGET_MS,
  }).catch((error) => {
    ctx.logger.error("broadcast_failed", {
      broadcastId: id,
      error: error instanceof Error ? error.message : String(error),
    });
  });

  if (ctx.services.waitUntil) {
    ctx.services.waitUntil(run);
  }

  await ctx.edit(adminBroadcastText(await getBroadcast(ctx.db, id)), {
    reply_markup: adminBroadcastKeyboard(true),
  });

  if (!ctx.services.waitUntil) {
    await run;
  }
}

export async function cancelBroadcast(ctx: BotContext): Promise<void> {
  if (!(await ensureAdmin(ctx))) return;

  await ctx.clearSession();
  await ctx.answer(text.broadcastCancelled);
  await handleAdminPanel(ctx, "broadcast");
}

export async function resumeBroadcast(ctx: BotContext): Promise<void> {
  if (!(await ensureAdmin(ctx))) return;

  const broadcast = await getLatestUnfinishedBroadcast(ctx.db);
  if (!broadcast) {
    await ctx.answer(text.broadcastAlreadyDone, true);
    return;
  }

  await ctx.answer(text.broadcastResumed);

  const run = deliverBroadcast(ctx.services, broadcast.id, {
    budgetMs: RESUME_BUDGET_MS,
  }).catch((error) => {
    ctx.logger.error("broadcast_resume_failed", {
      broadcastId: broadcast.id,
      error: error instanceof Error ? error.message : String(error),
    });
  });

  if (ctx.services.waitUntil) {
    ctx.services.waitUntil(run);
  }

  await handleAdminPanel(ctx, "broadcast");

  if (!ctx.services.waitUntil) {
    await run;
  }
}

export async function handleBroadcastAction(
  ctx: BotContext,
  action: BroadcastAction,
): Promise<void> {
  switch (action) {
    case "new":
      await startBroadcast(ctx);
      return;
    case "go":
      await confirmBroadcast(ctx);
      return;
    case "cancel":
      await cancelBroadcast(ctx);
      return;
    case "resume":
      await resumeBroadcast(ctx);
      return;
    case "refresh":
      await handleAdminPanel(ctx, "broadcast");
      return;
  }
}

export async function handleBroadcastCommand(ctx: BotContext): Promise<void> {
  if (!(await ensureAdmin(ctx))) return;

  const message = ctx.args.trim();
  if (message) {
    await prepareBroadcast(ctx, message);
    return;
  }

  await startBroadcast(ctx);
}
