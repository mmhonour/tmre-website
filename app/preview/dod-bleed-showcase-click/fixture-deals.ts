import type { DealCarouselDealsByTown, DealCarouselPayload } from "@/lib/deal-of-the-day-carousel-types";
import { TMRE_TOWNS, type TmreTown } from "@/lib/tmre-towns";

const WEIGHTS = {
  age: 0.08,
  condition: 0.18,
  finishes: 0.22,
  ppsf: 0.22,
  layout: 0.1,
  schools: 0.1,
} as const;

const STREETS: Record<TmreTown, string> = {
  Norwalk: "27 Rowayton Woods Dr",
  "New Canaan": "18 Seminary St",
  Westport: "12 Main St",
  Wilton: "41 Ridgefield Rd",
  Weston: "8 Norfield Rd",
  Fairfield: "102 Unquowa Rd",
  Ridgefield: "15 Prospect St",
};

const SCORES: Record<TmreTown, number> = {
  Norwalk: 81.2,
  "New Canaan": 84.6,
  Westport: 77.3,
  Wilton: 79.1,
  Weston: 82.4,
  Fairfield: 74.8,
  Ridgefield: 80.0,
};

function fixtureDeal(town: TmreTown): DealCarouselPayload {
  const street = STREETS[town];
  const composite = SCORES[town];
  return {
    score: {
      age: 78,
      condition: 80,
      finishesQuality: 76,
      pricePerSqftFit: 82,
      layoutQuality: 74,
      schoolRating: 86,
      composite,
      weights: { ...WEIGHTS },
    },
    photoUrl: null,
    listing: {
      mlsId: `preview-dod-${town.toLowerCase().replace(/\s+/g, "-")}`,
      status: "Active",
      propertyType: "Single Family For Sale",
      style: "Colonial",
      address: {
        street,
        city: town,
        state: "CT",
        full: `${street}, ${town}, CT`,
      },
      price: 1_150_000,
      originalListPrice: 1_195_000,
      beds: 4,
      baths: 3,
      sqft: 2480,
      yearBuilt: 1998,
      dom: 12,
      photoCount: 18,
      schools: {
        elementary: null,
        middle: null,
        high: null,
        district: null,
      },
    },
    insight: `Its price-per-sqft sits right at the ${town} median ($465/sqft). The property doesn't say much about condition — a showing is the best way to tell. The generous set of photos indicates there are some opportunities here worth a closer look.`,
    totalReviewed: 48,
    qualifiedCount: 6,
    kind: "sale",
    pricePerSqft: 463,
    cityMedianPricePerSqft: 465,
    cityMedianPrice: 1_250_000,
    valueDiscountPct: 8,
    lotAcres: 0.42,
    pickMode: "below-median",
    superlatives: ["Value", "Layout"],
  };
}

/** Sale / homes fixture for every TMRE town — no listing database. */
export function dodBleedShowcaseFixtureDeals(): DealCarouselDealsByTown {
  const deals: DealCarouselDealsByTown = {};
  for (const town of TMRE_TOWNS) {
    deals[town] = fixtureDeal(town);
  }
  return deals;
}
