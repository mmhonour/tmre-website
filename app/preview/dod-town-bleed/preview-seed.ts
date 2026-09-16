import { loadDealOfTheDayFssrSeed } from "@/lib/deal-of-the-day-fssr";
import type {
  DealCarouselDealsByTown,
  DealPropertyClassFilter,
} from "@/lib/deal-of-the-day-carousel-types";
import { TMRE_TOWNS } from "@/lib/tmre-towns";
import { dodTownBleedFixtureDeals } from "@/app/preview/dod-town-bleed/fixture-deals";

export type DodTownBleedPreviewSeed = {
  dealsByTown: DealCarouselDealsByTown;
  kind: "sale" | "rental";
  propertyClass: DealPropertyClassFilter;
  source: "live" | "fixture";
};

function liveDealCount(deals: DealCarouselDealsByTown): number {
  return TMRE_TOWNS.filter((town) => {
    const deal = deals[town];
    return Boolean(deal?.listing?.mlsId && deal.listing.mlsId !== "—");
  }).length;
}

/**
 * Full DoD preview seed. Prefer this week's cache so listing photos and
 * showcase links are real; fall back to fixture towns when the cache is empty.
 */
export async function loadDodTownBleedPreviewSeed(): Promise<DodTownBleedPreviewSeed> {
  const live = await loadDealOfTheDayFssrSeed("sale", "homes");
  if (live && liveDealCount(live.dealsByTown) > 0) {
    return {
      dealsByTown: live.dealsByTown,
      kind: live.kind,
      propertyClass: live.propertyClass,
      source: "live",
    };
  }
  return {
    dealsByTown: dodTownBleedFixtureDeals(),
    kind: "sale",
    propertyClass: "homes",
    source: "fixture",
  };
}
