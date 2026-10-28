/** Telegram sends HTML, so every value interpolated into a message must be escaped. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function truncate(value: string, maxLength: number, suffix = "…"): string {
  if (maxLength <= 0) return "";
  if (value.length <= maxLength) return value;
  if (maxLength <= suffix.length) return value.slice(0, maxLength);
  return value.slice(0, maxLength - suffix.length).trimEnd() + suffix;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / 1024 ** exponent;
  return `${value.toFixed(exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

export function formatCount(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

export function formatRelease(releaseInfo: string[] | null | undefined): string {
  if (!releaseInfo || releaseInfo.length === 0) return "";
  return releaseInfo.filter(Boolean).join(" · ");
}

export function titleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** Removes characters Telegram/macOS dislike in downloaded file names. */
export function sanitizeFilename(value: string, fallback = "subtitle.zip"): string {
  const cleaned = value
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "");

  if (!cleaned) return fallback;
  return cleaned.slice(0, 120);
}
