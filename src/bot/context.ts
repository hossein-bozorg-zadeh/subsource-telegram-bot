import type { Config } from "../config";
import type { SessionState } from "../db";
import { clearSession, setSession } from "../db";
import type { Logger } from "../lib/logger";
import type { SubSourceClient } from "../subsource/client";
import type { TelegramApi } from "../telegram/api";
import { TelegramApiError } from "../telegram/api";
import type {
  SentMessage,
  SendMessageOptions,
  TelegramCallbackQuery,
  TelegramMessage,
  TelegramUpdate,
} from "../telegram/types";
import type { BotUser } from "../db";

export interface BotServices {
  db: D1Database;
  config: Config;
  api: TelegramApi;
  subsource: SubSourceClient;
  logger: Logger;
  /** Keeps work alive after the webhook response (broadcast batches). */
  waitUntil?: (promise: Promise<unknown>) => void;
}

export interface BotContext {
  update: TelegramUpdate;
  message: TelegramMessage | null;
  callback: TelegramCallbackQuery | null;
  user: BotUser;
  userId: number;
  chatId: number;
  isAdmin: boolean;
  session: SessionState | null;
  text: string;
  args: string;
  services: BotServices;
  db: D1Database;
  config: Config;
  api: TelegramApi;
  subsource: SubSourceClient;
  logger: Logger;
  /** Set after the first answerCallbackQuery so handlers cannot answer twice. */
  answered: boolean;

  reply(text: string, options?: SendMessageOptions): Promise<SentMessage>;
  edit(text: string, options?: SendMessageOptions): Promise<void>;
  answer(text?: string, showAlert?: boolean): Promise<void>;
  setSession(name: string, data?: Record<string, unknown>, ttlSeconds?: number): Promise<void>;
  clearSession(): Promise<void>;
}

const MESSAGE_DEFAULTS: SendMessageOptions = {
  parse_mode: "HTML",
  link_preview_options: { is_disabled: true },
};

export interface CreateContextParams {
  update: TelegramUpdate;
  message: TelegramMessage | null;
  callback: TelegramCallbackQuery | null;
  user: BotUser;
  isAdmin: boolean;
  session: SessionState | null;
  services: BotServices;
  args?: string;
}

export function createBotContext(params: CreateContextParams): BotContext {
  const { update, message, callback, user, isAdmin, session, services, args = "" } = params;

  const chatId = message?.chat.id ?? callback?.message?.chat.id;
  if (chatId === undefined) {
    throw new Error("Update has no usable chat");
  }

  const ctx: BotContext = {
    update,
    message,
    callback,
    user,
    userId: user.telegram_id,
    chatId,
    isAdmin,
    session,
    text: message?.text?.trim() ?? "",
    args,
    services,
    db: services.db,
    config: services.config,
    api: services.api,
    subsource: services.subsource,
    logger: services.logger,
    answered: false,

    async reply(text, options) {
      return services.api.sendMessage(chatId, text, { ...MESSAGE_DEFAULTS, ...options });
    },

    async edit(text, options) {
      if (!callback?.message) {
        await services.api.sendMessage(chatId, text, { ...MESSAGE_DEFAULTS, ...options });
        return;
      }

      try {
        await services.api.editMessageText(
          chatId,
          callback.message.message_id,
          text,
          { ...MESSAGE_DEFAULTS, ...options },
        );
      } catch (error) {
        // Old or non-editable messages are common; fall back to a fresh message.
        if (error instanceof TelegramApiError && error.status === 400) {
          await services.api.sendMessage(chatId, text, { ...MESSAGE_DEFAULTS, ...options });
          return;
        }
        throw error;
      }
    },

    async answer(text, showAlert = false) {
      if (!callback || ctx.answered) return;
      ctx.answered = true;
      try {
        await services.api.answerCallbackQuery(callback.id, text, showAlert);
      } catch (error) {
        // Answering is cosmetic; an expired callback query must not abort the
        // action the button represents.
        services.logger.warn("answer_callback_failed", {
          userId: user.telegram_id,
          data: callback.data,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },

    async setSession(name, data = {}, ttlSeconds = 15 * 60) {
      await setSession(services.db, user.telegram_id, name, data, ttlSeconds);
    },

    async clearSession() {
      await clearSession(services.db, user.telegram_id);
    },
  };

  return ctx;
}
