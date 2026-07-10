"use client";

import { useEffect, useMemo, useState } from "react";
import { type StatsCity, type StatsKind } from "./stats-towns";
import { statsByMonthTitle, statsVolumeNoun } from "./stats-labels";
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

const CURRENT_YEAR = new Date().getFullYear();
const TREND_YEARS = [CURRENT_YEAR - 2, CURRENT_YEAR - 1, CURRENT_YEAR];

function countFor(data: MonthlyCount[], year: number, month: number): number {
  const isFuture = year === CURRENT_YEAR && month > new Date().getMonth() + 1;
  if (isFuture) return 0;
  return data.find((d) => d.year === year && d.month === month)?.count ?? 0;
}

export default function SalesTrendDataTable({
  city,
  kind,
}: {
  city: StatsCity;
  kind: StatsKind;
}) {
  const [data, setData] = useState<MonthlyCount[]>([]);
  const [loading, setLoading] = useState(true);
  const volumeNoun = statsVolumeNoun(kind);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    fetchStatsMonthData("/api/sales-by-month", city, kind).then((res) => {
      if (cancelled) return;
      const rows = (res?.data ?? []).filter((row) => TREND_YEARS.includes(row.year));
      setData(rows);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [city, kind]);

  const yearTotals = useMemo(
    () =>
      TREND_YEARS.map((yr) =>
        MONTHS.reduce((sum, _, i) => sum + countFor(data, yr, i + 1), 0),
      ),
    [data],
  );

  const scopeLabel = city === "All" ? "All Towns" : `${city}, CT`;

  if (loading) {
    return (
      <StatsChartDataTable
        title={`${statsByMonthTitle(kind)} — data`}
        subtitle={scopeLabel}
      >
        <StatsChartDataBody>
          <StatsChartDataRow>
            <StatsChartDataTd colSpan={5} muted>
              Loading…
            </StatsChartDataTd>
          </StatsChartDataRow>
        </StatsChartDataBody>
      </StatsChartDataTable>
    );
  }

  return (
    <StatsChartDataTable
      title={`${statsByMonthTitle(kind)} — data`}
      subtitle={`${scopeLabel} · ${TREND_YEARS.join(" · ")}`}
      footer={
        <p className="font-mono text-[9px] tracking-wide text-charcoal/50">
          Counts are {volumeNoun} per calendar month. {CURRENT_YEAR} excludes future months.
        </p>
      }
    >
      <StatsChartDataHead>
        <tr>
          <StatsChartDataTh>Month</StatsChartDataTh>
          {TREND_YEARS.map((yr) => (
            <StatsChartDataTh key={yr} align="right">
              {yr}
            </StatsChartDataTh>
          ))}
          <StatsChartDataTh align="right">Mo. avg</StatsChartDataTh>
        </tr>
      </StatsChartDataHead>
      <StatsChartDataBody>
        {MONTHS.map((name, i) => {
          const month = i + 1;
          const values = TREND_YEARS.map((yr) => countFor(data, yr, month));
          const avg =
            values.filter((v) => v > 0).length > 0
              ? Math.round(
                  values.reduce((a, b) => a + b, 0) /
                    values.filter((v) => v > 0).length,
                )
              : 0;
          return (
            <StatsChartDataRow key={name} stripe={i % 2 === 1}>
              <StatsChartDataTd bold>{name}</StatsChartDataTd>
              {values.map((v, j) => (
                <StatsChartDataTd key={TREND_YEARS[j]} align="right" muted={v === 0}>
                  {v > 0 ? v.toLocaleString() : "—"}
                </StatsChartDataTd>
              ))}
              <StatsChartDataTd align="right" muted={avg === 0}>
                {avg > 0 ? avg.toLocaleString() : "—"}
              </StatsChartDataTd>
            </StatsChartDataRow>
          );
        })}
        <StatsChartDataRow>
          <StatsChartDataTd bold>Year total</StatsChartDataTd>
          {yearTotals.map((total, j) => (
            <StatsChartDataTd key={TREND_YEARS[j]} align="right" bold>
              {total > 0 ? total.toLocaleString() : "—"}
            </StatsChartDataTd>
          ))}
          <StatsChartDataTd align="right" muted>
            —
          </StatsChartDataTd>
        </StatsChartDataRow>
      </StatsChartDataBody>
    </StatsChartDataTable>
  );
}
