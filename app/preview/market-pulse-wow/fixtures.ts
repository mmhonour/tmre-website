import type { MarketPulseCombinedTownRow } from "@/lib/market-pulse-combined-rows";

function row(
  city: string,
  partial: Partial<MarketPulseCombinedTownRow>,
): MarketPulseCombinedTownRow {
  return {
    city,
    activeCount: null,
    monthsSupply: null,
    avgDaysOnMarket: null,
    closedCount: null,
    medianPrice: null,
    averagePrice: null,
    priceDelta: null,
    priceDeltaPct: null,
    saleToAskPct: null,
    saleToAskDollars: null,
    medianTax: null,
    averageTax: null,
    taxDelta: null,
    taxDeltaPct: null,
    ...partial,
  };
}

/** Last Monday's archived stacked defaults. */
export const MARKET_PULSE_WOW_PRIOR_ROWS: MarketPulseCombinedTownRow[] = [
  row("All", {
    activeCount: 172,
    monthsSupply: 2.4,
    avgDaysOnMarket: 21,
    closedCount: 410,
    medianPrice: 1_200_000,
    averagePrice: 1_285_000,
    priceDelta: 85_000,
    priceDeltaPct: 7.1,
    saleToAskPct: 97.2,
    saleToAskDollars: -12_000,
  }),
  row("Westport", {
    activeCount: 48,
    monthsSupply: 1.8,
    avgDaysOnMarket: 18,
    closedCount: 90,
    medianPrice: 2_000_000,
    averagePrice: 2_150_000,
    priceDelta: 150_000,
    priceDeltaPct: 7.5,
    saleToAskPct: 98.1,
    saleToAskDollars: -8_000,
  }),
];

/** ~28 days earlier — MoM option appears once this slot exists. */
export const MARKET_PULSE_MOM_PRIOR_ROWS: MarketPulseCombinedTownRow[] = [
  row("All", {
    activeCount: 160,
    monthsSupply: 2.1,
    avgDaysOnMarket: 24,
    closedCount: 390,
    medianPrice: 1_150_000,
    averagePrice: 1_220_000,
    priceDelta: 70_000,
    priceDeltaPct: 6.1,
    saleToAskPct: 96.4,
    saleToAskDollars: -18_000,
  }),
  row("Westport", {
    activeCount: 55,
    monthsSupply: 2.2,
    avgDaysOnMarket: 22,
    closedCount: 84,
    medianPrice: 1_920_000,
    averagePrice: 2_050_000,
    priceDelta: 180_000,
    priceDeltaPct: 9.4,
    saleToAskPct: 97.0,
    saleToAskDollars: -20_000,
  }),
];

/** This week's live / send snapshot. */
export const MARKET_PULSE_WOW_CURRENT_ROWS: MarketPulseCombinedTownRow[] = [
  row("All", {
    activeCount: 184,
    monthsSupply: 2.8,
    avgDaysOnMarket: 19,
    closedCount: 421,
    medianPrice: 1_225_000,
    averagePrice: 1_310_000,
    priceDelta: 85_000,
    priceDeltaPct: 6.9,
    saleToAskPct: 97.8,
    saleToAskDollars: -8_000,
  }),
  row("Westport", {
    activeCount: 42,
    monthsSupply: 1.8,
    avgDaysOnMarket: 18,
    closedCount: 92,
    medianPrice: 2_050_000,
    averagePrice: 2_180_000,
    priceDelta: 130_000,
    priceDeltaPct: 6.3,
    saleToAskPct: 97.4,
    saleToAskDollars: -11_000,
  }),
];

export const MARKET_PULSE_WOW_PRIOR_SLOT = "2026-09-07";
export const MARKET_PULSE_MOM_PRIOR_SLOT = "2026-08-10";
