import type { Logger } from "../lib/logger";
import type {
  BotCommand,
  ChatAction,
  InlineKeyboardMarkup,
  SentMessage,
  SendMessageOptions,
  TelegramApiResponse,
  TelegramMessage,
} from "./types";

const TELEGRAM_API_BASE = "https://api.telegram.org";
const JSON_TIMEOUT_MS = 15_000;
const DOCUMENT_TIMEOUT_MS = 60_000;

export class TelegramApiError extends Error {
  readonly method: string;
  readonly status: number;
  readonly description: string;
  readonly retryAfterSeconds: number | null;

  constructor(
    method: string,
    options: {
      status: number;
      description: string;
      retryAfterSeconds?: number | null;
      cause?: unknown;
    },
  ) {
    super(`Telegram ${method} failed: ${options.description}`, { cause: options.cause });
    this.name = "TelegramApiError";
    this.method = method;
    this.status = options.status;
    this.description = options.description;
    this.retryAfterSeconds = options.retryAfterSeconds ?? null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isNotModifiedError(error: unknown): boolean {
  return (
    error instanceof TelegramApiError &&
    error.status === 400 &&
    error.description.toLowerCase().includes("message is not modified")
  );
}

export class TelegramApi {
  private readonly baseUrl: string;

  constructor(
    botToken: string,
    private readonly logger?: Logger,
  ) {
    this.baseUrl = `${TELEGRAM_API_BASE}/bot${botToken}`;
  }

  private async call<T>(
    method: string,
    payload: unknown,
    timeoutMs: number = JSON_TIMEOUT_MS,
  ): Promise<T> {
    const url = `${this.baseUrl}/${method}`;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      let response: Response;
      try {
        response = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload ?? {}),
          signal: controller.signal,
        });
      } catch (error) {
        if (controller.signal.aborted) {
          throw new TelegramApiError(method, {
            status: 504,
            description: "Request timed out",
            cause: error,
          });
        }
        throw new TelegramApiError(method, {
          status: 0,
          description: error instanceof Error ? error.message : "Network error",
          cause: error,
        });
      } finally {
        clearTimeout(timer);
      }

      let body: TelegramApiResponse<T> | null = null;
      try {
        body = (await response.json()) as TelegramApiResponse<T>;
      } catch {
        body = null;
      }

      if (response.ok && body?.ok && body.result !== undefined) {
        return body.result;
      }

      const description = body?.description ?? `HTTP ${response.status}`;
      const retryAfter = body?.parameters?.retry_after ?? null;

      if (response.status === 429 && attempt === 0) {
        this.logger?.warn("telegram_rate_limited", {
          method,
          retryAfter,
        });
        await sleep(Math.min(retryAfter ?? 1, 5) * 1000);
        continue;
      }

      throw new TelegramApiError(method, {
        status: response.status,
        description,
        retryAfterSeconds: retryAfter,
      });
    }

    throw new TelegramApiError(method, {
      status: 429,
      description: "Rate limit retry exhausted",
    });
  }

  async sendMessage(
    chatId: number,
    text: string,
    options: SendMessageOptions = {},
  ): Promise<SentMessage> {
    return this.call<SentMessage>("sendMessage", {
      chat_id: chatId,
      text,
      ...options,
    });
  }

  async editMessageText(
    chatId: number,
    messageId: number,
    text: string,
    options: SendMessageOptions = {},
  ): Promise<TelegramMessage | null> {
    try {
      return await this.call<TelegramMessage>("editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text,
        ...options,
      });
    } catch (error) {
      // Re-rendering the same screen is a no-op, not a failure.
      if (isNotModifiedError(error)) return null;
      throw error;
    }
  }

  async answerCallbackQuery(
    callbackQueryId: string,
    text?: string,
    showAlert = false,
  ): Promise<boolean> {
    return this.call<boolean>("answerCallbackQuery", {
      callback_query_id: callbackQueryId,
      ...(text ? { text } : {}),
      show_alert: showAlert,
    });
  }

  async sendChatAction(chatId: number, action: ChatAction): Promise<boolean> {
    return this.call<boolean>("sendChatAction", {
      chat_id: chatId,
      action,
    });
  }

  async sendDocument(
    chatId: number,
    document: Blob,
    filename: string,
    caption?: string,
  ): Promise<SentMessage> {
    const form = new FormData();
    form.append("chat_id", String(chatId));
    form.append("document", document, filename);
    if (caption) {
      form.append("caption", caption);
      form.append("parse_mode", "HTML");
    }

    const url = `${this.baseUrl}/sendDocument`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DOCUMENT_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        body: form,
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted) {
        throw new TelegramApiError("sendDocument", {
          status: 504,
          description: "Upload timed out",
          cause: error,
        });
      }
      throw new TelegramApiError("sendDocument", {
        status: 0,
        description: error instanceof Error ? error.message : "Network error",
        cause: error,
      });
    } finally {
      clearTimeout(timer);
    }

    let body: TelegramApiResponse<SentMessage> | null = null;
    try {
      body = (await response.json()) as TelegramApiResponse<SentMessage>;
    } catch {
      body = null;
    }

    if (response.ok && body?.ok && body.result) return body.result;

    throw new TelegramApiError("sendDocument", {
      status: response.status,
      description: body?.description ?? `HTTP ${response.status}`,
      retryAfterSeconds: body?.parameters?.retry_after ?? null,
    });
  }

  async setMyCommands(commands: BotCommand[]): Promise<boolean> {
    return this.call<boolean>("setMyCommands", { commands });
  }

  /**
   * Copy an existing message (e.g. a cached subtitle document in the storage
   * channel) into a chat without re-uploading the file or showing a
   * "Forwarded from" header.
   */
  async copyMessage(
    chatId: number,
    fromChatId: number,
    messageId: number,
  ): Promise<{ message_id: number }> {
    return this.call<{ message_id: number }>("copyMessage", {
      chat_id: chatId,
      from_chat_id: fromChatId,
      message_id: messageId,
    });
  }

  async setWebhook(url: string, secretToken: string): Promise<boolean> {
    return this.call<boolean>("setWebhook", {
      url,
      secret_token: secretToken,
      allowed_updates: ["message", "edited_message", "callback_query"],
      drop_pending_updates: false,
    });
  }

  async deleteWebhook(): Promise<boolean> {
    return this.call<boolean>("deleteWebhook", { drop_pending_updates: false });
  }

  async getMe(): Promise<{ id: number; username: string; first_name: string }> {
    return this.call("getMe", {});
  }
}

export function keyboard(rows: InlineKeyboardMarkup["inline_keyboard"]): InlineKeyboardMarkup {
  return { inline_keyboard: rows };
}
