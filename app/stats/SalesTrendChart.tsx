"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { loadTabJson } from "@/lib/tab-data-prefetch";
import { formatCompactDollars } from "@/lib/stats-compact-dollars";
import {
  defaultStatsMonthCompareYears,
  statsMonthChartYears,
} from "@/lib/stats-month-years";
import {
  parseSalesTrendMetric,
  statsByMonthTitle,
  statsClosedLabel,
  statsVolumeByMonthTitle,
  statsVolumeNoun,
  type SalesTrendMetric,
} from "./stats-labels";
import { pillClass } from "./stats-month-chart-utils";
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
/** Full chart pool (2019 → current) for year pills. */
const ALL_TREND_YEARS = statsMonthChartYears();
/** Default selection: last three calendar years. */
const DEFAULT_TREND_YEARS = defaultStatsMonthCompareYears();

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
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const metric = parseSalesTrendMetric(searchParams.get("metric"));
  const [cached, setCached] = useState<CachedMonthsSupply | null>(null);

  function setMetric(next: SalesTrendMetric) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "volume") params.set("metric", "volume");
    else params.delete("metric");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  useEffect(() => {
    let cancelled = false;
    setCached(null);
    const params = new URLSearchParams({
      city,
      kind,
      property: propertyClass,
    });
    void loadTabJson<CachedMonthsSupply>(`/api/months-supply?${params}`)
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

  const volumeMode = metric === "volume";

  return (
    <StatsMonthComparisonChart
      city={city}
      kind={kind}
      apiPath="/api/sales-by-month"
      title={volumeMode ? statsVolumeByMonthTitle(kind) : statsByMonthTitle(kind)}
      volumeNoun={volumeMode ? "" : statsVolumeNoun(kind)}
      valueKey={metric}
      formatMetricValue={volumeMode ? formatCompactDollars : undefined}
      formatYTick={volumeMode ? formatCompactDollars : undefined}
      yAxisWidth={volumeMode ? 48 : undefined}
      toolbarExtra={
        <div className="flex flex-wrap items-center gap-2 mr-3">
          <span className="font-mono text-[9px] tracking-[0.15em] uppercase text-white/30 shrink-0">
            Show
          </span>
          <button
            type="button"
            onClick={() => setMetric("count")}
            aria-pressed={!volumeMode}
            className={pillClass(!volumeMode)}
          >
            Closings
          </button>
          <button
            type="button"
            onClick={() => setMetric("volume")}
            aria-pressed={volumeMode}
            className={pillClass(volumeMode)}
          >
            Volume
          </button>
        </div>
      }
      compareYears={ALL_TREND_YEARS}
      defaultCompareYears={DEFAULT_TREND_YEARS}
      yearSelectionEnabled
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
