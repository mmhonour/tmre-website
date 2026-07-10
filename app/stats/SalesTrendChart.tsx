"use client";

import {
  statsByMonthTitle,
  statsClosedLabel,
  statsVolumeNoun,
} from "./stats-labels";
import StatsMonthComparisonChart from "./StatsMonthComparisonChart";
import type { StatsCity, StatsKind } from "./stats-towns";

type MonthlyCount = { year: number; month: number; count: number };

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
}: {
  city: StatsCity;
  kind: StatsKind;
  headerActiveCount?: number | null;
}) {
  const cityLabel = city === "All" ? "All Towns" : `${city}, CT`;

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
        const avgClosings = trailingAvg(data);
        const monthsSupply =
          activeCount && avgClosings && avgClosings > 0 ? activeCount / avgClosings : null;
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
