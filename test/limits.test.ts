import { describe, expect, it } from "vitest";
import {
  LIMIT_CALLBACK_KEYS,
  LIMIT_DEFINITIONS,
  LIMIT_KEYS,
  limitFromCallbackKey,
  parseLimitValue,
  resolveLimits,
  type BotLimits,
} from "../src/lib/limits";

const defaults: BotLimits = {
  rateLimitPerMinute: 20,
  downloadLimitPerHour: 30,
  subtitlesPerPage: 6,
  recentPerPage: 8,
  searchResults: 8,
};

describe("runtime limits", () => {
  it("uses matching keys for every limit", () => {
    for (const name of Object.keys(LIMIT_DEFINITIONS) as (keyof BotLimits)[]) {
      expect(LIMIT_DEFINITIONS[name].key).toBe(LIMIT_KEYS[name]);
    }
  });

  it("parses numbers inside the allowed range", () => {
    const definition = LIMIT_DEFINITIONS.subtitlesPerPage;
    expect(parseLimitValue("1", definition)).toBe(1);
    expect(parseLimitValue(6, definition)).toBe(6);
    expect(parseLimitValue("25", definition)).toBe(25);
    expect(parseLimitValue("0", definition)).toBeNull();
    expect(parseLimitValue("26", definition)).toBeNull();
    expect(parseLimitValue("6.5", definition)).toBeNull();
    expect(parseLimitValue("abc", definition)).toBeNull();
    expect(parseLimitValue(null, definition)).toBeNull();
  });

  it("lets settings override deployment defaults", () => {
    const resolved = resolveLimits(
      {
        [LIMIT_KEYS.rateLimitPerMinute]: "50",
        [LIMIT_KEYS.subtitlesPerPage]: "10",
      },
      defaults,
    );

    expect(resolved.rateLimitPerMinute).toBe(50);
    expect(resolved.subtitlesPerPage).toBe(10);
    expect(resolved.recentPerPage).toBe(8);
  });

  it("ignores invalid or out-of-range settings", () => {
    const resolved = resolveLimits(
      {
        [LIMIT_KEYS.rateLimitPerMinute]: "0",
        [LIMIT_KEYS.downloadLimitPerHour]: "lots",
        [LIMIT_KEYS.searchResults]: "999",
      },
      defaults,
    );

    expect(resolved).toEqual(defaults);
  });

  it("maps callback keys back to limit names", () => {
    for (const name of Object.keys(LIMIT_CALLBACK_KEYS) as (keyof BotLimits)[]) {
      expect(limitFromCallbackKey(LIMIT_CALLBACK_KEYS[name])).toBe(name);
    }
    expect(limitFromCallbackKey("nope")).toBeNull();
    expect(limitFromCallbackKey(undefined)).toBeNull();
  });
});
