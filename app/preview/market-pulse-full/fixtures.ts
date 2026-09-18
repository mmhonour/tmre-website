import type {
  MarketDigestCategorySlice,
  MarketDigestSnapshot,
} from "@/lib/market-digest-types";
import type { MarketPulseCombinedTownRow } from "@/lib/market-pulse-combined-rows";
import type { MarketPulseCategoryId } from "@/lib/market-pulse-shared";
import { DEFAULT_MARKET_PULSE_LOOKBACK_ID } from "@/lib/market-pulse-lookback";
import { TMRE_TOWNS } from "@/lib/tmre-towns";
import {
  buildMarketPulseWow,
  type MarketPulseCompareSet,
} from "@/lib/market-pulse-wow";
import type { MonthsSupplyPayload } from "@/lib/months-supply-types";
import type { StatsValueCalc } from "@/lib/stats-compute";

const generatedAt = "2026-09-14T16:00:00.000Z";

const LOOKBACK_CALC: StatsValueCalc = {
  summary: "Fixture closed lookback 12 mos.",
  inputs: { lookbackId: DEFAULT_MARKET_PULSE_LOOKBACK_ID },
};

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
  medianTax: number;
  averageTax: number;
};

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

function scaleTown(t: TownFixture, factor: number): TownFixture {
  const f = factor;
  return {
    ...t,
    activeCount: Math.max(1, Math.round(t.activeCount * f)),
    monthsSupply: Number((t.monthsSupply * (0.85 + f * 0.15)).toFixed(1)),
    closed: Math.max(1, Math.round(t.closed * f)),
    avgDaysOnMarket: Math.max(1, Math.round(t.avgDaysOnMarket * (2 - f))),
    medianPrice: Math.round(t.medianPrice * f),
    averagePrice: Math.round(t.averagePrice * f),
    priceDelta: Math.round(t.priceDelta * f),
    saleToAskDollars: Math.round(t.saleToAskDollars * f),
    medianTax: Math.round(t.medianTax * f),
    averageTax: Math.round(t.averageTax * f),
  };
}

function rollup(towns: readonly TownFixture[]): TownFixture {
  const n = towns.length || 1;
  return {
    city: "All",
    activeCount: towns.reduce((s, t) => s + t.activeCount, 0),
    monthsSupply: Number(
      (towns.reduce((s, t) => s + t.monthsSupply, 0) / n).toFixed(1),
    ),
    closed: towns.reduce((s, t) => s + t.closed, 0),
    avgDaysOnMarket: Math.round(
      towns.reduce((s, t) => s + t.avgDaysOnMarket, 0) / n,
    ),
    medianPrice: Math.round(towns.reduce((s, t) => s + t.medianPrice, 0) / n),
    averagePrice: Math.round(towns.reduce((s, t) => s + t.averagePrice, 0) / n),
    priceDelta: Math.round(towns.reduce((s, t) => s + t.priceDelta, 0) / n),
    saleToAskDollars: Math.round(
      towns.reduce((s, t) => s + t.saleToAskDollars, 0) / n,
    ),
    saleToAskPct: Number(
      (towns.reduce((s, t) => s + t.saleToAskPct, 0) / n).toFixed(1),
    ),
    medianTax: Math.round(towns.reduce((s, t) => s + t.medianTax, 0) / n),
    averageTax: Math.round(towns.reduce((s, t) => s + t.averageTax, 0) / n),
  };
}

/** All seven TMRE towns. Numbers are fixture-only. */
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
    medianTax: 9_100,
    averageTax: 9_800,
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
    medianTax: 22_400,
    averageTax: 24_100,
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
    medianTax: 18_800,
    averageTax: 20_400,
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
    medianTax: 15_900,
    averageTax: 16_700,
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
    medianTax: 16_200,
    averageTax: 17_400,
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
    medianTax: 11_400,
    averageTax: 12_200,
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
    medianTax: 14_600,
    averageTax: 15_500,
  },
];

if (TOWNS.length !== TMRE_TOWNS.length) {
  throw new Error("Market Pulse full preview must include every TMRE town");
}

const CATEGORY_SPECS: {
  id: MarketPulseCategoryId;
  label: string;
  scopeLabel: string;
  selectionLabel: string;
  factor: number;
}[] = [
  {
    id: "all",
    label: "ALL",
    scopeLabel: "sales",
    selectionLabel: "all sales",
    factor: 1,
  },
  {
    id: "sfr",
    label: "Single Family",
    scopeLabel: "single-family sales",
    selectionLabel: "Single Family",
    factor: 0.74,
  },
  {
    id: "condo",
    label: "Condo",
    scopeLabel: "condo sales",
    selectionLabel: "condos",
    factor: 0.22,
  },
  {
    id: "rentals",
    label: "Rentals",
    scopeLabel: "rentals",
    selectionLabel: "rentals",
    factor: 0.4,
  },
  {
    id: "commercial",
    label: "Commercial",
    scopeLabel: "commercial sales",
    selectionLabel: "commercial",
    factor: 0.12,
  },
];

