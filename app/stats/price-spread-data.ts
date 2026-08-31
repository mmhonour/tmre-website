"use client";

import type { StatsValueCalc } from "@/lib/stats-compute";
import { TOWN_LIST, type StatsKind, type Town } from "./stats-towns";

export type PriceSpreadRow = {
  town: Town;
  medianPrice: number;
  averagePrice: number;
  /** Average minus median, read from the cache rather than subtracted here. */
  priceDelta: number;
  priceDeltaPct: number | null;
  medianCalc?: StatsValueCalc;
  averageCalc?: StatsValueCalc;
  deltaCalc?: StatsValueCalc;
};

type MarketStatsSlice = {
  medianPrice?: number | null;
  averagePrice?: number | null;
  priceDelta?: number | null;
  priceDeltaPct?: number | null;
  medianPriceCalc?: StatsValueCalc;
  averagePriceCalc?: StatsValueCalc;
  priceDeltaCalc?: StatsValueCalc;
};

function finite(n: number | null | undefined): number | null {
  return n != null && Number.isFinite(n) ? n : null;
}

/**
 * Median, average and the gap between them per town, straight from the cached
 * `market-stats` rows. Nothing here is derived — the delta is read, not
 * subtracted, so this chart cannot disagree with Market Pulse or the digest.
 */
export async function fetchPriceSpreadRows(
  kind: StatsKind,
): Promise<PriceSpreadRow[]> {
  const rows = await Promise.all(
    TOWN_LIST.map(async (town): Promise<PriceSpreadRow | null> => {
      const payload = await fetch(
        `/api/market-stats?city=${encodeURIComponent(town)}&kind=${kind}`,
        { cache: "no-store" },
      )
        .then((r) => (r.ok ? (r.json() as Promise<MarketStatsSlice>) : null))
        .catch(() => null);
      const medianPrice = finite(payload?.medianPrice);
      const averagePrice = finite(payload?.averagePrice);
      const priceDelta = finite(payload?.priceDelta);
      if (medianPrice == null || averagePrice == null || priceDelta == null) {
        return null;
      }
      return {
        town,
        medianPrice,
        averagePrice,
        priceDelta,
        priceDeltaPct: finite(payload?.priceDeltaPct),
        medianCalc: payload?.medianPriceCalc,
        averageCalc: payload?.averagePriceCalc,
        deltaCalc: payload?.priceDeltaCalc,
      };
    }),
  );
  return rows
    .filter((r): r is PriceSpreadRow => r != null)
    .sort((a, b) => a.medianPrice - b.medianPrice);
}

/** `$1.25M` / `$850K`, matching the money shorthand used across Market Pulse. */
export function formatSpreadMoney(dollars: number | null): string {
  if (dollars == null) return "—";
  const sign = dollars < 0 ? "−" : "";
  const abs = Math.abs(dollars);
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${Math.round(abs / 1_000)}K`;
  return `${sign}$${Math.round(abs)}`;
}

/** `+29.7%` against the median. */
export function formatSpreadPct(pct: number | null): string {
  if (pct == null) return "—";
  const sign = pct > 0 ? "+" : pct < 0 ? "−" : "";
  return `${sign}${Math.abs(pct).toFixed(1)}%`;
}
