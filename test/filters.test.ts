import { describe, expect, it } from "vitest";
import {
  DEFAULT_FILTERS,
  FILTER_LANGUAGES,
  filterSummary,
  filtersActive,
  isMediaTypeFilter,
  isSupportedLanguage,
  isValidYear,
  mergeFilters,
  parseFilters,
  parseYearInput,
  serializeFilters,
} from "../src/lib/filters";

describe("user filters", () => {
  it("falls back to defaults for missing or malformed JSON", () => {
    expect(parseFilters(null)).toEqual(DEFAULT_FILTERS);
    expect(parseFilters("not json")).toEqual(DEFAULT_FILTERS);
    expect(parseFilters("[]")).toEqual(DEFAULT_FILTERS);
  });

  it("drops unsupported languages and years", () => {
    expect(
      parseFilters('{"language":"klingon","year":1200,"mediaType":"tvseries"}'),
    ).toEqual(DEFAULT_FILTERS);

    const parsed = parseFilters(
      `{"language":"english","year":${new Date().getFullYear()},"mediaType":"movie"}`,
    );
    expect(parsed).toEqual({
      language: "english",
      year: new Date().getFullYear(),
      mediaType: "movie",
    });
  });

  it("round-trips serialized filters", () => {
    const filters = { language: "spanish", year: 2019, mediaType: "series" } as const;
    expect(parseFilters(serializeFilters(filters))).toEqual(filters);
  });

  it("merges partial updates without clearing other values", () => {
    const current = { language: "english", year: 2019, mediaType: "movie" } as const;
    expect(mergeFilters(current, { year: null })).toEqual({
      language: "english",
      year: null,
      mediaType: "movie",
    });
    expect(mergeFilters(current, { language: null })).toEqual({
      language: null,
      year: 2019,
      mediaType: "movie",
    });
  });

  it("describes active filters", () => {
    expect(filtersActive(DEFAULT_FILTERS)).toBe(false);
    expect(
      filtersActive({ language: "english", year: null, mediaType: "all" }),
    ).toBe(true);
    expect(filterSummary(DEFAULT_FILTERS)).toBe("Any language · Any year · Movies & TV");
    expect(
      filterSummary({ language: "spanish", year: 2019, mediaType: "movie" }),
    ).toBe("Spanish · 2019 · Movies");
  });

  it("validates languages and media types", () => {
    expect(FILTER_LANGUAGES).toContain("english");
    expect(isSupportedLanguage("english")).toBe(true);
    expect(isSupportedLanguage("klingon")).toBe(false);
    expect(isSupportedLanguage(null)).toBe(false);
    expect(isMediaTypeFilter("movie")).toBe(true);
    expect(isMediaTypeFilter("series")).toBe(true);
    expect(isMediaTypeFilter("all")).toBe(true);
    expect(isMediaTypeFilter("tvseries")).toBe(false);
  });

  it("parses year input including reset words", () => {
    const now = new Date("2026-06-01T00:00:00Z");

    expect(parseYearInput("2019", now)).toEqual({ ok: true, year: 2019 });
    expect(parseYearInput(" 1999 ", now)).toEqual({ ok: true, year: 1999 });
    expect(parseYearInput("any", now)).toEqual({ ok: true, year: null });
    expect(parseYearInput("CLEAR", now)).toEqual({ ok: true, year: null });
    expect(parseYearInput("0", now)).toEqual({ ok: true, year: null });
    expect(parseYearInput("1899", now)).toEqual({ ok: false });
    expect(parseYearInput("2031", now)).toEqual({ ok: false });
    expect(parseYearInput("19", now)).toEqual({ ok: false });
    expect(parseYearInput("abc", now)).toEqual({ ok: false });
    expect(parseYearInput("", now)).toEqual({ ok: false });
  });

  it("keeps year bounds stable for validation", () => {
    expect(isValidYear(2019)).toBe(true);
    expect(isValidYear(1899)).toBe(false);
    expect(isValidYear(2019.5)).toBe(false);
    expect(isValidYear("2019")).toBe(false);
  });
});
