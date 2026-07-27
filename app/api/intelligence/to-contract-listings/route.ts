import { NextRequest, NextResponse } from "next/server";
import { isUnderContractStatus } from "@/lib/listing-status";
import {
  ACTIVE_LISTINGS_FETCH_LIMIT,
  fetchActiveListingsForCity,
  listingCacheHeaders,
} from "@/lib/listings-store";
import {
  CLOSED_THIS_WEEK_DAYS,
  isClosedWithinDays,
} from "@/lib/stats-compute";
import { formatTownList, isTmreTown, TMRE_TOWNS } from "@/lib/tmre-towns";
import type { Listing } from "@/lib/rets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function mapToContractListing(l: Listing) {
  const pricePerSqft =
    l.price != null && l.sqft != null && l.sqft > 0 ? l.price / l.sqft : null;

  return {
    mlsId: l.mlsId,
    listingKey: l.listingKey,
    status: l.status,
    propertyType: l.propertyType,
    address: l.address,
    price: l.price,
    closeDate: l.statusChangeTimestamp,
    beds: l.beds,
    baths: l.baths,
    sqft: l.sqft,
    yearBuilt: l.yearBuilt,
    calculated: {
      pricePerSqft,
      daysOnMarket: l.dom,
      priceReductionPercent: null,
      goldilocksScore: null,
    },
  };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const city = (searchParams.get("city") ?? "").trim();
  const limitRaw = Number(searchParams.get("limit") ?? "250");
  const limit = Number.isFinite(limitRaw)
    ? Math.min(Math.max(limitRaw, 1), 500)
    : 250;

  if (!city) {
    return NextResponse.json(
      { error: "city is required (e.g. ?city=Norwalk)" },
      { status: 400 },
    );
  }
  if (!isTmreTown(city)) {
    return NextResponse.json(
      {
        error: `Unsupported city '${city}'. Supported: ${formatTownList(TMRE_TOWNS)}`,
      },
      { status: 400 },
    );
  }

  try {
    // Pull the full Active-bucket pool so under-contract rows aren't truncated
    // before the this-week filter (same source as the Town Stats count).
    const { listings: raw, source } = await fetchActiveListingsForCity(
      city,
      ACTIVE_LISTINGS_FETCH_LIMIT,
    );
    const listings = raw
      .filter((l) => {
        if (!isUnderContractStatus(l.status)) return false;
        return isClosedWithinDays(
          l.statusChangeTimestamp,
          CLOSED_THIS_WEEK_DAYS,
        );
      })
      .map(mapToContractListing)
      .filter((l) => l.price != null && l.price > 0)
      .sort((a, b) => {
        const aMs = a.closeDate ? Date.parse(a.closeDate) : 0;
        const bMs = b.closeDate ? Date.parse(b.closeDate) : 0;
        return bMs - aMs;
      })
      .slice(0, limit);

    return NextResponse.json(
      {
        city,
        count: listings.length,
        source,
        listings,
      },
      { headers: listingCacheHeaders(source) },
    );
  } catch (err) {
    console.error("[/api/intelligence/to-contract-listings] error", err);
    return NextResponse.json(
      { error: "Failed to fetch to-contract listings" },
      { status: 502 },
    );
  }
}
