import type { BotContext } from "../bot/context";
import { cb } from "../bot/callbacks";
import {
  downloadsKeyboard,
  filterLanguageKeyboard,
  filtersKeyboard,
  mainMenuKeyboard,
  previewKeyboard,
  profileKeyboard,
} from "../bot/keyboards";
import { enforceRateLimit } from "../bot/limits";
import {
  downloadsText,
  filtersText,
  movieMeta,
  previewText,
  recentSubtitleButtonLabel,
  subtitleButtonLabel,
  subtitleCaption,
} from "../bot/presenters";
import { text } from "../bot/text";
import {
  getLimits,
  getUserFilters,
  getUserUsage,
  listUserDownloads,
  logDownload,
  logSearch,
  updateUserFilters,
} from "../db";
import {
  FILTER_LANGUAGES,
  filterSummary,
  filtersActive,
  parseYearInput,
  type MediaTypeFilter,
} from "../lib/filters";
import { escapeHtml, formatCount, truncate } from "../lib/format";
import { extractImdbId, hasImdbId } from "../lib/imdb";
import type { Movie, Subtitle } from "../subsource/types";

const MAX_FILE_BYTES = 49 * 1024 * 1024;
const DOWNLOADS_PER_PAGE = 8;

function firstName(ctx: BotContext): string {
  return ctx.user.first_name || ctx.user.username || "there";
}

/** A failed audit-log write must never break the user's flow. */
function logFailure(ctx: BotContext, event: string): (error: unknown) => void {
  return (error) => {
    ctx.logger.warn(event, {
      userId: ctx.userId,
      error: error instanceof Error ? error.message : String(error),
    });
  };
}

export async function handleStart(ctx: BotContext): Promise<void> {
  await ctx.clearSession();
  await ctx.reply(text.welcome(firstName(ctx), ctx.isAdmin), {
    reply_markup: mainMenuKeyboard(ctx.isAdmin),
  });
}

export async function handleHome(ctx: BotContext): Promise<void> {
  await ctx.answer();
  await ctx.clearSession();
  await ctx.edit(text.welcome(firstName(ctx), ctx.isAdmin), {
    reply_markup: mainMenuKeyboard(ctx.isAdmin),
  });
}

export async function handleHelp(ctx: BotContext): Promise<void> {
  await ctx.answer();
  await ctx.clearSession();
  await ctx.edit(text.help(ctx.isAdmin), {
    reply_markup: mainMenuKeyboard(ctx.isAdmin),
  });
}

export async function handleCancel(ctx: BotContext): Promise<void> {
  await ctx.clearSession();
  await ctx.reply(text.cancelled, { reply_markup: mainMenuKeyboard(ctx.isAdmin) });
}

export async function handleId(ctx: BotContext): Promise<void> {
  await ctx.clearSession();
  await ctx.reply(
    [
      `🆔 Your Telegram ID: <code>${ctx.userId}</code>`,
      `💬 Chat ID: <code>${ctx.chatId}</code>`,
      "",
      "Share the Telegram ID with the bot owner to request admin access.",
    ].join("\n"),
  );
}

export async function handleMe(ctx: BotContext): Promise<void> {
  await ctx.answer();
  await ctx.clearSession();
  const usage = await getUserUsage(ctx.db, ctx.userId);
  const name = [ctx.user.first_name, ctx.user.last_name].filter(Boolean).join(" ");

  const lines = [
    "👤 <b>Your profile</b>",
    "",
    `Name: <b>${escapeHtml(name || "Unknown")}</b>`,
  ];

  if (ctx.user.username) lines.push(`Username: @${escapeHtml(ctx.user.username)}`);
  lines.push(`Telegram ID: <code>${ctx.userId}</code>`);
  if (ctx.isAdmin) lines.push("Role: <b>Admin</b>");
  lines.push(
    "",
    `🔎 Searches: <b>${formatCount(usage.searches)}</b>`,
    `⬇️ Downloads: <b>${formatCount(usage.downloads)}</b>`,
  );

  await ctx.edit(lines.join("\n"), { reply_markup: profileKeyboard(ctx.isAdmin) });
}

