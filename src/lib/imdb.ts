/**
 * SubSource accepts either a bare IMDb ID (`tt0133093`) or a full IMDb URL for
 * IMDb searches. We normalize both to the bare ID before calling the API.
 */
const BARE_IMDB_ID = /^tt\d{5,}$/i;
const IMDB_URL =
  /^(?:https?:\/\/)?(?:www\.|m\.)?imdb\.com\/title\/tt\d{5,}(?:[/?#]|$)/i;
const ANY_IMDB_ID = /tt\d{5,}/i;

export function hasImdbId(input: string): boolean {
  const value = input.trim();
  return BARE_IMDB_ID.test(value) || IMDB_URL.test(value);
}

export function extractImdbId(input: string): string | null {
  const match = input.match(ANY_IMDB_ID);
  return match ? match[0].toLowerCase() : null;
}
