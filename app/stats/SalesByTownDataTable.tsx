"use client";

import { useEffect, useMemo, useState } from "react";
import { statsMonthChartYears } from "@/lib/stats-month-years";
import { TOWN_LIST, type StatsKind, type Town } from "./stats-towns";
import { statsByMonthTownTitle } from "./stats-labels";
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

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const CURRENT_YEAR = new Date().getFullYear();
const CHART_YEARS = statsMonthChartYears();

function countFor(
  rows: MonthlyCount[] | undefined,
  year: number,
  month: number,
): number {
  const isFuture = year === CURRENT_YEAR && month > new Date().getMonth() + 1;
  if (isFuture) return 0;
  return rows?.find((d) => d.year === year && d.month === month)?.count ?? 0;
}

export default function SalesByTownDataTable({ kind }: { kind: StatsKind }) {
  const [byTown, setByTown] = useState<Partial<Record<Town, MonthlyCount[]>>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    fetch(`/api/sales-by-month/by-town?kind=${kind}`, { cache: "no-store" })
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
    const out: { town: Town; year: number; months: number[]; total: number }[] = [];
    for (const town of TOWN_LIST) {
      for (const year of CHART_YEARS) {
        const months = MONTHS.map((_, i) => countFor(byTown[town], year, i + 1));
        const total = months.reduce((a, b) => a + b, 0);
        if (total > 0) {
          out.push({ town, year, months, total });
        }
      }
    }
    return out.length > 0
      ? out
      : TOWN_LIST.flatMap((town) =>
          CHART_YEARS.map((year) => ({
            town,
            year,
            months: MONTHS.map((_, i) => countFor(byTown[town], year, i + 1)),
            total: 0,
          })),
        );
  }, [byTown]);

  if (loading) {
    return (
      <StatsChartDataTable
        title={`${statsByMonthTownTitle(kind)} — data`}
        subtitle="All Towns"
      >
        <StatsChartDataBody>
          <StatsChartDataRow>
            <StatsChartDataTd colSpan={15} muted>
              Loading…
            </StatsChartDataTd>
          </StatsChartDataRow>
        </StatsChartDataBody>
      </StatsChartDataTable>
    );
  }

  return (
    <StatsChartDataTable
      title={`${statsByMonthTownTitle(kind)} — data`}
      subtitle={`All Towns · ${CHART_YEARS[0]}–${CHART_YEARS[CHART_YEARS.length - 1]}`}
      footer={
        <p className="font-mono text-[9px] tracking-wide text-charcoal/50">
          One row per town and year. Color matches the chart legend. {CURRENT_YEAR} excludes
          future months.
        </p>
      }
    >
      <StatsChartDataHead>
        <tr>
          <StatsChartDataTh>Town</StatsChartDataTh>
          <StatsChartDataTh>Year</StatsChartDataTh>
          {MONTHS.map((m) => (
            <StatsChartDataTh key={m} align="right">
              {m}
            </StatsChartDataTh>
          ))}
          <StatsChartDataTh align="right">Total</StatsChartDataTh>
        </tr>
      </StatsChartDataHead>
      <StatsChartDataBody>
        {rows.map((row, i) => (
          <StatsChartDataRow key={`${row.town}-${row.year}`} stripe={i % 2 === 1}>
            <StatsChartDataTd>
              <span style={{ color: STATS_TOWN_COLOR[row.town] }}>{row.town}</span>
            </StatsChartDataTd>
            <StatsChartDataTd>{row.year}</StatsChartDataTd>
            {row.months.map((v, j) => (
              <StatsChartDataTd key={j} align="right" muted={v === 0}>
                {v > 0 ? v.toLocaleString() : "—"}
              </StatsChartDataTd>
            ))}
            <StatsChartDataTd align="right" bold>
              {row.total > 0 ? row.total.toLocaleString() : "—"}
            </StatsChartDataTd>
          </StatsChartDataRow>
        ))}
      </StatsChartDataBody>
    </StatsChartDataTable>
  );
}