export async function handleSearchCommand(ctx: BotContext): Promise<void> {
  const query = ctx.args.trim();

  if (!query) {
    await ctx.setSession("user.search", {}, 5 * 60);
    await ctx.reply(text.searchPrompt, { reply_markup: mainMenuKeyboard(ctx.isAdmin) });
    return;
  }

  await ctx.clearSession();
  await runSearch(ctx, query);
}

export async function promptSearch(ctx: BotContext): Promise<void> {
  await ctx.answer();
  await ctx.setSession("user.search", {}, 5 * 60);
  await ctx.edit(text.searchPrompt, { reply_markup: mainMenuKeyboard(ctx.isAdmin) });
}

export async function runSearch(ctx: BotContext, rawQuery: string): Promise<void> {
  const limits = await getLimits(ctx.db, ctx.config);
  const allowed = await enforceRateLimit(
    ctx,
    "search",
    60,
    limits.rateLimitPerMinute,
  );
  if (!allowed) return;

  const query = rawQuery.replace(/\s+/g, " ").trim().slice(0, 200);
  if (query.length < 2) {
    await ctx.clearSession();
    await ctx.edit(text.searchTooShort, { reply_markup: mainMenuKeyboard(ctx.isAdmin) });
    return;
  }

  await ctx.answer();
  await ctx.clearSession();

  const filters = await getUserFilters(ctx.db, ctx.userId);
  const imdbId = hasImdbId(query) ? extractImdbId(query) : null;
  const response = await ctx.subsource.searchMovies(
    imdbId
      ? { searchType: "imdb", imdb: imdbId }
      : {
          searchType: "text",
          q: query,
          type: filters.mediaType,
          year: filters.year ?? undefined,
        },
  );

  const movies = response.data.filter(
    (movie) => Number.isSafeInteger(movie.movieId) && movie.movieId > 0,
  );

  await logSearch(ctx.db, ctx.userId, "movie", query).catch(
    logFailure(ctx, "search_log_failed"),
  );

  if (movies.length === 0) {
    await ctx.edit(text.searchNoResults, {
      reply_markup: mainMenuKeyboard(ctx.isAdmin),
    });
    return;
  }

  const shown = movies.slice(0, limits.searchResults);
  const rows = shown.map((movie, index) => [
    {
      text: truncate(
        `${index + 1}. ${movie.title}${movie.releaseYear ? ` (${movie.releaseYear})` : ""}${
          movie.type === "tvseries" && movie.season ? ` S${movie.season}` : ""
        }`,
        60,
      ),
      callback_data: cb.movie(movie.movieId),
    },
  ]);

  rows.push([
    { text: "⚙️ Filters", callback_data: cb.menu("filters") },
    { text: "🔍 New search", callback_data: cb.menu("search") },
  ]);
  rows.push([{ text: "🏠 Menu", callback_data: cb.menu("home") }]);

  const summary =
    movies.length > shown.length
      ? `Showing the first ${shown.length} of ${movies.length} matches.`
      : `${movies.length} match${movies.length === 1 ? "" : "es"} found.`;

  const header = [`🔎 <b>Results for</b> "${escapeHtml(query)}"`];
  if (filtersActive(filters)) {
    header.push(`<i>Filters: ${escapeHtml(filterSummary(filters))}</i>`);
  }

  await ctx.edit(
    [...header, "", summary, "Pick a title:"].join("\n"),
    { reply_markup: { inline_keyboard: rows } },
  );
}

