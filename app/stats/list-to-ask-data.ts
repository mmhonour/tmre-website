"use client";

import type { StatsValueCalc } from "@/lib/stats-compute";
import { TOWN_LIST, type StatsKind, type Town } from "./stats-towns";

export type ListToAskRow = {
  town: Town;
  /** Σ close ÷ Σ original ask, as a percent. 100 = closed at the first ask. */
  pct: number;
  /** Percentage points above (positive) or below (negative) the first ask. */
  vsAsk: number;
  /** Mean dollar gap against the first ask on the same pool. */
  dollars: number | null;
  /** Closings behind the ratio. */
  count: number;
  calc?: StatsValueCalc;
};

type MarketStatsSlice = {
  saleToAskPct?: number | null;
  saleToAskDollars?: number | null;
  saleToAskCount?: number | null;
  saleToAskCalc?: StatsValueCalc;
};

/**
 * One current ratio per town, from the same `market-stats` cache rows Market
 * Pulse reads. There is no month-by-month history for this metric, so the
 * chart compares towns rather than plotting a trend.
 */
export async function fetchListToAskRows(
  kind: StatsKind,
): Promise<ListToAskRow[]> {
  const rows = await Promise.all(
    TOWN_LIST.map(async (town): Promise<ListToAskRow | null> => {
      const payload = await fetch(
        `/api/market-stats?city=${encodeURIComponent(town)}&kind=${kind}`,
        { cache: "no-store" },
      )
        .then((r) => (r.ok ? (r.json() as Promise<MarketStatsSlice>) : null))
        .catch(() => null);
      const pct = payload?.saleToAskPct;
      if (pct == null || !Number.isFinite(pct)) return null;
      return {
        town,
        pct,
        vsAsk: pct - 100,
        dollars:
          payload?.saleToAskDollars != null &&
          Number.isFinite(payload.saleToAskDollars)
            ? payload.saleToAskDollars
            : null,
        count: payload?.saleToAskCount ?? 0,
        calc: payload?.saleToAskCalc,
      };
    }),
  );
  return rows
    .filter((r): r is ListToAskRow => r != null)
    .sort((a, b) => a.vsAsk - b.vsAsk);
}

/** `+2.6%` / `−1.1%` against the first ask. */
export function formatVsAsk(vsAsk: number): string {
  const sign = vsAsk > 0 ? "+" : vsAsk < 0 ? "−" : "";
  return `${sign}${Math.abs(vsAsk).toFixed(1)}%`;
}

/** `+$19K` / `−$19K`, the mean gap per closing. */
export function formatAskGap(dollars: number | null): string {
  if (dollars == null) return "—";
  const sign = dollars > 0 ? "+" : dollars < 0 ? "−" : "";
  const abs = Math.abs(dollars);
  if (abs >= 1000) return `${sign}$${Math.round(abs / 1000)}K`;
  return `${sign}$${Math.round(abs)}`;
}
