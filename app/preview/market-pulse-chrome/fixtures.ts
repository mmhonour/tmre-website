import type { MarketDigestSnapshot } from "@/lib/market-digest-types";
import type { MonthsSupplyPayload } from "@/lib/months-supply-types";

const generatedAt = "2026-09-17T16:00:00.000Z";

function mos(
  city: string,
  activeCount: number,
  monthsSupply: number,
): MonthsSupplyPayload {
  return {
    city,
    kind: "sale",
    propertyClass: "all",
    activeCount,
    avgMonthlyClosings: monthsSupply > 0 ? activeCount / monthsSupply : null,
    monthsSupply,
    generatedAt,
  };
}

const market = mos("All", 184, 2.8);
const westport = mos("Westport", 48, 1.8);
const norwalk = mos("Norwalk", 62, 3.4);
const newCanaan = mos("New Canaan", 31, 2.1);
const fairfield = mos("Fairfield", 43, 3.9);

/** Fixture snapshot so the chrome preview does not need Neon. */
export const MARKET_PULSE_CHROME_SNAPSHOT: MarketDigestSnapshot = {
  generatedAt,
  market,
  westport,
  towns: [westport, norwalk, newCanaan, fairfield],
  closedTrailing: [
    { city: "All", count: 421 },
    { city: "Westport", count: 90 },
    { city: "Norwalk", count: 140 },
    { city: "New Canaan", count: 72 },
    { city: "Fairfield", count: 119 },
  ],
  avgDomByTown: [
    { city: "All", avgDaysOnMarket: 19 },
    { city: "Westport", avgDaysOnMarket: 18 },
    { city: "Norwalk", avgDaysOnMarket: 24 },
    { city: "New Canaan", avgDaysOnMarket: 16 },
    { city: "Fairfield", avgDaysOnMarket: 28 },
  ],
  priceByTown: [
    {
      city: "All",
      medianPrice: 1_225_000,
      averagePrice: 1_310_000,
      priceDelta: 85_000,
      saleToAskDollars: -8_000,
      saleToAskPct: 97.4,
    },
    {
      city: "Westport",
      medianPrice: 2_000_000,
      averagePrice: 2_150_000,
      priceDelta: 150_000,
      saleToAskDollars: 18_000,
      saleToAskPct: 101.2,
    },
    {
      city: "Norwalk",
      medianPrice: 650_000,
      averagePrice: 720_000,
      priceDelta: 70_000,
      saleToAskDollars: -22_000,
      saleToAskPct: 96.1,
    },
    {
      city: "New Canaan",
      medianPrice: 2_200_000,
      averagePrice: 2_400_000,
      priceDelta: 200_000,
      saleToAskDollars: 12_000,
      saleToAskPct: 100.4,
    },
    {
      city: "Fairfield",
      medianPrice: 947_000,
      averagePrice: 1_120_000,
      priceDelta: 173_000,
      saleToAskDollars: -15_000,
      saleToAskPct: 97.8,
    },
  ],
  taxByTown: [],
  taxReady: false,
  categories: [],
  dealOfTheWeek: null,
  socialProfiles: [],
};
