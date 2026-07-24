"use client";

import { loadTabJson } from "@/lib/tab-data-prefetch";
import { useEffect, useState } from "react";
import { statsMonthsSupplyByMonthTitle } from "./stats-labels";
import StatsMonthComparisonChart from "./StatsMonthComparisonChart";
import type { StatsCity, StatsKind } from "./stats-towns";

type MonthlyCount = { year: number; month: number; count: number };

type CachedMonthsSupply = {
  monthsSupply: number | null;
};

const COMPARE_YEARS = [2025, 2026] as const;

function formatMonths(n: number): string {
  return n.toFixed(1);
}

export default function MonthsSupplyByMonthChart({
  city,
  kind,
  headerActiveCount,
}: {
  city: StatsCity;
  kind: StatsKind;
  headerActiveCount?: number | null;
}) {
  const cityLabel = city === "All" ? "All Towns" : `${city}, CT`;
  const [currentSupply, setCurrentSupply] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setCurrentSupply(null);
    const params = new URLSearchParams({ city, kind, property: "all" });
    void loadTabJson<CachedMonthsSupply>(`/api/months-supply?${params}`)
      .then((body) => {
        if (cancelled || !body) return;
        setCurrentSupply(body.monthsSupply ?? null);
      })
      .catch(() => {
        /* header falls back to — */
      });
    return () => {
      cancelled = true;
    };
  }, [city, kind]);

  return (
    <StatsMonthComparisonChart
      city={city}
      kind={kind}
      apiPath="/api/months-supply-by-month"
      title={statsMonthsSupplyByMonthTitle(kind)}
      volumeNoun="mo supply"
      compareYears={COMPARE_YEARS}
      defaultCompareYears={COMPARE_YEARS}
      yearSelectionEnabled={false}
      timelineModeEnabled
      allowYDecimals
      formatMetricValue={formatMonths}
      headerActiveCount={headerActiveCount}
      footerNote={`End-of-month active ÷ trailing 3-mo avg ${
        kind === "rental" ? "leases" : "closings"
      } · reconstructed inventory · ${cityLabel} · 2025 vs 2026`}
      headerMetric={() => {
        const supplyColor =
          currentSupply == null
            ? "text-white/40"
            : currentSupply <= 2
              ? "text-coral"
              : currentSupply <= 4
                ? "text-gold"
                : "text-sage";
        return (
          <div className="text-right">
            <p className="font-mono text-[9px] tracking-[0.2em] uppercase text-white/30 mb-0.5">
              Now
            </p>
            <p className={`font-mono text-2xl tabular-nums font-medium leading-none ${supplyColor}`}>
              {currentSupply != null ? currentSupply.toFixed(1) : "—"}
            </p>
            <p className="font-mono text-[9px] tracking-wide mt-0.5 text-white/35">
              mo supply
            </p>
          </div>
        );
      }}
    />
  );
}
