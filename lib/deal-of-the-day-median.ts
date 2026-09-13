import "server-only";

import {
  medianClosedInLookback,
  townClosedMedianKey,
} from "@/lib/closed-median-12mo";
import { readStatsCacheRow } from "@/lib/db/stats-cache-repo";
import { kindOf } from "@/lib/goldilocks";
import { fetchClosedListingsForCity } from "@/lib/listings-store";
import type { ListingKind } from "@/lib/listing-kind";
import { LISTING_KINDS } from "@/lib/listing-kind";
import type { Listing } from "@/lib/rets";
import {
  statsCacheKey,
  type MarketStatsPayload,
} from "@/lib/stats-compute";
import { resolveListingTownKey, type TmreTown } from "@/lib/tmre-towns";

async function closedMedianFromStatsCache(
  town: string,
  kind: ListingKind,
): Promise<number | null> {
  const row = await readStatsCacheRow(statsCacheKey("market-stats", town, kind));
  if (!row?.payload) return null;
  try {
    const payload = JSON.parse(row.payload) as MarketStatsPayload;
    const value = payload.medianPrice12Mo;
    return value != null && Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

async function closedMedianFromListings(
  town: string,
  kind: ListingKind,
): Promise<number | null> {
  const { listings } = await fetchClosedListingsForCity(town, 2500);
  return medianClosedInLookback(listings, kind).median;
}

/** Trailing-12-month closed median for one town × sale/rental. */
export async function readTownClosedMedian12Mo(
  town: string,
  kind: ListingKind,
): Promise<number | null> {
  const cached = await closedMedianFromStatsCache(town, kind);
  if (cached != null) return cached;
  return closedMedianFromListings(town, kind);
}

export async function loadTownClosedMedians12Mo(
  town: TmreTown,
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  await Promise.all(
    LISTING_KINDS.map(async (kind) => {
      const median = await readTownClosedMedian12Mo(town, kind);
      if (median != null) out.set(townClosedMedianKey(town, kind), median);
    }),
  );
  return out;
}

function listingTownName(listing: Listing): TmreTown | null {
  return resolveListingTownKey(listing.address.postalCode, listing.address.city);
}

/** Closed 12-month medians for every TMRE town present in the pool. */
export async function loadClosedMedians12MoForListings(
  listings: readonly Listing[],
): Promise<Map<string, number>> {
  const needed = new Set<string>();
  for (const listing of listings) {
    const town = listingTownName(listing);
    if (!town) continue;
    needed.add(`${town}::${kindOf(listing)}`);
  }

  const out = new Map<string, number>();
  await Promise.all(
    [...needed].map(async (token) => {
      const [town, kind] = token.split("::") as [string, ListingKind];
      const median = await readTownClosedMedian12Mo(town, kind);
      if (median != null) out.set(townClosedMedianKey(town, kind), median);
    }),
  );
  return out;
}
