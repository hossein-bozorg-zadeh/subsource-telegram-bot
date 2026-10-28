import { handleUpdate } from "./bot/dispatch";
import { loadConfig } from "./config";
import { releaseStaleBroadcasts } from "./db/broadcasts";
import { cleanupRateLimits } from "./db/rate-limits";
import { cleanupSessions } from "./db/sessions";
import { cleanupProcessedUpdates } from "./db/updates";
import type { Env } from "./env";
import { resumePendingBroadcasts } from "./handlers/broadcast";
import { createLogger, normalizeLogLevel } from "./lib/logger";
import { SubSourceClient } from "./subsource/client";
import { TelegramApi } from "./telegram/api";
import type { TelegramUpdate } from "./telegram/types";
import { APP_VERSION } from "./version";

const WEBHOOK_PATH = "/telegram/webhook";

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers,
    },
  });
}

/**
 * Compares the webhook secret without leaking its length through early exits.
 * This is not a cryptographic compare (the secret travels over TLS), but it is
 * good hygiene and avoids the obvious timing side channel.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;

  let diff = 0;
  for (let index = 0; index < a.length; index += 1) {
    diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }

  return diff === 0;
}

async function healthResponse(env: Env): Promise<Response> {
  let database: "ok" | "error" = "ok";

  try {
    await env.DB.prepare("SELECT 1 AS ok").first();
  } catch {
    database = "error";
  }

  const status = database === "ok" ? "ok" : "degraded";

  return json(
    {
      name: "subsource-bot",
      version: APP_VERSION,
      status,
      database,
      time: new Date().toISOString(),
    },
    database === "ok" ? 200 : 503,
  );
}

async function runMaintenance(env: Env): Promise<void> {
  const logger = createLogger(normalizeLogLevel(env.LOG_LEVEL));

  const results = await Promise.allSettled([
    cleanupSessions(env.DB),
    cleanupRateLimits(env.DB),
    cleanupProcessedUpdates(env.DB),
    releaseStaleBroadcasts(env.DB),
  ]);

  for (const result of results) {
    if (result.status === "rejected") {
      logger.warn("maintenance_cleanup_failed", {
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      });
    }
  }

  // Broadcasts pause when their time budget runs out; pick them back up here.
  try {
    const config = loadConfig(env);
    await resumePendingBroadcasts({
      db: env.DB,
      api: new TelegramApi(config.botToken, logger),
      logger,
    });
  } catch (error) {
    logger.warn("broadcast_resume_skipped", {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  logger.info("maintenance_cleanup_complete");
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const isRoot = url.pathname === "/";
    const isHealth = url.pathname === "/health";

    if (request.method === "GET" && (isRoot || isHealth)) {
      if (isRoot) {
        return json({
          name: "subsource-bot",
          version: APP_VERSION,
          webhook: WEBHOOK_PATH,
          health: "/health",
        });
      }
      return healthResponse(env);
    }

    if (url.pathname !== WEBHOOK_PATH) {
      return json({ error: "not_found" }, 404);
    }

    if (request.method !== "POST") {
      return json({ error: "method_not_allowed" }, 405, { allow: "POST" });
    }

    let config;
    try {
      config = loadConfig(env);
    } catch (error) {
      const logger = createLogger(normalizeLogLevel(env.LOG_LEVEL));
      logger.error("configuration_invalid", {
        error: error instanceof Error ? error.message : String(error),
      });

      return json({ error: "misconfigured" }, 500);
    }

    const providedSecret = request.headers.get("x-telegram-bot-api-secret-token");
    if (!providedSecret || !timingSafeEqual(providedSecret, config.webhookSecret)) {
      return json({ error: "unauthorized" }, 401);
    }

    let update: TelegramUpdate;
    try {
      update = (await request.json()) as TelegramUpdate;
    } catch {
      return json({ error: "invalid_json" }, 400);
    }

    if (!update || typeof update.update_id !== "number") {
      return json({ error: "invalid_update" }, 400);
    }

    const logger = createLogger(config.logLevel);

    try {
      await handleUpdate(update, {
        db: env.DB,
        config,
        api: new TelegramApi(config.botToken, logger),
        subsource: new SubSourceClient(config.subsourceApiKey, logger),
        logger,
        waitUntil: (promise) => ctx.waitUntil(promise),
      });
    } catch (error) {
      // Respond 200 after logging so Telegram does not hammer the webhook with
      // retries for an update that has already been de-duplicated.
      logger.error("update_failed_unhandled", {
        updateId: update.update_id,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    }

    return json({ ok: true });
  },

  async scheduled(_controller: ScheduledController, env: Env, _ctx: ExecutionContext): Promise<void> {
    await runMaintenance(env);
  },
} satisfies ExportedHandler<Env>;
