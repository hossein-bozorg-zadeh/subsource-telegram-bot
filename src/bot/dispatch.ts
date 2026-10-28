import {
  claimUpdate,
  getBooleanSetting,
  getSession,
  isBotAdmin,
  MAINTENANCE_KEY,
  upsertUser,
} from "../db";
import { errorMessage, errorStack, UserFacingError } from "../lib/errors";
import { SubSourceError } from "../subsource/client";
import type { TelegramMessage, TelegramUpdate } from "../telegram/types";
import { decodeCallback } from "./callbacks";
import type { BotContext, BotServices } from "./context";
import { createBotContext } from "./context";
import { mainMenuKeyboard } from "./keyboards";
import { parseCommand } from "./parse-command";
import { text } from "./text";
import {
  handleAdminPanel,
  handleAddAdminInput,
  handleBlockCommand,
  handleBroadcastAction,
  handleBroadcastCommand,
  handleLimitInput,
  removeAdminAction,
  startAddAdmin,
  startLimitEdit,
  toggleAdminSetting,
  toggleUserBlock,
} from "../handlers/admin";
import { prepareBroadcast } from "../handlers/admin";
import {
  downloadSubtitle,
  handleCancel,
  handleDownloadsCommand,
  handleFiltersCommand,
  handleHelp,
  handleHome,
  handleId,
  handleMe,
  handlePreviewCommand,
  handleRecent,
  handleSearchCommand,
  handleStart,
  handleYearInput,
  promptSearch,
  promptYearFilter,
  resetFilters,
  runSearch,
  setLanguageFilter,
  setTypeFilter,
  showDownloads,
  showFilterLanguages,
  showFilters,
  showMovie,
  showPreview,
} from "../handlers/user";

function friendlyError(error: unknown): string {
  if (error instanceof SubSourceError) return error.friendlyMessage;
  if (error instanceof UserFacingError) return error.userMessage;
  return "⚠️ Something went wrong. Please try again in a moment.";
}

async function reportError(
  ctx: BotContext,
  error: unknown,
  services: BotServices,
): Promise<void> {
  services.logger.error("update_failed", {
    updateId: ctx.update.update_id,
    userId: ctx.userId,
    callbackData: ctx.callback?.data,
    status: error instanceof SubSourceError ? error.status : undefined,
    error: errorMessage(error),
    stack: errorStack(error),
  });

  const message = friendlyError(error);

  try {
    if (ctx.callback) {
      if (!ctx.answered) {
        await ctx.answer(message, true);
      } else {
        await ctx.reply(message);
      }
    } else {
      await ctx.reply(message, { reply_markup: mainMenuKeyboard(ctx.isAdmin) });
    }
  } catch (notifyError) {
    services.logger.warn("error_notification_failed", {
      userId: ctx.userId,
      error: errorMessage(notifyError),
    });
  }
}

async function routeCallback(ctx: BotContext): Promise<void> {
  const action = decodeCallback(ctx.callback?.data);

  switch (action.type) {
    case "menu": {
      switch (action.view) {
        case "home":
          await handleHome(ctx);
          return;
        case "search":
          await promptSearch(ctx);
          return;
        case "recent":
          await handleRecent(ctx, 1);
          return;
        case "help":
          await handleHelp(ctx);
          return;
        case "me":
          await handleMe(ctx);
          return;
        case "downloads":
          await showDownloads(ctx, 1);
          return;
        case "filters":
          await showFilters(ctx);
          return;
        case "admin":
          await handleAdminPanel(ctx, "home");
          return;
      }
    }

    case "movie":
      await showMovie(ctx, action.movieId, action.page);
      return;

    case "recent":
      await handleRecent(ctx, action.page);
      return;

    case "download":
      await downloadSubtitle(ctx, action.subtitleId);
      return;

    case "preview":
      await showPreview(ctx, action.subtitleId, action.movieId);
      return;

    case "downloads":
      await showDownloads(ctx, action.page);
      return;

    case "filter-language-list":
      await showFilterLanguages(ctx);
      return;

    case "filter-language":
      await setLanguageFilter(ctx, action.language);
      return;

    case "filter-type":
      await setTypeFilter(ctx, action.mediaType);
      return;

    case "filter-year":
      await promptYearFilter(ctx);
      return;

    case "filter-reset":
      await resetFilters(ctx);
      return;

    case "admin":
      await handleAdminPanel(ctx, action.view, action.page);
      return;

    case "admin-toggle":
      await toggleAdminSetting(ctx, action.setting, action.enabled);
      return;

    case "admin-user":
      await toggleUserBlock(ctx, action.telegramId, action.blocked, action.page);
      return;

    case "admin-add-admin":
      await startAddAdmin(ctx);
      return;

    case "admin-remove-admin":
      await removeAdminAction(ctx, action.telegramId);
      return;

    case "admin-limit":
      await startLimitEdit(ctx, action.limit);
      return;

    case "broadcast":
      await handleBroadcastAction(ctx, action.action);
      return;

    case "noop":
      await ctx.answer();
      return;

    default:
      await ctx.answer("This button is no longer available.", true);
  }
}

