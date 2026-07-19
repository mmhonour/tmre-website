"use client";

import { useEffect, useState } from "react";
import {
  statsByMonthTitle,
  statsClosedLabel,
  statsVolumeNoun,
} from "./stats-labels";
import StatsMonthComparisonChart from "./StatsMonthComparisonChart";
import type { StatsCity, StatsKind } from "./stats-towns";

type MonthlyCount = { year: number; month: number; count: number };

type PropertyClass = "all" | "homes" | "multi" | "condos";

type CachedMonthsSupply = {
  monthsSupply: number | null;
  avgMonthlyClosings: number | null;
  activeCount: number;
};

const CURRENT_YEAR = new Date().getFullYear();
const TREND_YEARS = [CURRENT_YEAR - 2, CURRENT_YEAR - 1, CURRENT_YEAR] as const;

function trailingAvg(data: MonthlyCount[]): number | null {
  const now = new Date();
  const counts: number[] = [];
  for (let offset = 1; offset <= 3; offset++) {
    const d = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const entry = data.find((e) => e.year === d.getFullYear() && e.month === d.getMonth() + 1);
    if (entry) counts.push(entry.count);
  }
  if (!counts.length) return null;
  return counts.reduce((a, b) => a + b, 0) / counts.length;
}

export default function SalesTrendChart({
  city,
  kind,
  headerActiveCount,
  propertyClass = "all",
}: {
  city: StatsCity;
  kind: StatsKind;
  headerActiveCount?: number | null;
  /** Precomputed months-supply slice; defaults to All types. */
  propertyClass?: PropertyClass;
}) {
  const cityLabel = city === "All" ? "All Towns" : `${city}, CT`;
  const [cached, setCached] = useState<CachedMonthsSupply | null>(null);

  useEffect(() => {
    let cancelled = false;
    setCached(null);
    const params = new URLSearchParams({
      city,
      kind,
      property: propertyClass,
    });
    void fetch(`/api/months-supply?${params}`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) return null;
        return (await res.json()) as CachedMonthsSupply;
      })
      .then((body) => {
        if (cancelled || !body) return;
        setCached({
          monthsSupply: body.monthsSupply ?? null,
          avgMonthlyClosings: body.avgMonthlyClosings ?? null,
          activeCount: body.activeCount ?? 0,
        });
      })
      .catch(() => {
        /* fall back to chart-derived ratio */
      });
    return () => {
      cancelled = true;
    };
  }, [city, kind, propertyClass]);

  return (
    <StatsMonthComparisonChart
      city={city}
      kind={kind}
      apiPath="/api/sales-by-month"
      title={statsByMonthTitle(kind)}
      volumeNoun={statsVolumeNoun(kind)}
      compareYears={TREND_YEARS}
      defaultCompareYears={TREND_YEARS}
      yearSelectionEnabled={false}
      timelineModeEnabled
      headerActiveCount={headerActiveCount}
      footerNote={`${statsClosedLabel(kind)} · ${cityLabel} · ${CURRENT_YEAR} partial year`}
      headerMetric={({ activeCount, data }) => {
        // Prefer precomputed cache for the town × occupancy × property slice.
        // If header active count differs (extra filters), refine numerator only.
        const cachedAvg = cached?.avgMonthlyClosings ?? null;
        const chartAvg = trailingAvg(data);
        const avgClosings = cachedAvg ?? chartAvg;
        const numerator =
          activeCount != null && activeCount > 0
            ? activeCount
            : (cached?.activeCount ?? null);
        const monthsSupply =
          cached != null &&
          propertyClass === "all" &&
          (activeCount == null || activeCount === cached.activeCount)
            ? cached.monthsSupply
            : numerator != null && avgClosings && avgClosings > 0
              ? numerator / avgClosings
              : null;
        const supplyColor =
          monthsSupply == null
            ? "text-white/40"
            : monthsSupply <= 2
              ? "text-coral"
              : monthsSupply <= 4
                ? "text-gold"
                : "text-sage";
        const supplyLabel =
          monthsSupply == null
            ? null
            : monthsSupply <= 2
              ? "Seller's market"
              : monthsSupply <= 4
                ? "Balanced"
                : "Buyer's market";

        return (
          <div className="text-right">
            <p className="font-mono text-[9px] tracking-[0.2em] uppercase text-white/30 mb-0.5">
              {kind === "rental" ? "Months of supply" : "Months supply"}
            </p>
            <p
              className={`font-mono text-2xl tabular-nums font-medium leading-none ${supplyColor}`}
            >
              {monthsSupply != null ? monthsSupply.toFixed(1) : "—"}
            </p>
            {supplyLabel ? (
              <p className={`font-mono text-[9px] tracking-wide mt-0.5 ${supplyColor}`}>
                {supplyLabel}
              </p>
            ) : null}
          </div>
        );
      }}
    />
  );
}
