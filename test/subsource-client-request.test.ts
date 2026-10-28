import { afterEach, describe, expect, it, vi } from "vitest";
import { SubSourceClient, SubSourceError } from "../src/subsource/client";

const API_KEY = "test-api-key";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SubSourceClient", () => {
  it("sends the API key and parses the success envelope", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        success: true,
        data: [{ movieId: 550, title: "Fight Club", type: "movie" }],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = new SubSourceClient(API_KEY);
    const response = await client.searchMovies({ searchType: "text", q: "fight club" });

    expect(response.data[0]?.title).toBe("Fight Club");

    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    const [url, init] = calls[0]!;

    expect(url).toBe(
      "https://api.subsource.net/api/v1/movies/search?searchType=text&q=fight+club",
    );
    expect(init.headers).toMatchObject({ "X-API-Key": API_KEY });
  });

  it("maps HTTP errors to SubSourceError with a friendly message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ error: "API key required" }, 401)),
    );

    const client = new SubSourceClient(API_KEY);

    await expect(client.getMovie(1)).rejects.toMatchObject({
      name: "SubSourceError",
      status: 401,
    });

    try {
      await client.getMovie(1);
    } catch (error) {
      expect(error).toBeInstanceOf(SubSourceError);
      expect((error as SubSourceError).friendlyMessage).toContain("rejected the API key");
    }
  });

  it("treats a success:false body as an error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ success: false, message: "Nope" })),
    );

    const client = new SubSourceClient(API_KEY);
    await expect(client.getMovie(1)).rejects.toMatchObject({
      name: "SubSourceError",
      status: 502,
    });
  });

  it("downloads a ZIP and keeps the server filename", async () => {
    const blob = new Blob(["zip-bytes"]);
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(blob, {
            status: 200,
            headers: {
              "content-type": "application/zip",
              "content-disposition": "attachment; filename*=UTF-8''My%20Subtitle.zip",
            },
          }),
      ),
    );

    const client = new SubSourceClient(API_KEY);
    const result = await client.downloadSubtitle(42);

    expect(result.filename).toBe("My Subtitle.zip");
    expect(result.blob.size).toBe(blob.size);
  });

  it("rejects JSON returned by the download endpoint", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ error: "Not available" }, 404)),
    );

    const client = new SubSourceClient(API_KEY);
    await expect(client.downloadSubtitle(42)).rejects.toMatchObject({
      name: "SubSourceError",
      status: 404,
    });
  });
});
