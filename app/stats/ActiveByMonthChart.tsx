"use client";

import {
  statsActiveByMonthTitle,
  statsActiveInventoryNoun,
  statsActiveLabel,
} from "./stats-labels";
import StatsMonthComparisonChart from "./StatsMonthComparisonChart";
import type { StatsCity, StatsKind } from "./stats-towns";
import { getMonthChartYears } from "./stats-month-chart-utils";

export default function ActiveByMonthChart({
  city,
  kind,
  headerActiveCount,
}: {
  city: StatsCity;
  kind: StatsKind;
  headerActiveCount?: number | null;
}) {
  const inventoryNoun = statsActiveInventoryNoun(kind);
  const cityLabel = city === "All" ? "All Towns" : `${city}, CT`;

  const chartYears = getMonthChartYears();

  return (
    <StatsMonthComparisonChart
      city={city}
      kind={kind}
      apiPath="/api/active-by-month"
      title={statsActiveByMonthTitle(kind)}
      volumeNoun={inventoryNoun}
      timelineModeEnabled
      headerActiveCount={headerActiveCount}
      footerNote={`${statsActiveLabel(kind)} · ${cityLabel} · end-of-month inventory · ${chartYears[0]}–${chartYears[chartYears.length - 1]}`}
      headerMetric={({ activeCount }) => (
        <div className="text-right">
          <p className="font-mono text-[9px] tracking-[0.2em] uppercase text-white/30 mb-0.5">
            Active now
          </p>
          <p className="font-mono text-2xl tabular-nums font-medium leading-none text-sage">
            {activeCount != null ? activeCount.toLocaleString() : "—"}
          </p>
          <p className="font-mono text-[9px] tracking-wide mt-0.5 text-white/35">
            {inventoryNoun}
          </p>
        </div>
      )}
    />
  );
}
