import { closeFieldsFromListing } from "@/lib/listing-history";
import { isRentalListing, type ListingKind } from "@/lib/listing-kind";
import { withinLookbackMonths } from "@/lib/listing-comparables-shared";

/** Industry-standard sold/leased window for a town median. */
export const CLOSED_MEDIAN_LOOKBACK_MONTHS = 12;

export type ClosedMedianListing = {
  status?: string | null;
  price?: number | null;
  propertyType: string;
  raw?: Record<string, string> | null;
  statusChangeTimestamp?: string | null;
};

function closeSource(listing: ClosedMedianListing) {
  return {
    status: listing.status ?? "",
    price: listing.price ?? null,
    statusChangeTimestamp: listing.statusChangeTimestamp,
    raw: listing.raw ?? undefined,
  };
}

function closedKindPrice(listing: ClosedMedianListing): number | null {
  const { closePrice } = closeFieldsFromListing(closeSource(listing));
  const price = closePrice ?? listing.price ?? null;
  return price != null && price > 0 ? price : null;
}

function median(nums: number[]): number | null {
  if (!nums.length) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/**
 * Trailing-12-month closed prices for one town × sale/rental.
 * Asks are ignored — only a close (or closed-status fallback price) counts.
 */
export function medianClosedInLookback(
  listings: readonly ClosedMedianListing[],
  kind: ListingKind,
  nowMs: number = Date.now(),
  months: number = CLOSED_MEDIAN_LOOKBACK_MONTHS,
): { median: number | null; count: number; prices: number[] } {
  const prices: number[] = [];
  for (const listing of listings) {
    const isRental = isRentalListing({
      propertyType: listing.propertyType,
      raw: listing.raw ?? undefined,
    });
    if (kind === "rental" ? !isRental : isRental) continue;
    const { closeDate } = closeFieldsFromListing(closeSource(listing));
    if (!withinLookbackMonths(closeDate, months, nowMs)) continue;
    const price = closedKindPrice(listing);
    if (price == null) continue;
    prices.push(price);
  }
  return { median: median(prices), count: prices.length, prices };
}

export function townClosedMedianKey(
  town: string,
  kind: ListingKind,
): string {
  return `${town.trim().toLowerCase()}::${kind}`;
}
