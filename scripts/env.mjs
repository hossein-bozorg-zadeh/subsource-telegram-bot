import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Loads `.dev.vars` into process.env without overriding real environment
 * variables. Supports the simple `KEY=value` format used by Wrangler.
 */
export function loadDevVars(fileName = ".dev.vars") {
  const path = resolve(process.cwd(), fileName);
  if (!existsSync(path)) return;

  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;

    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;

    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;

    let value = rawValue.trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

export function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `${name} is not set. Add it to .dev.vars or export it in your shell.`,
    );
  }
  return value;
}

export function telegramCall(token, method, payload) {
  return fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload ?? {}),
  }).then(async (response) => {
    let body = {};
    try {
      body = await response.json();
    } catch {
      // Keep the HTTP status as the only useful error below.
    }

    if (!response.ok || !body.ok) {
      throw new Error(body.description ?? `${method} failed with HTTP ${response.status}`);
    }

    return body.result;
  });
}
