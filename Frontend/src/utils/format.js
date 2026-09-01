/**
 * Formatting helpers shared by every page.
 *
 * These were previously copy-pasted into Dashboard, DocumentList, AdminUsers,
 * AdminDocuments, AdminQueries and Usage, with slightly different behaviour and
 * different crash-on-null bugs in each copy.
 */

const UUID_PREFIX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Strips the `<uuid>_` prefix the server adds to stored filenames. */
export function displayFilename(filename) {
  if (!filename) return "Untitled";

  const parts = String(filename).split("_");
  if (parts.length > 1 && UUID_PREFIX.test(parts[0])) {
    return parts.slice(1).join("_");
  }
  return filename;
}

/** Truncates in the middle so the extension stays visible. */
export function truncateMiddle(text, max = 34) {
  const value = String(text ?? "");
  if (value.length <= max) return value;

  const keep = Math.floor((max - 1) / 2);
  return `${value.slice(0, keep)}…${value.slice(-keep)}`;
}

export function fileExtension(filename) {
  const name = String(filename ?? "");
  if (!name.includes(".")) return "";
  return name.split(".").pop().toLowerCase();
}

/** Handles 0 bytes, which `Math.log(0)` turned into "NaN undefined". */
export function formatBytes(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value <= 0) return "0 B";

  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(
    Math.floor(Math.log(value) / Math.log(1024)),
    units.length - 1
  );
  const size = value / 1024 ** exponent;

  return `${size >= 10 || exponent === 0 ? Math.round(size) : size.toFixed(1)} ${
    units[exponent]
  }`;
}

export function formatNumber(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "0";
  if (Math.abs(num) >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (Math.abs(num) >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return String(num);
}

function toDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "Just now", "12m ago", "3h ago", then an absolute date. */
export function formatRelative(value) {
  const date = toDate(value);
  if (!date) return "—";

  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

  if (seconds < 0) return "Just now"; // clock skew between server and browser
  if (seconds < 60) return "Just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;

  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function formatDate(value) {
  const date = toDate(value);
  if (!date) return "—";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatDateTime(value) {
  const date = toDate(value);
  if (!date) return "—";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatTime(value) {
  const date = toDate(value);
  if (!date) return "";
  return date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function initials(source) {
  const value = String(source ?? "").trim();
  if (!value) return "?";

  const local = value.includes("@") ? value.split("@")[0] : value;
  const words = local.split(/[\s._-]+/).filter(Boolean);

  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return local.slice(0, 2).toUpperCase();
}

/** Guards against `(a / 0) * 100` producing NaN in progress-bar widths. */
export function percent(part, total) {
  const numerator = Number(part) || 0;
  const denominator = Number(total) || 0;
  if (denominator <= 0) return 0;
  return Math.max(0, Math.min(100, (numerator / denominator) * 100));
}
