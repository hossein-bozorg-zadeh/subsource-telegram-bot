import { describe, expect, it } from "vitest";
import {
  adminAdminsText,
  adminBroadcastText,
  adminDownloadsText,
  adminSettingsText,
  adminStatsText,
  adminUsersText,
  broadcastPreviewText,
  downloadsText,
  filtersText,
  previewText,
  recentSubtitleButtonLabel,
  subtitleButtonLabel,
  subtitleCaption,
} from "../src/bot/presenters";
import type { Config } from "../src/config";
import type { BotUser, BroadcastRecord, DownloadWithUser } from "../src/db";

const subtitle = {
  subtitleId: 7,
  movieId: 9,
  title: "A Very Long Movie Title That Should Be Shortened",
  language: "spanish_spain",
  releaseInfo: ["BluRay", "1080p"],
  hearingImpaired: true,
  downloads: 1234,
};

describe("subtitle presenters", () => {
  it("builds a language/release label for movie pages", () => {
    const label = subtitleButtonLabel(subtitle);
    expect(label).toContain("Spanish (Spain)");
    expect(label).toContain("BluRay");
    expect(label).toContain("HI");
  });

  it("uses the title for recent lists", () => {
    const label = recentSubtitleButtonLabel(subtitle);
    expect(label).toContain("A Very Long Movie");
    expect(label).toContain("Spanish (Spain)");
  });

  it("escapes captions and includes useful metadata", () => {
    const caption = subtitleCaption({
      ...subtitle,
      releaseInfo: ["<b>", "1080p"],
    });

    expect(caption).toContain("&lt;b&gt;");
    expect(caption).toContain("1,234 downloads");
    expect(caption).toContain("<code>7</code>");
  });
});

describe("subtitle preview", () => {
  it("escapes preview text and includes metadata", () => {
    const output = previewText({
      ...subtitle,
      preview: "<script>alert('x')</script>\nHello",
    });

    expect(output).toContain("&lt;script&gt;");
    expect(output).not.toContain("<script>");
    expect(output).toContain("Spanish (Spain)");
    expect(output).toContain("<code>7</code>");
  });

  it("handles a missing preview", () => {
    expect(previewText({ ...subtitle, preview: null })).toContain(
      "No preview text is available",
    );
  });
});

describe("filter and history presenters", () => {
  it("renders active filters", () => {
    const output = filtersText({
      language: "english",
      year: 2019,
      mediaType: "movie",
    });

    expect(output).toContain("English");
    expect(output).toContain("2019");
    expect(output).toContain("Movies");
  });

  it("renders the user download history", () => {
    const output = downloadsText({
      total: 1,
      page: 1,
      pages: 1,
      results: [
        {
          id: 1,
          telegram_id: 123,
          subtitle_id: 42,
          movie_id: 9,
          language: "spanish",
          title: "<b>Movie</b>",
          created_at: "2026-01-02 03:04:05",
        },
      ],
    });

    expect(output).toContain("&lt;b&gt;Movie&lt;/b&gt;");
    expect(output).toContain("Spanish");
    expect(output).toContain("2026-01-02 03:04 UTC");
    expect(output).toContain("Total: <b>1</b>");
  });

  it("renders an empty download history", () => {
    expect(
      downloadsText({ total: 0, page: 1, pages: 1, results: [] }),
    ).toContain("not downloaded any subtitles");
  });
});

describe("admin feature presenters", () => {
  const config: Config = {
    botToken: "token",
    botUsername: null,
    subsourceApiKey: "key",
    webhookSecret: "secret",
    adminIds: new Set([111]),
    appEnv: "production",
    logLevel: "info",
    rateLimitPerMinute: 20,
    downloadLimitPerHour: 30,
    subtitlesPerPage: 6,
    recentPerPage: 8,
    searchResults: 8,
    cacheChannelId: null,
  };

  it("renders recent downloads with the user", () => {
    const downloads: DownloadWithUser[] = [
      {
        id: 1,
        telegram_id: 123,
        subtitle_id: 42,
        movie_id: 9,
        language: "english",
        title: "Heat",
        created_at: "2026-01-02 03:04:05",
        username: "alice",
        first_name: "Alice",
        last_name: null,
      },
    ];

    const output = adminDownloadsText(downloads);
    expect(output).toContain("Heat");
    expect(output).toContain("Alice");
    expect(output).toContain("alice");
    expect(output).toContain("English");
  });

  it("renders admin roles and marks env owners", () => {
    const output = adminAdminsText(new Set([111]), [
      { telegram_id: 222, role: "admin", created_at: "2026-01-01 00:00:00" },
    ]);

    expect(output).toContain("111");
    expect(output).toContain("222");
    expect(output).toContain("ADMIN_TELEGRAM_IDS");
  });

  it("renders broadcast progress", () => {
    const broadcast: BroadcastRecord = {
      id: 3,
      message: "hello",
      status: "running",
      cursor: 100,
      sent: 4,
      failed: 1,
      total: 10,
      created_by: 111,
      created_at: "2026-01-02 03:04:05",
      updated_at: "2026-01-02 03:05:05",
    };

    const output = adminBroadcastText(broadcast);
    expect(output).toContain("Sending");
    expect(output).toContain("Sent: <b>4</b>");
    expect(output).toContain("Remaining: <b>5</b>");
  });

  it("renders the empty broadcast state", () => {
    expect(adminBroadcastText(null)).toContain("No broadcasts yet");
  });

  it("escapes broadcast previews", () => {
    const output = broadcastPreviewText("<b>hello</b>", 10);
    expect(output).toContain("&lt;b&gt;hello&lt;/b&gt;");
    expect(output).toContain("Recipients: <b>10</b>");
  });

  it("renders effective runtime limits in settings", () => {
    const output = adminSettingsText(config, true, {
      rateLimitPerMinute: 50,
      downloadLimitPerHour: 60,
      subtitlesPerPage: 10,
      recentPerPage: 5,
      searchResults: 12,
    });

    expect(output).toContain("Maintenance mode: <b>ON</b>");
    expect(output).toContain("Searches/min: <b>50</b>");
    expect(output).toContain("Subtitles/page: <b>10</b>");
    expect(output).toContain("Results: <b>12</b>");
  });
});

describe("admin presenters", () => {
  it("renders stats without leaking anything unexpected", () => {
    const text = adminStatsText(
      {
        totalUsers: 10,
        activeUsers24h: 3,
        searches24h: 4,
        downloads24h: 5,
        admins: 1,
      },
      "production",
    );

    expect(text).toContain("Users: <b>10</b>");
    expect(text).toContain("production");
    expect(text).not.toContain("token");
  });

  it("renders recent users and escapes names", () => {
    const users: BotUser[] = [
      {
        telegram_id: 123,
        username: "bad<name>",
        first_name: "Bad<script>",
        last_name: null,
        language_code: "en",
        is_blocked: 1,
        settings: "{}",
        created_at: "2026-01-01 00:00:00",
        last_seen_at: "2026-01-02 03:04:05",
      },
    ];

    const text = adminUsersText({ total: 1, blocked: 1 }, users);
    expect(text).toContain("Bad&lt;script&gt;");
    expect(text).toContain("⛔");
    expect(text).toContain("2026-01-02 03:04 UTC");
  });
});
