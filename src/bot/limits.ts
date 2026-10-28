import { consumeRateLimit } from "../db";
import type { BotContext } from "./context";

function waitLabel(seconds: number): string {
  if (seconds <= 60) return `${seconds} seconds`;
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

/**
 * Per-user limit check. Admins are exempt so they can test without hitting the
 * same limits as regular users.
 */
export async function enforceRateLimit(
  ctx: BotContext,
  key: string,
  windowSeconds: number,
  limit: number,
): Promise<boolean> {
  if (ctx.isAdmin) return true;

  const result = await consumeRateLimit(
    ctx.db,
    `${key}:${ctx.userId}`,
    windowSeconds,
    limit,
  );

  if (result.allowed) return true;

  const seconds = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000));
  const message = `⏳ Slow down a little. Try again in ${waitLabel(seconds)}.`;

  if (ctx.callback) {
    await ctx.answer(message, true);
  } else {
    await ctx.reply(message);
  }

  return false;
}
