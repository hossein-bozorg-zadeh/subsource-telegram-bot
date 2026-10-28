#!/usr/bin/env node
import { loadDevVars, requireEnv, telegramCall } from "./env.mjs";

loadDevVars();

const commands = [
  { command: "start", description: "Start the bot" },
  { command: "search", description: "Search movies and TV shows" },
  { command: "recent", description: "Latest subtitles" },
  { command: "preview", description: "Preview a subtitle (by ID)" },
  { command: "downloads", description: "Your download history" },
  { command: "filters", description: "Language, year and type filters" },
  { command: "me", description: "Your profile and usage" },
  { command: "id", description: "Show your Telegram ID" },
  { command: "help", description: "How to use the bot" },
  { command: "cancel", description: "Cancel the current prompt" },
  { command: "admin", description: "Open the admin panel (admins only)" },
];

async function main() {
  const token = requireEnv("BOT_TOKEN");
  await telegramCall(token, "setMyCommands", { commands });
  console.log(`✅ ${commands.length} bot commands registered.`);
}

main().catch((error) => {
  console.error(`❌ ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
