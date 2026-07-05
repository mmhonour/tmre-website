import { NextRequest, NextResponse } from "next/server";
import { closeFieldsFromListing } from "@/lib/listing-history";
import { fetchClosedListingsForCity, listingCacheHeaders } from "@/lib/listings-store";
import {
  CLOSED_THIS_WEEK_DAYS,
  isClosedWithinDays,
} from "@/lib/stats-compute";
import { formatTownList, isTmreTown, TMRE_TOWNS } from "@/lib/tmre-towns";
import type { Listing } from "@/lib/rets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function mapClosedListing(l: Listing) {
  const { closeDate, closePrice } = closeFieldsFromListing(l);
  const displayPrice = closePrice ?? l.price;
  const pricePerSqft =
    displayPrice != null && l.sqft != null && l.sqft > 0
      ? displayPrice / l.sqft
      : null;

  return {
    mlsId: l.mlsId,
    listingKey: l.listingKey,
    status: l.status,
    propertyType: l.propertyType,
    address: l.address,
    price: displayPrice,
    closePrice,
    closeDate,
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
    const { listings: raw, source } = await fetchClosedListingsForCity(city, limit);
    const listings = raw
      .filter((l) => {
        const { closeDate } = closeFieldsFromListing(l);
        return isClosedWithinDays(closeDate, CLOSED_THIS_WEEK_DAYS);
      })
      .map(mapClosedListing)
      .filter((l) => l.price != null && l.price > 0)
      .sort((a, b) => {
        const aMs = a.closeDate ? Date.parse(a.closeDate) : 0;
        const bMs = b.closeDate ? Date.parse(b.closeDate) : 0;
        return bMs - aMs;
      });

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
    console.error("[/api/intelligence/closed-listings] error", err);
    return NextResponse.json(
      { error: "Failed to fetch closed listings" },
      { status: 502 },
    );
  }
}
