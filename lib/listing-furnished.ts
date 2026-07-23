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
    normalizeFurnished(raw.IsFurnished)
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
