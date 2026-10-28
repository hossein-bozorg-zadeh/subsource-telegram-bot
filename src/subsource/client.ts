import type { Logger } from "../lib/logger";
import { sanitizeFilename } from "../lib/format";
import type {
  Movie,
  MovieSearchParams,
  QueryValue,
  RecentSubtitlesParams,
  SubSourceEnvelope,
  SubSourceUser,
  Subtitle,
  SubtitleListParams,
  UserSearchParams,
  UserSubtitlesParams,
} from "./types";

const DEFAULT_BASE_URL = "https://api.subsource.net/api/v1";
const JSON_TIMEOUT_MS = 15_000;
const DOWNLOAD_TIMEOUT_MS = 30_000;

export class SubSourceError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly retryAfterSeconds: number | null;

  constructor(
    message: string,
    options: {
      status: number;
      code?: string | null;
      retryAfterSeconds?: number | null;
      cause?: unknown;
    },
  ) {
    super(message, { cause: options.cause });
    this.name = "SubSourceError";
    this.status = options.status;
    this.code = options.code ?? null;
    this.retryAfterSeconds = options.retryAfterSeconds ?? null;
  }

  get friendlyMessage(): string {
    if (this.status === 401 || this.status === 403) {
      return "SubSource rejected the API key. Ask the bot owner to check SUBSOURCE_API_KEY.";
    }
    if (this.status === 404) {
      return "SubSource could not find that item. It may have been removed.";
    }
    if (this.status === 429) {
      const wait = this.retryAfterSeconds
        ? ` Try again in about ${this.retryAfterSeconds} seconds.`
        : " Try again in a minute.";
      return `The SubSource API rate limit was reached.${wait}`;
    }
    if (this.status === 504) {
      return "SubSource took too long to respond. Please try again.";
    }
    if (this.status >= 500) {
      return "SubSource is having trouble right now. Please try again shortly.";
    }
    return "SubSource returned an unexpected response. Please try again.";
  }
}

export function buildQuery(params: Record<string, QueryValue>): string {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }

  const query = search.toString();
  return query ? `?${query}` : "";
}

/**
 * Parses both RFC 5987 (`filename*=UTF-8''...`) and the common
 * `filename="..."` form used by SubSource downloads.
 */
export function parseContentDispositionFilename(header: string | null): string | null {
  if (!header) return null;

  const extended = header.match(/filename\*\s*=\s*([^;]+)/i);
  if (extended?.[1]) {
    const raw = extended[1].trim().replace(/^["']|["']$/g, "");
    const parts = raw.split("''");
    const encoded = parts.length > 1 ? parts.slice(1).join("''") : raw;
    try {
      return decodeURIComponent(encoded);
    } catch {
      return encoded;
    }
  }

  const quoted = header.match(/filename\s*=\s*"([^"]*)"/i);
  if (quoted?.[1]) return quoted[1];

  const bare = header.match(/filename\s*=\s*([^;]+)/i);
  if (bare?.[1]) return bare[1].trim();

  return null;
}

function parseErrorBody(body: unknown): { message: string | null; code: string | null } {
  if (!body || typeof body !== "object") return { message: null, code: null };

  const record = body as Record<string, unknown>;
  const error = record.error;

  if (typeof error === "string") return { message: error, code: null };
  if (error && typeof error === "object") {
    const nested = error as Record<string, unknown>;
    return {
      message:
        typeof nested.message === "string"
          ? nested.message
          : typeof nested.error === "string"
            ? nested.error
            : null,
      code: typeof nested.code === "string" ? nested.code : null,
    };
  }

  if (typeof record.message === "string") {
    return { message: record.message, code: null };
  }

  return { message: null, code: null };
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new SubSourceError("SubSource request timed out", {
        status: 504,
        cause: error,
      });
    }

    throw new SubSourceError("Could not reach SubSource", {
      status: 503,
      cause: error,
    });
  } finally {
    clearTimeout(timer);
  }
}

export class SubSourceClient {
  private readonly baseUrl: string;

  constructor(
    private readonly apiKey: string,
    private readonly logger?: Logger,
    baseUrl: string = DEFAULT_BASE_URL,
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  private async request<T>(
    path: string,
    params: Record<string, QueryValue> = {},
  ): Promise<SubSourceEnvelope<T>> {
    const url = `${this.baseUrl}${path}${buildQuery(params)}`;

    const response = await fetchWithTimeout(
      url,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          "X-API-Key": this.apiKey,
        },
      },
      JSON_TIMEOUT_MS,
    );

