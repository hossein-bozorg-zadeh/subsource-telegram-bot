export interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export interface MoviePosters {
  small?: string | null;
  medium?: string | null;
  large?: string | null;
  original?: string | null;
}

export interface Movie {
  movieId: number;
  title: string;
  alternateTitle?: string | null;
  type: "movie" | "tvseries" | string;
  releaseYear?: number | null;
  imdbId?: string | null;
  tmdbId?: string | null;
  season?: number | null;
  subtitleCount?: number;
  posters?: MoviePosters | null;
}

export interface SubtitleRating {
  good: number;
  bad: number;
  total: number;
}

export interface SubtitleContributor {
  id: number;
  displayname: string;
}

export interface Subtitle {
  subtitleId: number;
  movieId: number;
  title?: string | null;
  mediaType?: string | null;
  language: string;
  releaseInfo?: string[] | null;
  commentary?: string | null;
  files?: number;
  size?: number;
  hearingImpaired?: boolean;
  foreignParts?: boolean;
  framerate?: string | null;
  productionType?: string | null;
  releaseType?: string | null;
  downloads?: number;
  comments?: number;
  rating?: SubtitleRating | null;
  preview?: string | null;
  uploaderId?: number | null;
  link?: string | null;
  createdAt?: string | null;
  contributors?: SubtitleContributor[] | null;
}

export interface SubSourceUser {
  userId?: number;
  id?: number;
  username?: string | null;
  displayname?: string | null;
  subtitles?: number;
  [key: string]: unknown;
}

export interface SubSourceEnvelope<T> {
  success?: boolean;
  data: T;
  pagination?: Pagination;
  filters?: Record<string, unknown> | null;
  error?: unknown;
}

export type QueryValue = string | number | boolean | null | undefined;

export interface MovieSearchParams extends Record<string, QueryValue> {
  searchType: "text" | "imdb";
  q?: string;
  imdb?: string;
  year?: number;
  type?: "movie" | "series" | "all";
  season?: number;
}

export interface SubtitleListParams extends Record<string, QueryValue> {
  movieId?: number;
  language?: string;
  productionType?: string;
  releaseType?: string;
  releaseInfo?: string;
  uploader?: number;
  hearingImpaired?: boolean;
  foreignParts?: boolean;
  framerate?: string;
  page?: number;
  limit?: number;
  sort?: "newest" | "oldest" | "popular" | "rating";
}

export interface RecentSubtitlesParams extends Record<string, QueryValue> {
  language?: string;
  type?: "movie" | "tvseries";
  sort?: "latest" | "popular";
  page?: number;
  limit?: number;
}

export interface UserSearchParams extends Record<string, QueryValue> {
  search: string;
  page?: number;
  limit?: number;
}

export interface UserSubtitlesParams extends Record<string, QueryValue> {
  page?: number;
  limit?: number;
}