export async function handleRecent(ctx: BotContext, page = 1): Promise<void> {
  await ctx.clearSession();

  const limits = await getLimits(ctx.db, ctx.config);
  const allowed = await enforceRateLimit(
    ctx,
    "recent",
    60,
    limits.rateLimitPerMinute,
  );
  if (!allowed) return;

  await ctx.answer();

  const filters = await getUserFilters(ctx.db, ctx.userId);
  const response = await ctx.subsource.getRecentSubtitles({
    page: Math.min(Math.max(1, page), 20),
    limit: limits.recentPerPage,
    sort: "latest",
    language: filters.language ?? undefined,
  });

  const subtitles = response.data.filter((subtitle) => subtitle.subtitleId > 0);
  const pages = Math.max(1, response.pagination?.pages ?? 1);
  const currentPage = Math.min(
    Math.max(1, response.pagination?.page ?? page),
    pages,
  );

  await logSearch(ctx.db, ctx.userId, "recent", `page ${currentPage}`).catch(
    logFailure(ctx, "recent_log_failed"),
  );

  if (subtitles.length === 0) {
    await ctx.edit(text.recentEmpty, {
      reply_markup: mainMenuKeyboard(ctx.isAdmin),
    });
    return;
  }

  const rows = subtitles.map((subtitle) => {
    const row = [
      {
        text: recentSubtitleButtonLabel(subtitle),
        callback_data: cb.download(subtitle.subtitleId),
      },
      { text: "👁", callback_data: cb.preview(subtitle.subtitleId, subtitle.movieId) },
    ];

    if (subtitle.movieId) {
      row.push({ text: "🎬", callback_data: cb.movie(subtitle.movieId) });
    }

    return row;
  });

  const navigation = paginationRow(currentPage, pages, cb.recent, cb.noop());
  if (navigation) rows.push(navigation);
  rows.push([
    { text: "⚙️ Filters", callback_data: cb.menu("filters") },
    { text: "🏠 Main menu", callback_data: cb.menu("home") },
  ]);

  const lines = ["🆕 <b>Recent subtitles</b>", `Page ${currentPage} of ${pages}`];
  if (filters.language) {
    lines.push(`<i>Language: ${escapeHtml(filterSummary(filters))}</i>`);
  }
  lines.push("", "Tap a subtitle to download, 👁 to preview, or 🎬 to open the title.");

  await ctx.edit(lines.join("\n"), {
    reply_markup: { inline_keyboard: rows },
  });
}

export async function showMovie(
  ctx: BotContext,
  movieId: number,
  page = 1,
): Promise<void> {
  const limits = await getLimits(ctx.db, ctx.config);
  const allowed = await enforceRateLimit(
    ctx,
    "movie",
    60,
    limits.rateLimitPerMinute,
  );
  if (!allowed) return;

  await ctx.answer();
  await ctx.clearSession();

  const filters = await getUserFilters(ctx.db, ctx.userId);
  const [movieResponse, subtitlesResponse] = await Promise.all([
    ctx.subsource.getMovie(movieId),
    ctx.subsource.getSubtitles({
      movieId,
      page: Math.max(1, page),
      limit: limits.subtitlesPerPage,
      sort: "rating",
      language: filters.language ?? undefined,
    }),
  ]);

  const movie = movieResponse.data;
  const subtitles = subtitlesResponse.data.filter((item) => item.subtitleId > 0);
  const pages = Math.max(1, subtitlesResponse.pagination?.pages ?? 1);
  const currentPage = Math.min(
    Math.max(1, subtitlesResponse.pagination?.page ?? page),
    pages,
  );

  await logSearch(ctx.db, ctx.userId, "movie-view", String(movieId)).catch(
    logFailure(ctx, "movie_log_failed"),
  );

  const lines = renderMovieHeader(movie);
  if (filters.language) {
    lines.push(`<i>Filtered: ${escapeHtml(filterSummary(filters))}</i>`);
  }

  if (subtitles.length === 0) {
    lines.push("", text.noSubtitles);
  } else {
    lines.push("", "<b>Available subtitles</b>");
  }

  const rows = subtitles.map((subtitle) => [
    {
      text: subtitleButtonLabel(subtitle),
      callback_data: cb.download(subtitle.subtitleId),
    },
    { text: "👁", callback_data: cb.preview(subtitle.subtitleId, movieId) },
  ]);

  const navigation = paginationRow(currentPage, pages, (nextPage) =>
    cb.movie(movieId, nextPage), cb.noop());
  if (navigation) rows.push(navigation);

  rows.push([
    { text: "⚙️ Filters", callback_data: cb.menu("filters") },
    { text: "🔍 New search", callback_data: cb.menu("search") },
  ]);
  rows.push([{ text: "🏠 Menu", callback_data: cb.menu("home") }]);

  await ctx.edit(lines.join("\n"), {
    reply_markup: { inline_keyboard: rows },
  });
}

