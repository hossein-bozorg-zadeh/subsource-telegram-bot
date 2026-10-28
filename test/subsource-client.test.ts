import { describe, expect, it } from "vitest";
import {
  buildQuery,
  parseContentDispositionFilename,
} from "../src/subsource/client";

describe("buildQuery", () => {
  it("skips empty params and encodes values", () => {
    const query = buildQuery({
      searchType: "text",
      q: "spider man & friends",
      year: 2024,
      page: undefined,
      limit: null,
      language: "",
    });

    expect(query).toBe("?searchType=text&q=spider+man+%26+friends&year=2024");
  });

  it("returns an empty string when there is nothing to encode", () => {
    expect(buildQuery({})).toBe("");
    expect(buildQuery({ page: undefined })).toBe("");
  });

  it("keeps boolean values readable", () => {
    expect(buildQuery({ hearingImpaired: true, foreignParts: false })).toBe(
      "?hearingImpaired=true&foreignParts=false",
    );
  });
});

describe("parseContentDispositionFilename", () => {
  it("parses RFC 5987 encoded filenames", () => {
    expect(
      parseContentDispositionFilename(
        "attachment; filename*=UTF-8''My%20Subtitle%20File.zip",
      ),
    ).toBe("My Subtitle File.zip");
  });

  it("handles the lowercase form", () => {
    expect(
      parseContentDispositionFilename("attachment; filename*=utf-8''caf%C3%A9.zip"),
    ).toBe("café.zip");
  });

  it("parses quoted and bare filenames", () => {
    expect(parseContentDispositionFilename('attachment; filename="movie.srt.zip"')).toBe(
      "movie.srt.zip",
    );
    expect(parseContentDispositionFilename("attachment; filename=movie.zip")).toBe(
      "movie.zip",
    );
  });

  it("returns null when no filename is present", () => {
    expect(parseContentDispositionFilename(null)).toBeNull();
    expect(parseContentDispositionFilename("attachment")).toBeNull();
  });
});
