import type { MarketDigestSnapshot } from "@/lib/market-digest-types";
import type { MonthsSupplyPayload } from "@/lib/months-supply-types";
import { TMRE_TOWNS } from "@/lib/tmre-towns";

const generatedAt = "2026-09-17T16:00:00.000Z";

type TownFixture = {
  city: string;
  activeCount: number;
  monthsSupply: number;
  closed: number;
  avgDaysOnMarket: number;
  medianPrice: number;
  averagePrice: number;
  priceDelta: number;
  saleToAskDollars: number;
  saleToAskPct: number;
};

function mos(city: string, activeCount: number, monthsSupply: number): MonthsSupplyPayload {
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

/**
 * All seven TMRE towns plus the All rollup. Numbers are fixture-only so heat
 * markers spread seller → buyer; they are not live cache.
 */
const TOWNS: readonly TownFixture[] = [
  {
    city: "Norwalk",
    activeCount: 62,
    monthsSupply: 3.4,
    closed: 140,
    avgDaysOnMarket: 24,
    medianPrice: 650_000,
    averagePrice: 720_000,
    priceDelta: 70_000,
    saleToAskDollars: -22_000,
    saleToAskPct: 96.1,
  },
  {
    city: "New Canaan",
    activeCount: 31,
    monthsSupply: 2.1,
    closed: 72,
    avgDaysOnMarket: 16,
    medianPrice: 2_200_000,
    averagePrice: 2_400_000,
    priceDelta: 200_000,
    saleToAskDollars: 12_000,
    saleToAskPct: 100.4,
  },
  {
    city: "Westport",
    activeCount: 48,
    monthsSupply: 1.8,
    closed: 90,
    avgDaysOnMarket: 18,
    medianPrice: 2_000_000,
    averagePrice: 2_150_000,
    priceDelta: 150_000,
    saleToAskDollars: 18_000,
    saleToAskPct: 101.2,
  },
  {
    city: "Wilton",
    activeCount: 28,
    monthsSupply: 2.4,
    closed: 68,
    avgDaysOnMarket: 21,
    medianPrice: 1_350_000,
    averagePrice: 1_480_000,
    priceDelta: 130_000,
    saleToAskDollars: -8_000,
    saleToAskPct: 98.5,
  },
  {
    city: "Weston",
    activeCount: 18,
    monthsSupply: 4.2,
    closed: 41,
    avgDaysOnMarket: 32,
    medianPrice: 1_550_000,
    averagePrice: 1_720_000,
    priceDelta: 170_000,
    saleToAskDollars: -24_000,
    saleToAskPct: 96.8,
  },
  {
    city: "Fairfield",
    activeCount: 43,
    monthsSupply: 3.9,
    closed: 119,
    avgDaysOnMarket: 28,
    medianPrice: 947_000,
    averagePrice: 1_120_000,
    priceDelta: 173_000,
    saleToAskDollars: -15_000,
    saleToAskPct: 97.8,
  },
  {
    city: "Ridgefield",
    activeCount: 29,
    monthsSupply: 2.6,
    closed: 82,
    avgDaysOnMarket: 22,
    medianPrice: 1_180_000,
    averagePrice: 1_290_000,
    priceDelta: 110_000,
    saleToAskDollars: -4_000,
    saleToAskPct: 99.1,
  },
];

if (TOWNS.length !== TMRE_TOWNS.length) {
  throw new Error("Market Pulse chrome preview must include every TMRE town");
}

const all: TownFixture = {
  city: "All",
  activeCount: TOWNS.reduce((n, t) => n + t.activeCount, 0),
  monthsSupply: 2.9,
  closed: TOWNS.reduce((n, t) => n + t.closed, 0),
  avgDaysOnMarket: 20,
  medianPrice: 1_150_000,
  averagePrice: 1_280_000,
  priceDelta: 130_000,
  saleToAskDollars: -6_000,
  saleToAskPct: 97.8,
};

const westport = mos("Westport", 48, 1.8);

/** Fixture snapshot so the chrome preview does not need Neon. */
export const MARKET_PULSE_CHROME_SNAPSHOT: MarketDigestSnapshot = {
  generatedAt,
  market: mos(all.city, all.activeCount, all.monthsSupply),
  westport,
  towns: TOWNS.map((t) => mos(t.city, t.activeCount, t.monthsSupply)),
  closedTrailing: [all, ...TOWNS].map((t) => ({ city: t.city, count: t.closed })),
  avgDomByTown: [all, ...TOWNS].map((t) => ({
    city: t.city,
    avgDaysOnMarket: t.avgDaysOnMarket,
  })),
  priceByTown: [all, ...TOWNS].map((t) => ({
    city: t.city,
    medianPrice: t.medianPrice,
    averagePrice: t.averagePrice,
    priceDelta: t.priceDelta,
    saleToAskDollars: t.saleToAskDollars,
    saleToAskPct: t.saleToAskPct,
  })),
  taxByTown: [],
  taxReady: false,
  categories: [],
  dealOfTheWeek: null,
  socialProfiles: [],
};