function renderMovieHeader(movie: Movie): string[] {
  const lines = [`🎬 <b>${escapeHtml(truncate(movie.title, 200))}</b>`];

  if (movie.alternateTitle && movie.alternateTitle !== movie.title) {
    lines.push(`<i>${escapeHtml(truncate(movie.alternateTitle, 200))}</i>`);
  }

  lines.push(escapeHtml(movieMeta(movie)));

  if (movie.imdbId) {
    const imdbUrl = `https://www.imdb.com/title/${encodeURIComponent(movie.imdbId)}/`;
    lines.push(`<a href="${escapeHtml(imdbUrl)}">IMDb</a> · <code>${escapeHtml(movie.imdbId)}</code>`);
  }

  if (typeof movie.subtitleCount === "number") {
    lines.push(`💬 ${formatCount(movie.subtitleCount)} subtitles`);
  }

  const poster = movie.posters?.medium;
  if (poster) {
    lines.push(`<a href="${escapeHtml(poster)}">🖼 Poster</a>`);
  }

  return lines;
}

function paginationRow(
  currentPage: number,
  pages: number,
  build: (page: number) => string,
  noopData: string,
): { text: string; callback_data: string }[] | null {
  if (pages <= 1) return null;

  const row: { text: string; callback_data: string }[] = [];

  if (currentPage > 1) {
    row.push({ text: "← Prev", callback_data: build(currentPage - 1) });
  }

  row.push({ text: `${currentPage}/${pages}`, callback_data: noopData });

  if (currentPage < pages) {
    row.push({ text: "Next →", callback_data: build(currentPage + 1) });
  }

  return row;
}

