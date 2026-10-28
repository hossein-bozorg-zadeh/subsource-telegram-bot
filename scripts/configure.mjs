#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Patches the few values the deployment script knows at runtime:
 *   --database-id <uuid>     D1 id created by `wrangler d1 create`
 *   --database-name <name>   D1 database name
 *   --bot-username <name>    from getMe, so /command@Bot works
 *   --print-database-id      prints the current id (empty when missing)
 *
 * The file is JSONC, so it is edited as text instead of parsed.
 */
const args = process.argv.slice(2);

function flagValue(name) {
  const index = args.indexOf(name);
  if (index === -1) return undefined;

  const value = args[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${name} requires a value`);
  }
  return value;
}

const configPath = resolve(
  process.cwd(),
  flagValue("--config") ?? process.env.WRANGLER_CONFIG ?? "wrangler.jsonc",
);

let text;
try {
  text = readFileSync(configPath, "utf8");
} catch {
  console.error(`❌ Could not read ${configPath}`);
  process.exit(1);
}

const DATABASE_ID = /("database_id"\s*:\s*")([^"]*)(")/;
const DATABASE_NAME = /("database_name"\s*:\s*")([^"]*)(")/;
const BOT_USERNAME = /("BOT_USERNAME"\s*:\s*")([^"]*)(")/;

if (args.includes("--print-database-id")) {
  const match = text.match(DATABASE_ID);
  process.stdout.write(match?.[2] ?? "");
  process.exit(match ? 0 : 1);
}

const updates = [
  ["--database-id", DATABASE_ID, "database_id"],
  ["--database-name", DATABASE_NAME, "database_name"],
  ["--bot-username", BOT_USERNAME, "BOT_USERNAME"],
];

let changed = false;

for (const [flag, pattern, label] of updates) {
  const value = flagValue(flag);
  if (value === undefined) continue;

  if (!pattern.test(text)) {
    console.error(`❌ Could not find ${label} in ${configPath}`);
    process.exitCode = 1;
    continue;
  }

  text = text.replace(pattern, (_match, before, _current, after) => {
    return `${before}${value}${after}`;
  });
  changed = true;
  console.log(`✓ ${label} set to ${value}`);
}

if (changed) {
  writeFileSync(configPath, text);
  console.log(`✓ Updated ${configPath}`);
}
