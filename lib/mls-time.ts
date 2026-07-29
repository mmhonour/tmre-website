// Single owner of the "MLS sends zone-less values" rule. SmartMLS timestamps
// arrive without a timezone designator (e.g. "2026-07-07T19:39:37") and are
// actually UTC — left as-is, both the JS Date parser and a Postgres timestamptz
// column read them in the local/session zone (America/New_York), shifting every
// MLS change ~4h into the future.
//
// Date-only values (ListingContractDate) are the opposite case: they name an
// Eastern calendar day, so they must become Eastern midnight. Tagging them UTC
// pushed `list_date::date` back onto the previous Eastern day and hid brand-new
// listings from every "new today" query.
//
// Normalize at the boundary (RETS mapping) and on display; never re-implement
// either rule elsewhere.

const HAS_TZ = /(?:z|[+-]\d{2}:?\d{2})$/i;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const MLS_SOURCE_TZ = "America/New_York";

/** e.g. '-04:00' — the Eastern offset in effect on the given calendar day (DST-aware). */
function easternOffsetForDay(isoDay: string): string {
  const noonUtc = new Date(`${isoDay}T12:00:00Z`);
  if (Number.isNaN(noonUtc.getTime())) return "-05:00";
  const label =
    new Intl.DateTimeFormat("en-US", {
      timeZone: MLS_SOURCE_TZ,
      timeZoneName: "shortOffset",
    })
      .formatToParts(noonUtc)
      .find((part) => part.type === "timeZoneName")?.value ?? "GMT-5";
  const match = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(label);
  if (!match) return "-05:00";
  const [, sign, hours, minutes] = match;
  return `${sign}${hours.padStart(2, "0")}:${minutes ?? "00"}`;
}

/**
 * Normalize an MLS date-only value to Eastern midnight with an explicit offset,
 * so `list_date::date` in an Eastern session is the day the listing hit the market.
 * Zone-bearing values pass through untouched.
 */
export function normalizeMlsDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (HAS_TZ.test(trimmed)) return trimmed;
  const day = trimmed.slice(0, 10);
  if (!DATE_ONLY.test(day)) return trimmed;
  const time = trimmed.length > 10 ? trimmed.slice(11) || "00:00:00" : "00:00:00";
  return `${day}T${time}${easternOffsetForDay(day)}`;
}

/** Normalize a naive (timezone-less) MLS datetime string to explicit UTC. */
export function normalizeMlsTimestamp(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const trimmed = iso.trim();
  if (!trimmed) return null;
  if (HAS_TZ.test(trimmed)) return trimmed;
  // Accept both "YYYY-MM-DDTHH:mm:ss" and "YYYY-MM-DD HH:mm:ss".
  const withT = trimmed.replace(" ", "T");
  // A datetime field can still arrive date-only — that is an Eastern calendar day.
  if (DATE_ONLY.test(withT)) return normalizeMlsDate(withT);
  return `${withT}Z`;
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
