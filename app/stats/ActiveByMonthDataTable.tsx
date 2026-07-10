"use client";

import { statsActiveByMonthTitle, statsActiveInventoryNoun } from "./stats-labels";
import StatsMonthComparisonDataTable from "./StatsMonthComparisonDataTable";
import type { StatsCity, StatsKind } from "./stats-towns";
import { getCurrentMonthChartYear } from "./stats-month-chart-utils";

export default function ActiveByMonthDataTable({
  city,
  kind,
}: {
  city: StatsCity;
  kind: StatsKind;
}) {
  const inventoryNoun = statsActiveInventoryNoun(kind);
  const currentYear = getCurrentMonthChartYear();

  return (
    <StatsMonthComparisonDataTable
      city={city}
      kind={kind}
      apiPath="/api/active-by-month"
      title={statsActiveByMonthTitle(kind)}
      valueLabel={`End-of-month ${inventoryNoun}`}
      footerNote={`${currentYear} excludes future months.`}
    />
  );
}