async function routeSession(ctx: BotContext, input: string): Promise<boolean> {
  switch (ctx.session?.name) {
    case "user.search":
      await runSearch(ctx, input);
      return true;
    case "user.year":
      await handleYearInput(ctx, input);
      return true;
    case "admin.broadcast":
      await prepareBroadcast(ctx, input);
      return true;
    case "admin.add-admin":
      await handleAddAdminInput(ctx, input);
      return true;
    case "admin.limit":
      await handleLimitInput(ctx, input);
      return true;
    default:
      return false;
  }
}

async function routeMessage(ctx: BotContext, message: TelegramMessage): Promise<void> {
  if (!message.text) {
    await ctx.reply(text.textOnly, { reply_markup: mainMenuKeyboard(ctx.isAdmin) });
    return;
  }

  const command = parseCommand(message.text, ctx.config.botUsername);

  if (!command) {
    if (await routeSession(ctx, message.text)) return;

    await ctx.reply(text.idleHint, { reply_markup: mainMenuKeyboard(ctx.isAdmin) });
    return;
  }

  switch (command.command) {
    case "start":
      await handleStart(ctx);
      return;
    case "help":
      await handleHelp(ctx);
      return;
    case "search":
      await handleSearchCommand(ctx);
      return;
    case "recent":
      await handleRecent(ctx, 1);
      return;
    case "preview":
      await handlePreviewCommand(ctx);
      return;
    case "downloads":
      await handleDownloadsCommand(ctx);
      return;
    case "filters":
      await handleFiltersCommand(ctx);
      return;
    case "me":
      await handleMe(ctx);
      return;
    case "id":
      await handleId(ctx);
      return;
    case "cancel":
      await handleCancel(ctx);
      return;
    case "admin":
      await handleAdminPanel(ctx, "home");
      return;
    case "broadcast":
      await handleBroadcastCommand(ctx);
      return;
    case "block":
      await handleBlockCommand(ctx, true);
      return;
    case "unblock":
      await handleBlockCommand(ctx, false);
      return;
    default:
      await ctx.reply(text.unknownCommand, {
        reply_markup: mainMenuKeyboard(ctx.isAdmin),
      });
  }
}

/**
 * Single entry point for a Telegram update. Returns normally for duplicate,
 * unsupported, or blocked updates so the webhook can always answer 200.
 */
export async function handleUpdate(
  update: TelegramUpdate,
  services: BotServices,
): Promise<void> {
  const claimed = await claimUpdate(services.db, update.update_id);
  if (!claimed) {
    services.logger.debug("update_duplicate", { updateId: update.update_id });
    return;
  }

  const message = update.message ?? null;
  const callback = update.callback_query ?? null;
  const from = message?.from ?? callback?.from;

  if (!from || from.is_bot) return;

  const chatId = message?.chat.id ?? callback?.message?.chat.id;
  if (chatId === undefined) return;

  const user = await upsertUser(services.db, from);
  const isAdmin = await isBotAdmin(services.db, from.id, services.config.adminIds);

  if (user.is_blocked && !isAdmin) {
    services.logger.debug("update_blocked_user", { userId: from.id });
    return;
  }

  const session = await getSession(services.db, from.id);
  const command = message?.text
    ? parseCommand(message.text, services.config.botUsername)
    : null;
  const ctx = createBotContext({
    update,
    message,
    callback,
    user,
    isAdmin,
    session,
    services,
    args: command?.args ?? "",
  });

  const maintenance = await getBooleanSetting(services.db, MAINTENANCE_KEY, false);
  if (maintenance && !isAdmin) {
    if (callback) {
      await ctx.answer(text.maintenance, true);
    } else {
      await ctx.reply(text.maintenance, { reply_markup: mainMenuKeyboard(false) });
    }
    return;
  }

  try {
    if (callback) {
      await routeCallback(ctx);
    } else if (message) {
      await routeMessage(ctx, message);
    }
  } catch (error) {
    await reportError(ctx, error, services);
  }
}
