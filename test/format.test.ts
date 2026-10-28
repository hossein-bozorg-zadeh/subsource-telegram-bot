import { describe, expect, it } from "vitest";
import {
  escapeHtml,
  formatBytes,
  formatCount,
  formatRelease,
  sanitizeFilename,
  titleCase,
  truncate,
} from "../src/lib/format";

describe("escapeHtml", () => {
  it("escapes Telegram HTML special characters", () => {
    expect(escapeHtml('5 < 10 & "quoted" > 3')).toBe(
      "5 &lt; 10 &amp; &quot;quoted&quot; &gt; 3",
    );
  });
});

describe("truncate", () => {
  it("leaves short strings alone", () => {
    expect(truncate("short", 10)).toBe("short");
  });

  it("adds the suffix when cutting", () => {
    expect(truncate("abcdefghij", 5)).toBe("abcd…");
  });

  it("handles tiny and invalid limits", () => {
    expect(truncate("abcdef", 0)).toBe("");
    expect(truncate("abcdef", -1)).toBe("");
    expect(truncate("abcdef", 1)).toBe("a");
  });
});

describe("formatting helpers", () => {
  it("formats byte sizes", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1023)).toBe("1023 B");
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(1.5 * 1024 * 1024)).toBe("1.5 MB");
  });

  it("formats counts with separators", () => {
    expect(formatCount(1234567)).toBe("1,234,567");
  });

  it("joins release info and title-cases words", () => {
    expect(formatRelease(["BluRay", "", "1080p"])).toBe("BluRay · 1080p");
    expect(formatRelease(null)).toBe("");
    expect(titleCase("the  matrix")).toBe("The Matrix");
  });
});

describe("sanitizeFilename", () => {
  it("removes path separators and control characters", () => {
    expect(sanitizeFilename('bad/name:with*chars?"<>|\u0000.zip')).toBe(
      "bad_name_with_chars_____.zip",
    );
  });

  it("falls back for empty names and strips leading dots", () => {
    expect(sanitizeFilename("   ")).toBe("subtitle.zip");
    expect(sanitizeFilename("...hidden.zip")).toBe("hidden.zip");
  });

  it("caps very long filenames", () => {
    const result = sanitizeFilename("a".repeat(500));
    expect(result.length).toBe(120);
  });
});
