import { describe, expect, it } from "vitest";
import { languageLabel } from "../src/lib/languages";

describe("languageLabel", () => {
  it("uses readable names for known codes", () => {
    expect(languageLabel("english")).toBe("English");
    expect(languageLabel("spanish_spain")).toBe("Spanish (Spain)");
    expect(languageLabel("farsi_persian")).toBe("Persian");
  });

  it("falls back to title case for unknown codes", () => {
    expect(languageLabel("klingon")).toBe("Klingon");
    expect(languageLabel("some_new_language")).toBe("Some New Language");
  });

  it("handles missing values", () => {
    expect(languageLabel(null)).toBe("Unknown");
    expect(languageLabel(undefined)).toBe("Unknown");
  });
});