    const text = await response.text();
    let body: unknown = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = null;
      }
    }

    if (!response.ok) {
      const parsed = parseErrorBody(body);
      const retryAfterHeader = response.headers.get("retry-after");
      const retryAfter =
        retryAfterHeader && Number.isFinite(Number(retryAfterHeader))
          ? Number(retryAfterHeader)
          : null;

      this.logger?.warn("subsource_request_failed", {
        path,
        status: response.status,
        code: parsed.code,
        message: parsed.message,
      });

      throw new SubSourceError(parsed.message ?? `SubSource returned ${response.status}`, {
        status: response.status,
        code: parsed.code,
        retryAfterSeconds: retryAfter,
      });
    }

    if (!body || typeof body !== "object") {
      throw new SubSourceError("SubSource returned an invalid JSON response", {
        status: 502,
      });
    }

    const envelope = body as SubSourceEnvelope<T>;
    if (envelope.success === false) {
      const parsed = parseErrorBody(body);
      throw new SubSourceError(parsed.message ?? "SubSource reported an error", {
        status: 502,
        code: parsed.code,
      });
    }

    return envelope;
  }

  searchMovies(params: MovieSearchParams): Promise<SubSourceEnvelope<Movie[]>> {
    return this.request<Movie[]>("/movies/search", params);
  }

  getMovie(movieId: number): Promise<SubSourceEnvelope<Movie>> {
    return this.request<Movie>(`/movies/${movieId}`);
  }

  getRecentSubtitles(
    params: RecentSubtitlesParams = {},
  ): Promise<SubSourceEnvelope<Subtitle[]>> {
    return this.request<Subtitle[]>("/subtitles/recent", params);
  }

  getSubtitles(params: SubtitleListParams): Promise<SubSourceEnvelope<Subtitle[]>> {
    return this.request<Subtitle[]>("/subtitles", params);
  }

  getSubtitle(subtitleId: number): Promise<SubSourceEnvelope<Subtitle>> {
    return this.request<Subtitle>(`/subtitles/${subtitleId}`);
  }

  searchUsers(params: UserSearchParams): Promise<SubSourceEnvelope<SubSourceUser[]>> {
    return this.request<SubSourceUser[]>("/users/search", params);
  }

  getUser(userId: number): Promise<SubSourceEnvelope<SubSourceUser>> {
    return this.request<SubSourceUser>(`/users/${userId}`);
  }

  getUserSubtitles(
    userId: number,
    params: UserSubtitlesParams = {},
  ): Promise<SubSourceEnvelope<Subtitle[]>> {
    return this.request<Subtitle[]>(`/users/${userId}/subtitles`, params);
  }

  /**
   * Downloads a subtitle ZIP. The API answers with a binary attachment, but on
   * errors it may answer with JSON, so both content types are handled.
   */
  async downloadSubtitle(
    subtitleId: number,
  ): Promise<{ blob: Blob; filename: string }> {
    const url = `${this.baseUrl}/subtitles/${subtitleId}/download`;

    const response = await fetchWithTimeout(
      url,
      {
        method: "GET",
        headers: {
          Accept: "application/zip, application/json;q=0.9, */*;q=0.8",
          "X-API-Key": this.apiKey,
        },
      },
      DOWNLOAD_TIMEOUT_MS,
    );

    const contentType = response.headers.get("content-type") ?? "";

    if (!response.ok || contentType.includes("application/json")) {
      const text = await response.text();
      let body: unknown = null;
      try {
        body = JSON.parse(text);
      } catch {
        body = null;
      }
      const parsed = parseErrorBody(body);
      throw new SubSourceError(parsed.message ?? `SubSource returned ${response.status}`, {
        status: response.status,
        code: parsed.code,
      });
    }

    const blob = await response.blob();
    if (blob.size === 0) {
      throw new SubSourceError("SubSource returned an empty subtitle file", {
        status: 502,
      });
    }

    const filename =
      parseContentDispositionFilename(response.headers.get("content-disposition")) ??
      `subsource-${subtitleId}.zip`;

    return {
      blob,
      filename: sanitizeFilename(filename, `subsource-${subtitleId}.zip`),
    };
  }
}
