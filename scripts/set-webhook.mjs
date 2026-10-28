#!/usr/bin/env node
import { loadDevVars, requireEnv, telegramCall } from "./env.mjs";

loadDevVars();

const args = process.argv.slice(2);
const mode = args.includes("--delete")
  ? "delete"
  : args.includes("--info")
    ? "info"
    : "set";

async function main() {
  const token = requireEnv("BOT_TOKEN");

  if (mode === "info") {
    const info = await telegramCall(token, "getWebhookInfo");
    console.log(JSON.stringify(info, null, 2));
    return;
  }

  if (mode === "delete") {
    await telegramCall(token, "deleteWebhook", { drop_pending_updates: false });
    console.log("✅ Webhook deleted.");
    return;
  }

  const workerUrl = requireEnv("WORKER_URL").replace(/\/+$/, "");
  if (!/^https:\/\//i.test(workerUrl)) {
    throw new Error("WORKER_URL must start with https://");
  }

  const secret = requireEnv("TELEGRAM_WEBHOOK_SECRET");
  if (secret.length < 16) {
    throw new Error("TELEGRAM_WEBHOOK_SECRET must be at least 16 characters long.");
  }

  const url = workerUrl.endsWith("/telegram/webhook")
    ? workerUrl
    : `${workerUrl}/telegram/webhook`;
  await telegramCall(token, "setWebhook", {
    url,
    secret_token: secret,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: false,
  });

  console.log(`✅ Webhook set to ${url}`);
}

main().catch((error) => {
  console.error(`❌ ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