function sliceFromTowns(
  spec: (typeof CATEGORY_SPECS)[number],
  towns: readonly TownFixture[],
): MarketDigestCategorySlice {
  const scaled = towns.map((t) => scaleTown(t, spec.factor));
  const all = rollup(scaled);
  const rows = [all, ...scaled];
  const market = mos(all.city, all.activeCount, all.monthsSupply);
  return {
    id: spec.id,
    label: spec.label,
    scopeLabel: spec.scopeLabel,
    selectionLabel: spec.selectionLabel,
    market,
    westport: scaled.find((t) => t.city === "Westport")
      ? mos(
          "Westport",
          scaled.find((t) => t.city === "Westport")!.activeCount,
          scaled.find((t) => t.city === "Westport")!.monthsSupply,
        )
      : null,
    towns: scaled.map((t) => mos(t.city, t.activeCount, t.monthsSupply)),
    closedTrailing: rows.map((t) => ({
      city: t.city,
      count: t.closed,
      calc: LOOKBACK_CALC,
    })),
    avgDomByTown: rows.map((t) => ({
      city: t.city,
      avgDaysOnMarket: t.avgDaysOnMarket,
    })),
    priceByTown: rows.map((t) => ({
      city: t.city,
      medianPrice: t.medianPrice,
      averagePrice: t.averagePrice,
      priceDelta: t.priceDelta,
      priceDeltaPct: t.medianPrice
        ? Number(((t.priceDelta / t.medianPrice) * 100).toFixed(1))
        : null,
      saleToAskPct: t.saleToAskPct,
      saleToAskDollars: t.saleToAskDollars,
    })),
    taxByTown: rows.map((t) => ({
      city: t.city,
      medianTax: t.medianTax,
      averageTax: t.averageTax,
      taxDelta: t.averageTax - t.medianTax,
      taxDeltaPct: t.medianTax
        ? Number((((t.averageTax - t.medianTax) / t.medianTax) * 100).toFixed(1))
        : null,
      taxYearLabel: "FY 2026",
    })),
    taxReady: true,
    taxYearLabel: "FY 2026",
    taxYearKind: "current",
    deal: null,
  };
}

function snapshotFromTowns(
  towns: readonly TownFixture[],
): MarketDigestSnapshot {
  const categories = CATEGORY_SPECS.map((spec) => sliceFromTowns(spec, towns));
  const all = categories[0];
  if (!all) throw new Error("Market Pulse full preview needs an ALL category");
  return {
    generatedAt,
    market: all.market,
    westport: all.westport,
    towns: all.towns,
    closedTrailing: all.closedTrailing,
    avgDomByTown: all.avgDomByTown,
    priceByTown: all.priceByTown,
    taxByTown: all.taxByTown,
    taxReady: true,
    taxYearLabel: "FY 2026",
    taxYearKind: "current",
    categories,
    dealOfTheWeek: null,
    socialProfiles: [],
  };
}

function combinedRows(towns: readonly TownFixture[]): MarketPulseCombinedTownRow[] {
  const all = rollup(towns);
  return [all, ...towns].map((t) => ({
    city: t.city,
    activeCount: t.activeCount,
    monthsSupply: t.monthsSupply,
    avgDaysOnMarket: t.avgDaysOnMarket,
    closedCount: t.closed,
    medianPrice: t.medianPrice,
    averagePrice: t.averagePrice,
    priceDelta: t.priceDelta,
    priceDeltaPct: t.medianPrice
      ? Number(((t.priceDelta / t.medianPrice) * 100).toFixed(1))
      : null,
    saleToAskPct: t.saleToAskPct,
    saleToAskDollars: t.saleToAskDollars,
    medianTax: t.medianTax,
    averageTax: t.averageTax,
    taxDelta: t.averageTax - t.medianTax,
    taxDeltaPct: t.medianTax
      ? Number((((t.averageTax - t.medianTax) / t.medianTax) * 100).toFixed(1))
      : null,
  }));
}

const PRIOR_WEEK = TOWNS.map((t) => scaleTown(t, 0.94));
const PRIOR_MONTH = TOWNS.map((t) => scaleTown(t, 0.88));
const PRIOR_YEAR = TOWNS.map((t) => scaleTown(t, 1.14));

export const MARKET_PULSE_FULL_SNAPSHOT = snapshotFromTowns(TOWNS);

export const MARKET_PULSE_FULL_COMPARES: MarketPulseCompareSet = {
  wow: buildMarketPulseWow(
    combinedRows(TOWNS),
    combinedRows(PRIOR_WEEK),
    "2026-09-07",
  ),
  mom: buildMarketPulseWow(
    combinedRows(TOWNS),
    combinedRows(PRIOR_MONTH),
    "2026-08-10",
  ),
  yoy: buildMarketPulseWow(
    combinedRows(TOWNS),
    combinedRows(PRIOR_YEAR),
    "2025-09-15",
  ),
};

export const MARKET_PULSE_FULL_ET_DATE = "Monday, September 14, 2026";