export async function downloadSubtitle(
  ctx: BotContext,
  subtitleId: number,
): Promise<void> {
  const limits = await getLimits(ctx.db, ctx.config);
  const allowed = await enforceRateLimit(
    ctx,
    "download",
    60 * 60,
    limits.downloadLimitPerHour,
  );
  if (!allowed) return;

  await ctx.api.sendChatAction(ctx.chatId, "upload_document").catch(() => undefined);

  let metadata: Subtitle | null = null;
  try {
    const response = await ctx.subsource.getSubtitle(subtitleId);
    metadata = response.data;
  } catch (error) {
    // Metadata is only used for the caption; the ZIP may still be available.
    ctx.logger.warn("subtitle_metadata_failed", {
      subtitleId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const { blob, filename } = await ctx.subsource.downloadSubtitle(subtitleId);

  if (blob.size > MAX_FILE_BYTES) {
    await ctx.answer(text.downloadTooLarge, true);
    return;
  }

  const caption = metadata
    ? subtitleCaption(metadata)
    : `SubSource subtitle <code>${subtitleId}</code>`;

  await ctx.api.sendDocument(ctx.chatId, blob, filename, caption);

  await logDownload(
    ctx.db,
    ctx.userId,
    subtitleId,
    metadata?.movieId ?? null,
    metadata?.language ?? null,
    metadata?.title ?? null,
  ).catch(logFailure(ctx, "download_log_failed"));

  await ctx.answer(text.downloadSent);
}

export async function showPreview(
  ctx: BotContext,
  subtitleId: number,
  movieId = 0,
): Promise<void> {
  const limits = await getLimits(ctx.db, ctx.config);
  const allowed = await enforceRateLimit(
    ctx,
    "preview",
    60,
    limits.rateLimitPerMinute,
  );
  if (!allowed) return;

  await ctx.answer();
  await ctx.clearSession();

  const response = await ctx.subsource.getSubtitle(subtitleId);
  const backTo = movieId > 0 ? movieId : response.data.movieId;

  await ctx.edit(previewText(response.data), {
    reply_markup: previewKeyboard(subtitleId, backTo),
  });
}

export async function handlePreviewCommand(ctx: BotContext): Promise<void> {
  const raw = ctx.args.trim();
  if (!raw) {
    await ctx.reply(text.previewUsage, { reply_markup: mainMenuKeyboard(ctx.isAdmin) });
    return;
  }

  if (!/^\d+$/.test(raw) || Number(raw) <= 0) {
    await ctx.reply(text.previewUsage, { reply_markup: mainMenuKeyboard(ctx.isAdmin) });
    return;
  }

  await showPreview(ctx, Number(raw));
}

export async function showDownloads(ctx: BotContext, page = 1): Promise<void> {
  await ctx.answer();
  await ctx.clearSession();

  const result = await listUserDownloads(
    ctx.db,
    ctx.userId,
    page,
    DOWNLOADS_PER_PAGE,
  );

  await ctx.edit(downloadsText(result), {
    reply_markup: downloadsKeyboard(
      result.results,
      result.page,
      result.pages,
      ctx.isAdmin,
    ),
  });
}

export async function showFilters(ctx: BotContext): Promise<void> {
  await ctx.answer();
  await ctx.clearSession();

  const filters = await getUserFilters(ctx.db, ctx.userId);
  await ctx.edit(filtersText(filters), { reply_markup: filtersKeyboard(filters) });
}

export async function showFilterLanguages(ctx: BotContext): Promise<void> {
  await ctx.answer();
  await ctx.clearSession();

  const filters = await getUserFilters(ctx.db, ctx.userId);
  await ctx.edit(filtersText(filters), {
    reply_markup: filterLanguageKeyboard(filters, FILTER_LANGUAGES),
  });
}

export async function setLanguageFilter(
  ctx: BotContext,
  language: string | null,
): Promise<void> {
  await updateUserFilters(ctx.db, ctx.userId, { language });
  await showFilters(ctx);
}

export async function setTypeFilter(
  ctx: BotContext,
  mediaType: MediaTypeFilter,
): Promise<void> {
  await updateUserFilters(ctx.db, ctx.userId, { mediaType });
  await showFilters(ctx);
}

export async function promptYearFilter(ctx: BotContext): Promise<void> {
  await ctx.answer();
  await ctx.setSession("user.year", {}, 5 * 60);
  await ctx.edit(text.yearPrompt, {
    reply_markup: {
      inline_keyboard: [[{ text: "← Back to filters", callback_data: cb.menu("filters") }]],
    },
  });
}

export async function handleYearInput(ctx: BotContext, input: string): Promise<void> {
  const parsed = parseYearInput(input);

  if (!parsed.ok) {
    await ctx.reply(text.yearInvalid);
    return;
  }

  await updateUserFilters(ctx.db, ctx.userId, { year: parsed.year });
  await ctx.clearSession();
  await showFilters(ctx);
}

export async function resetFilters(ctx: BotContext): Promise<void> {
  await updateUserFilters(ctx.db, ctx.userId, {
    language: null,
    year: null,
    mediaType: "all",
  });
  await showFilters(ctx);
}

export async function handleDownloadsCommand(ctx: BotContext): Promise<void> {
  const raw = ctx.args.trim();
  const page = /^\d+$/.test(raw) ? Number(raw) : 1;
  await showDownloads(ctx, page);
}

export async function handleFiltersCommand(ctx: BotContext): Promise<void> {
  await showFilters(ctx);
}
