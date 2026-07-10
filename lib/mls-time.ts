// RETS/MLS ModificationTimestamp values arrive as naive datetime strings in UTC
// (e.g. "2026-07-07T19:39:37") with no timezone designator. Left as-is, the JS
// Date parser treats them as *local* time, which shifts everything by the local
// UTC offset (showing future times in ET). Normalize by tagging bare datetimes
// as UTC so they parse to the correct instant.

const HAS_TZ = /(?:z|[+-]\d{2}:?\d{2})$/i;

/** Normalize a naive (timezone-less) MLS datetime string to explicit UTC. */
export function normalizeMlsTimestamp(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const trimmed = iso.trim();
  if (!trimmed) return null;
  if (HAS_TZ.test(trimmed)) return trimmed;
  // Accept both "YYYY-MM-DDTHH:mm:ss" and "YYYY-MM-DD HH:mm:ss".
  return `${trimmed.replace(" ", "T")}Z`;
}

/** Parse an MLS timestamp to epoch ms, treating naive strings as UTC. */
export function mlsTimestampMs(iso: string | null | undefined): number {
  const normalized = normalizeMlsTimestamp(iso);
  if (!normalized) return NaN;
  return Date.parse(normalized);
}

/** Parse an MLS timestamp to a Date, treating naive strings as UTC. */
export function mlsTimestampDate(iso: string | null | undefined): Date | null {
  const ms = mlsTimestampMs(iso);
  return Number.isNaN(ms) ? null : new Date(ms);
}
