"use client";

import { useEffect, useMemo, useState } from "react";
import { defaultStatsMonthCompareYears } from "@/lib/stats-month-years";
import { sortYears } from "./stats-month-chart-utils";
import { TOWN_LIST, type StatsKind, type Town } from "./stats-towns";
import { statsMonthsSupplyByMonthTownTitle } from "./stats-labels";
import { STATS_TOWN_COLOR } from "./stats-town-colors";
import {
  StatsChartDataBody,
  StatsChartDataHead,
  StatsChartDataRow,
  StatsChartDataTable,
  StatsChartDataTd,
  StatsChartDataTh,
} from "./StatsChartDataTable";

type MonthlyCount = { year: number; month: number; count: number };

const CURRENT_YEAR = new Date().getFullYear();
const COMPARE_YEARS = defaultStatsMonthCompareYears();

function isFutureMonth(year: number, month: number): boolean {
  return year === CURRENT_YEAR && month > new Date().getMonth() + 1;
}

function countFor(
  rows: MonthlyCount[] | undefined,
  year: number,
  month: number,
): number {
  if (isFutureMonth(year, month)) return 0;
  return rows?.find((d) => d.year === year && d.month === month)?.count ?? 0;
}

export default function MonthsSupplyByTownDataTable({ kind }: { kind: StatsKind }) {
  const [byTown, setByTown] = useState<Partial<Record<Town, MonthlyCount[]>>>({});
  const [loading, setLoading] = useState(true);
  const years = useMemo(() => sortYears(new Set(COMPARE_YEARS)), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/months-supply-by-month/by-town?kind=${kind}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { towns?: Partial<Record<Town, MonthlyCount[]>> } | null) => {
        if (cancelled) return;
        setByTown(data?.towns ?? {});
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [kind]);

  const rows = useMemo(() => {
    const out: { year: number; month: number; label: string }[] = [];
    for (const year of years) {
      for (let month = 1; month <= 12; month++) {
        if (isFutureMonth(year, month)) continue;
        out.push({
          year,
          month,
          label: `${year}-${String(month).padStart(2, "0")}`,
        });
      }
    }
    return out;
  }, [years]);

  return (
    <StatsChartDataTable
      title={statsMonthsSupplyByMonthTownTitle(kind)}
      subtitle={
        loading
          ? "Loading…"
          : "End-of-month months supply by town"
      }
    >
      <StatsChartDataHead>
        <StatsChartDataRow>
          <StatsChartDataTh>Month</StatsChartDataTh>
          {TOWN_LIST.map((town) => (
            <StatsChartDataTh key={town}>
              <span style={{ color: STATS_TOWN_COLOR[town] }}>{town}</span>
            </StatsChartDataTh>
          ))}
        </StatsChartDataRow>
      </StatsChartDataHead>
      <StatsChartDataBody>
        {rows.map(({ year, month, label }) => (
          <StatsChartDataRow key={label}>
            <StatsChartDataTd>{label}</StatsChartDataTd>
            {TOWN_LIST.map((town) => {
              const n = countFor(byTown[town], year, month);
              return (
                <StatsChartDataTd key={town}>
                  {n > 0 ? n.toFixed(1) : "—"}
                </StatsChartDataTd>
              );
            })}
          </StatsChartDataRow>
        ))}
      </StatsChartDataBody>
    </StatsChartDataTable>
  );
}
