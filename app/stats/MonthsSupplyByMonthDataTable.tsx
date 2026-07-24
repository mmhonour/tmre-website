"use client";

import { useEffect, useMemo, useState } from "react";
import { type StatsCity, type StatsKind } from "./stats-towns";
import { statsMonthsSupplyByMonthTitle } from "./stats-labels";
import {
  StatsChartDataBody,
  StatsChartDataHead,
  StatsChartDataRow,
  StatsChartDataTable,
  StatsChartDataTd,
  StatsChartDataTh,
} from "./StatsChartDataTable";
import { fetchStatsMonthData } from "./stats-month-api";

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

const COMPARE_YEARS = [2025, 2026] as const;
const CURRENT_YEAR = new Date().getFullYear();

function valueFor(data: MonthlyCount[], year: number, month: number): number | null {
  const isFuture = year === CURRENT_YEAR && month > new Date().getMonth() + 1;
  if (isFuture) return null;
  const row = data.find((d) => d.year === year && d.month === month);
  if (!row || row.count <= 0) return null;
  return row.count;
}

function formatCell(n: number | null): string {
  return n == null ? "—" : n.toFixed(1);
}

export default function MonthsSupplyByMonthDataTable({
  city,
  kind,
}: {
  city: StatsCity;
  kind: StatsKind;
}) {
  const [data, setData] = useState<MonthlyCount[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    fetchStatsMonthData("/api/months-supply-by-month", city, kind).then((res) => {
      if (cancelled) return;
      const rows = (res?.data ?? []).filter((row) =>
        (COMPARE_YEARS as readonly number[]).includes(row.year),
      );
      setData(rows);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [city, kind]);

  const yearAverages = useMemo(
    () =>
      COMPARE_YEARS.map((yr) => {
        const vals = MONTHS.map((_, i) => valueFor(data, yr, i + 1)).filter(
          (v): v is number => v != null,
        );
        if (!vals.length) return null;
        return vals.reduce((a, b) => a + b, 0) / vals.length;
      }),
    [data],
  );

  const scopeLabel = city === "All" ? "All Towns" : `${city}, CT`;
  const title = statsMonthsSupplyByMonthTitle(kind);

  if (loading) {
    return (
      <StatsChartDataTable title={`${title} — data`} subtitle={scopeLabel}>
        <StatsChartDataBody>
          <StatsChartDataRow>
            <StatsChartDataTd colSpan={3} muted>
              Loading…
            </StatsChartDataTd>
          </StatsChartDataRow>
        </StatsChartDataBody>
      </StatsChartDataTable>
    );
  }

  return (
    <StatsChartDataTable
      title={`${title} — data`}
      subtitle={`${scopeLabel} · ${COMPARE_YEARS.join(" · ")}`}
      footer={
        <p className="font-mono text-[9px] tracking-wide text-charcoal/50">
          End-of-month active ÷ trailing 3-month avg closings. {CURRENT_YEAR} excludes
          future months.
        </p>
      }
    >
      <StatsChartDataHead>
        <StatsChartDataRow>
          <StatsChartDataTh>Month</StatsChartDataTh>
          {COMPARE_YEARS.map((yr) => (
            <StatsChartDataTh key={yr} align="right">
              {yr}
            </StatsChartDataTh>
          ))}
        </StatsChartDataRow>
      </StatsChartDataHead>
      <StatsChartDataBody>
        {MONTHS.map((label, i) => (
          <StatsChartDataRow key={label}>
            <StatsChartDataTd>{label}</StatsChartDataTd>
            {COMPARE_YEARS.map((yr) => (
              <StatsChartDataTd key={yr} align="right">
                {formatCell(valueFor(data, yr, i + 1))}
              </StatsChartDataTd>
            ))}
          </StatsChartDataRow>
        ))}
        <StatsChartDataRow>
          <StatsChartDataTd>Avg</StatsChartDataTd>
          {yearAverages.map((avg, i) => (
            <StatsChartDataTd key={COMPARE_YEARS[i]} align="right">
              {formatCell(avg)}
            </StatsChartDataTd>
          ))}
        </StatsChartDataRow>
      </StatsChartDataBody>
    </StatsChartDataTable>
  );
}
