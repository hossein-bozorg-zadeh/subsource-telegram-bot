import { describe, expect, it } from "vitest";
import { extractImdbId, hasImdbId } from "../src/lib/imdb";

describe("IMDb helpers", () => {
  it("recognises bare IDs and URLs", () => {
    expect(hasImdbId("tt0133093")).toBe(true);
    expect(hasImdbId("https://www.imdb.com/title/tt0133093/")).toBe(true);
    expect(hasImdbId("www.imdb.com/title/tt0133093/")).toBe(true);
    expect(hasImdbId("https://imdb.com/title/tt0133093?ref_=x")).toBe(true);
    expect(hasImdbId("TT0133093")).toBe(true);
  });

  it("rejects titles and malformed IDs", () => {
    expect(hasImdbId("The Matrix")).toBe(false);
    expect(hasImdbId("tt12")).toBe(false);
    expect(hasImdbId("https://example.com/tt0133093")).toBe(false);
  });

  it("extracts the normalized ID", () => {
    expect(extractImdbId("https://www.imdb.com/title/TT0133093/")).toBe("tt0133093");
    expect(extractImdbId("The Matrix")).toBeNull();
  });
});
