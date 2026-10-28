#!/usr/bin/env node
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Upserts KEY=value pairs in a `.dev.vars` file without touching other keys or
 * comments. Usage:
 *   node scripts/env-file.mjs .dev.vars BOT_TOKEN=123:abc WORKER_URL=https://...
 */
const [rawFile, ...pairs] = process.argv.slice(2);

if (!rawFile || pairs.length === 0) {
  console.error("Usage: node scripts/env-file.mjs <file> KEY=value [KEY=value...]");
  process.exit(1);
}

const file = resolve(process.cwd(), rawFile);
const entries = pairs.map((pair) => {
  const index = pair.indexOf("=");
  if (index < 1) {
    console.error(`Invalid entry: ${pair}`);
    process.exit(1);
  }
  return [pair.slice(0, index), pair.slice(index + 1)];
});

function formatValue(value) {
  // Keep simple values readable; quote anything a shell or Wrangler could
  // misinterpret. Escapes cover the `.dev.vars` parser.
  if (/^[A-Za-z0-9_./:@+-]*$/.test(value)) return value;
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

const lines = existsSync(file) ? readFileSync(file, "utf8").split(/\r?\n/) : [];

for (const [key, value] of entries) {
  const formatted = `${key}=${formatValue(value)}`;
  const pattern = new RegExp(`^\\s*${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*=`);
  const index = lines.findIndex((line) => pattern.test(line));

  if (index >= 0) {
    lines[index] = formatted;
  } else {
    if (lines.length > 0 && lines[lines.length - 1] !== "") lines.push("");
    lines.push(formatted);
  }
}

const output = `${lines.join("\n").replace(/\n+$/, "")}\n`;
writeFileSync(file, output, { mode: 0o600 });
chmodSync(file, 0o600);
console.log(`✓ Wrote ${rawFile}`);
