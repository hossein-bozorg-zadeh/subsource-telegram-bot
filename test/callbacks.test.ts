import { describe, expect, it } from "vitest";
import { cb, decodeCallback } from "../src/bot/callbacks";

describe("callback data", () => {
  it("round-trips menu actions", () => {
    expect(decodeCallback(cb.menu("home"))).toEqual({ type: "menu", view: "home" });
    expect(decodeCallback(cb.menu("admin"))).toEqual({ type: "menu", view: "admin" });
    expect(decodeCallback(cb.menu("downloads"))).toEqual({
      type: "menu",
      view: "downloads",
    });
    expect(decodeCallback(cb.menu("filters"))).toEqual({
      type: "menu",
      view: "filters",
    });
  });

  it("round-trips movie pagination", () => {
    expect(decodeCallback(cb.movie(550, 2))).toEqual({
      type: "movie",
      movieId: 550,
      page: 2,
    });
    expect(decodeCallback(cb.movie(550))).toEqual({
      type: "movie",
      movieId: 550,
      page: 1,
    });
  });

  it("round-trips recent, download, preview and history actions", () => {
    expect(decodeCallback(cb.recent(3))).toEqual({ type: "recent", page: 3 });
    expect(decodeCallback(cb.download(12345))).toEqual({
      type: "download",
      subtitleId: 12345,
    });
    expect(decodeCallback(cb.preview(42, 9))).toEqual({
      type: "preview",
      subtitleId: 42,
      movieId: 9,
    });
    expect(decodeCallback(cb.preview(42))).toEqual({
      type: "preview",
      subtitleId: 42,
      movieId: 0,
    });
    expect(decodeCallback(cb.downloads(2))).toEqual({ type: "downloads", page: 2 });
  });

  it("round-trips filter actions", () => {
    expect(decodeCallback(cb.filterLanguages())).toEqual({
      type: "filter-language-list",
    });
    expect(decodeCallback(cb.filterLanguage(null))).toEqual({
      type: "filter-language",
      language: null,
    });
    expect(decodeCallback(cb.filterLanguage("english"))).toEqual({
      type: "filter-language",
      language: "english",
    });
    expect(decodeCallback(cb.filterLanguage("chinese_traditional"))).toEqual({
      type: "filter-language",
      language: "chinese_traditional",
    });
    expect(decodeCallback(cb.filterType("movie"))).toEqual({
      type: "filter-type",
      mediaType: "movie",
    });
    expect(decodeCallback(cb.filterYear())).toEqual({ type: "filter-year" });
    expect(decodeCallback(cb.filterReset())).toEqual({ type: "filter-reset" });
  });

  it("round-trips admin actions", () => {
    expect(decodeCallback(cb.admin("settings"))).toEqual({
      type: "admin",
      view: "settings",
      page: 1,
    });
    expect(decodeCallback(cb.admin("users", 3))).toEqual({
      type: "admin",
      view: "users",
      page: 3,
    });
    expect(decodeCallback(cb.adminToggle("maintenance", true))).toEqual({
      type: "admin-toggle",
      setting: "maintenance",
      enabled: true,
    });
    expect(decodeCallback(cb.adminToggle("maintenance", false))).toEqual({
      type: "admin-toggle",
      setting: "maintenance",
      enabled: false,
    });
    expect(decodeCallback(cb.adminUser(123, true, 2))).toEqual({
      type: "admin-user",
      telegramId: 123,
      blocked: true,
      page: 2,
    });
    expect(decodeCallback(cb.adminAddAdmin())).toEqual({ type: "admin-add-admin" });
    expect(decodeCallback(cb.adminRemoveAdmin(123))).toEqual({
      type: "admin-remove-admin",
      telegramId: 123,
    });
    expect(decodeCallback(cb.adminLimit("rateLimitPerMinute"))).toEqual({
      type: "admin-limit",
      limit: "rateLimitPerMinute",
    });
    expect(decodeCallback(cb.adminLimit("subtitlesPerPage"))).toEqual({
      type: "admin-limit",
      limit: "subtitlesPerPage",
    });
  });

  it("round-trips broadcast actions", () => {
    for (const action of ["new", "go", "cancel", "resume", "refresh"] as const) {
      expect(decodeCallback(cb.broadcast(action))).toEqual({
        type: "broadcast",
        action,
      });
    }
  });

  it("handles noop actions", () => {
    expect(decodeCallback(cb.noop())).toEqual({ type: "noop" });
  });

  it("rejects unknown, empty and malformed data", () => {
    expect(decodeCallback(undefined)).toEqual({ type: "unknown" });
    expect(decodeCallback("")).toEqual({ type: "unknown" });
    expect(decodeCallback("wat")).toEqual({ type: "unknown" });
    expect(decodeCallback("mv:0:1")).toEqual({ type: "unknown" });
    expect(decodeCallback("mv:12:0")).toEqual({ type: "unknown" });
    expect(decodeCallback("dl:abc")).toEqual({ type: "unknown" });
    expect(decodeCallback("ad:nope")).toEqual({ type: "unknown" });
    expect(decodeCallback("as:maintenance:2")).toEqual({ type: "unknown" });
    expect(decodeCallback("as:other:1")).toEqual({ type: "unknown" });
    expect(decodeCallback("pv:42")).toEqual({ type: "unknown" });
    expect(decodeCallback("pv:42:abc")).toEqual({ type: "unknown" });
    expect(decodeCallback("dh:0")).toEqual({ type: "unknown" });
    expect(decodeCallback("fl:klingon")).toEqual({ type: "unknown" });
    expect(decodeCallback("ft:tvseries")).toEqual({ type: "unknown" });
    expect(decodeCallback("au:123:2:1")).toEqual({ type: "unknown" });
    expect(decodeCallback("ax:abc")).toEqual({ type: "unknown" });
    expect(decodeCallback("al:nope")).toEqual({ type: "unknown" });
    expect(decodeCallback("bc:nope")).toEqual({ type: "unknown" });
    expect(decodeCallback("menu:nope")).toEqual({ type: "unknown" });
  });

  it("stays inside Telegram's 64-byte callback_data limit", () => {
    const samples = [
      cb.menu("home"),
      cb.movie(Number.MAX_SAFE_INTEGER, 999_999),
      cb.recent(Number.MAX_SAFE_INTEGER),
      cb.download(Number.MAX_SAFE_INTEGER),
      cb.preview(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER),
      cb.downloads(Number.MAX_SAFE_INTEGER),
      cb.filterLanguages(),
      cb.filterLanguage("chinese_traditional"),
      cb.filterType("series"),
      cb.filterYear(),
      cb.filterReset(),
      cb.admin("settings"),
      cb.admin("users", 999_999),
      cb.adminToggle("maintenance", true),
      cb.adminUser(Number.MAX_SAFE_INTEGER, true, 999_999),
      cb.adminAddAdmin(),
      cb.adminRemoveAdmin(Number.MAX_SAFE_INTEGER),
      cb.adminLimit("downloadLimitPerHour"),
      cb.broadcast("resume"),
      cb.noop(),
    ];

    for (const sample of samples) {
      expect(new TextEncoder().encode(sample).length).toBeLessThanOrEqual(64);
    }
  });
});
