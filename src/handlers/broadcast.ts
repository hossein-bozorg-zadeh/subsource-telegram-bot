import type { BotServices } from "../bot/context";
import {
  advanceBroadcast,
  claimBroadcast,
  getBroadcast,
  listPendingBroadcasts,
  nextBroadcastRecipients,
  setBroadcastStatus,
  type BroadcastRecord,
} from "../db";
import { formatCount } from "../lib/format";
import { TelegramApiError } from "../telegram/api";

const BATCH_SIZE = 20;
const CONCURRENCY = 4;
const DEFAULT_BUDGET_MS = 18_000;

type BroadcastServices = Pick<BotServices, "db" | "api" | "logger">;

/**
 * HTML is convenient for admins, but a single bad entity would fail for every
 * user. Fall back to plain text on a 400 instead of dropping the message.
 */
async function sendToUser(
  services: BroadcastServices,
  chatId: number,
  message: string,
): Promise<boolean> {
  try {
    await services.api.sendMessage(chatId, message, {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
    });
    return true;
  } catch (error) {
    if (error instanceof TelegramApiError && error.status === 400) {
      try {
        await services.api.sendMessage(chatId, message);
        return true;
      } catch (retryError) {
        services.logger.debug("broadcast_send_failed", {
          chatId,
          error: retryError instanceof Error ? retryError.message : String(retryError),
        });
        return false;
      }
    }

    services.logger.debug("broadcast_send_failed", {
      chatId,
      status: error instanceof TelegramApiError ? error.status : undefined,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

async function notifyFinished(
  services: BroadcastServices,
  broadcast: BroadcastRecord,
): Promise<void> {
  const summary = [
    "📣 <b>Broadcast finished</b>",
    "",
    `✅ Sent: <b>${formatCount(broadcast.sent)}</b>`,
    `⚠️ Failed: <b>${formatCount(broadcast.failed)}</b>`,
    `Total: ${formatCount(broadcast.total)}`,
  ].join("\n");

  try {
    await services.api.sendMessage(broadcast.created_by, summary, {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
    });
  } catch (error) {
    services.logger.warn("broadcast_notify_failed", {
      broadcastId: broadcast.id,
      adminId: broadcast.created_by,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Delivers a broadcast in small batches until the time budget runs out. The
 * cursor is stored after every batch, so cron or the Resume button can safely
 * continue later.
 */
export async function deliverBroadcast(
  services: BroadcastServices,
  broadcastId: number,
  options: { budgetMs?: number; notify?: boolean } = {},
): Promise<BroadcastRecord | null> {
  const { db, logger } = services;

  const claimed = await claimBroadcast(db, broadcastId);
  if (!claimed) return getBroadcast(db, broadcastId);

  let current = await getBroadcast(db, broadcastId);
  if (!current) return null;

  let state: BroadcastRecord = current;
  const message = state.message;
  const deadline = Date.now() + (options.budgetMs ?? DEFAULT_BUDGET_MS);

  while (Date.now() < deadline) {
    const recipients = await nextBroadcastRecipients(db, state.cursor, BATCH_SIZE);
    if (recipients.results.length === 0) {
      await setBroadcastStatus(db, state.id, "done");
      state = { ...state, status: "done" };
      break;
    }

    let sent: number = state.sent;
    let failed: number = state.failed;

    for (let index = 0; index < recipients.results.length; index += CONCURRENCY) {
      const chunk = recipients.results.slice(index, index + CONCURRENCY);
      const outcomes = await Promise.all(
        chunk.map((recipient) => sendToUser(services, recipient.telegram_id, message)),
      );

      for (const delivered of outcomes) {
        if (delivered) sent += 1;
        else failed += 1;
      }
    }

    const last = recipients.results[recipients.results.length - 1]!;
    await advanceBroadcast(db, state.id, last.telegram_id, sent, failed);
    state = { ...state, cursor: last.telegram_id, sent, failed };
  }

  if (state.status !== "done" && Date.now() >= deadline) {
    await setBroadcastStatus(db, state.id, "pending");
    state = { ...state, status: "pending" };
  }

  logger.info("broadcast_batch_finished", {
    broadcastId: state.id,
    status: state.status,
    cursor: state.cursor,
    sent: state.sent,
    failed: state.failed,
  });

  if (state.status === "done" && options.notify !== false) {
    await notifyFinished(services, state);
  }

  return state;
}

/** Cron entry point: keep paused jobs moving without an admin present. */
export async function resumePendingBroadcasts(
  services: BroadcastServices,
  limit = 3,
  budgetMs = 15_000,
): Promise<void> {
  const pending = await listPendingBroadcasts(services.db, limit);

  for (const broadcast of pending.results) {
    await deliverBroadcast(services, broadcast.id, { budgetMs });
  }
}
