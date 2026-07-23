/** RESO / SmartMLS Furnished lookup values used for rental inventory. */
export const LISTING_FURNISHED_VALUES = [
  "Furnished",
  "Unfurnished",
  "Partially",
  "Negotiable",
] as const;

export type ListingFurnished = (typeof LISTING_FURNISHED_VALUES)[number];

const FURNISHED_BY_LOWER = new Map(
  LISTING_FURNISHED_VALUES.map((v) => [v.toLowerCase(), v] as const),
);

/**
 * SmartMLS encodes furnished vs unfurnished in RentalDuration lookup values
 * (there is no separate Furnished Property field). Codes / labels below are
 * from Property metadata LookupName=RentalDuration.
 */
const RENTAL_DURATION_FURNISHED_CODES = new Set([
  "ACAF",
  "FLEXF",
  "MONTHF",
  "SHORTF",
  "SUMFUR",
  "WINFUR",
  "YEARFUR",
]);

const RENTAL_DURATION_UNFURNISHED_CODES = new Set([
  "ACA",
  "FLEX",
  "MONTH",
  "SHORT",
  "SUMUN",
  "WINUN",
  "YEARUN",
]);

/**
 * Normalize MLS Furnished (and common aliases) to the RESO enum.
 * Returns null when missing or unrecognized.
 */
export function normalizeFurnished(value: unknown): ListingFurnished | null {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  const exact = FURNISHED_BY_LOWER.get(raw.toLowerCase());
  if (exact) return exact;

  const compact = raw.toLowerCase().replace(/[^a-z]/g, "");
  if (
    compact === "furnished" ||
    compact === "yes" ||
    compact === "y" ||
    compact === "true"
  ) {
    return "Furnished";
  }
  if (
    compact === "unfurnished" ||
    compact === "no" ||
    compact === "n" ||
    compact === "false"
  ) {
    return "Unfurnished";
  }
  if (
    compact === "partial" ||
    compact === "partially" ||
    compact === "partiallyfurnished" ||
    compact === "partfurnished"
  ) {
    return "Partially";
  }
  if (compact === "negotiable" || compact === "nego") {
    return "Negotiable";
  }
  return null;
}

/**
 * Derive Furnished from SmartMLS RentalDuration (multi-select codes or labels).
 * Both furnished + unfurnished options → Negotiable.
 */
export function parseFurnishedFromRentalDuration(
  value: unknown,
): ListingFurnished | null {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  const tokens = raw
    .split(/[,;|]/)
    .map((t) => t.trim())
    .filter(Boolean);
  if (tokens.length === 0) return null;

  let hasFurnished = false;
  let hasUnfurnished = false;

  for (const token of tokens) {
    const upper = token.toUpperCase().replace(/\s+/g, "");
    // Check Unfurnished first — "Unfurnished" must not count as Furnished.
    if (
      RENTAL_DURATION_UNFURNISHED_CODES.has(upper) ||
      /\bunfurnished\b/i.test(token)
    ) {
      hasUnfurnished = true;
      continue;
    }
    if (
      RENTAL_DURATION_FURNISHED_CODES.has(upper) ||
      /\bfurnished\b/i.test(token)
    ) {
      hasFurnished = true;
    }
  }

  if (hasFurnished && hasUnfurnished) return "Negotiable";
  if (hasFurnished) return "Furnished";
  if (hasUnfurnished) return "Unfurnished";
  return null;
}

/** Parse Furnished from raw RETS Property fields. */
export function parseFurnishedFromRaw(
  raw?: Record<string, string> | null,
): ListingFurnished | null {
  if (!raw) return null;
  return (
    normalizeFurnished(raw.Furnished) ??
    normalizeFurnished(raw.FurnishedYN) ??
    normalizeFurnished(raw.Furnishings) ??
    normalizeFurnished(raw.Furnishing) ??
    normalizeFurnished(raw.IsFurnished) ??
    parseFurnishedFromRentalDuration(raw.RentalDuration)
  );
}

type ListingWithFurnished = {
  furnished?: ListingFurnished | null;
  raw?: Record<string, string> | null;
};

/** Prefer normalized Listing.furnished; fall back to raw RETS for older cache rows. */
export function listingFurnished(
  listing: ListingWithFurnished,
): ListingFurnished | null {
  return (
    normalizeFurnished(listing.furnished) ??
    parseFurnishedFromRaw(listing.raw ?? undefined)
  );
}
