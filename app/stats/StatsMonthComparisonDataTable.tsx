"use client";

import { useEffect, useMemo, useState } from "react";
import { type StatsCity, type StatsKind } from "./stats-towns";
import {
  buildContinuousYearChartData,
  buildMonthChartData,
  isFutureCalendarMonth,
  MONTHS,
  yearChartStyle,
  type MonthlyCount,
} from "./stats-month-chart-utils";
import { useStatsMonthComparisonView } from "./stats-month-comparison-context";
import { fetchStatsMonthData } from "./stats-month-api";
import {
  StatsChartDataBody,
  StatsChartDataHead,
  StatsChartDataRow,
  StatsChartDataTable,
  StatsChartDataTd,
  StatsChartDataTh,
} from "./StatsChartDataTable";

function countFor(data: MonthlyCount[], year: number, month: number): number {
  if (isFutureCalendarMonth(year, month)) return 0;
  return data.find((d) => d.year === year && d.month === month)?.count ?? 0;
}

export type StatsMonthComparisonDataTableProps = {
  city: StatsCity;
  kind: StatsKind;
  apiPath: string;
  title: string;
  valueLabel: string;
  footerNote: string;
};

export default function StatsMonthComparisonDataTable({
  city,
  kind,
  apiPath,
  title,
  valueLabel,
  footerNote,
}: StatsMonthComparisonDataTableProps) {
  const {
    visibleYears,
    continuousMode,
    monthCount,
    timelineMode,
    multiYearMode,
  } = useStatsMonthComparisonView();

  const [data, setData] = useState<MonthlyCount[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    fetchStatsMonthData(apiPath, city, kind).then((res) => {
      if (cancelled) return;
      setData(res?.data ?? []);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [city, kind, apiPath]);

  const chartRows = useMemo(
    () =>
      continuousMode
        ? buildContinuousYearChartData(data, visibleYears, isFutureCalendarMonth)
        : buildMonthChartData(data, visibleYears, isFutureCalendarMonth),
    [continuousMode, data, visibleYears],
  );

  const yearTotals = useMemo(
    () =>
      visibleYears.map((yr) =>
        MONTHS.reduce((sum, _, i) => sum + countFor(data, yr, i + 1), 0),
      ),
    [data, visibleYears],
  );

  const scopeLabel = city === "All" ? "All Towns" : `${city}, CT`;
  const subtitleYears = visibleYears.join(" · ");
  const axisNote =
    continuousMode && multiYearMode
      ? `${monthCount}-month timeline`
      : multiYearMode
        ? "12 months"
        : null;

  if (loading) {
    return (
      <StatsChartDataTable title={`${title} — data`} subtitle={scopeLabel}>
        <StatsChartDataBody>
          <StatsChartDataRow>
            <StatsChartDataTd colSpan={visibleYears.length + 2} muted>
              Loading…
            </StatsChartDataTd>
          </StatsChartDataRow>
        </StatsChartDataBody>
      </StatsChartDataTable>
    );
  }

  if (continuousMode) {
    return (
      <StatsChartDataTable
        title={`${title} — data`}
        subtitle={`${scopeLabel} · ${subtitleYears} · ${monthCount}-month timeline`}
        footer={
          <p className="font-mono text-[9px] tracking-wide text-charcoal/50">
            {footerNote} Matches the stacked timeline chart ({timelineMode} axis).
          </p>
        }
      >
        <StatsChartDataHead>
          <tr>
            <StatsChartDataTh>Period</StatsChartDataTh>
            {visibleYears.map((yr) => {
              const cfg = yearChartStyle(yr);
              return (
                <StatsChartDataTh key={yr} align="right">
                  <span style={{ color: cfg.stroke }}>{yr}</span>
                </StatsChartDataTh>
              );
            })}
          </tr>
        </StatsChartDataHead>
        <StatsChartDataBody>
          {chartRows.map((row, i) => (
            <StatsChartDataRow key={`${row.slotLabel}-${i}`} stripe={i % 2 === 1}>
              <StatsChartDataTd bold>{String(row.slotLabel ?? row.month)}</StatsChartDataTd>
              {visibleYears.map((yr) => {
                const v = row[String(yr)];
                const num = typeof v === "number" ? v : null;
                return (
                  <StatsChartDataTd key={yr} align="right" muted={num == null || num === 0}>
                    {num != null && num > 0 ? num.toLocaleString() : "—"}
                  </StatsChartDataTd>
                );
              })}
            </StatsChartDataRow>
          ))}
          <StatsChartDataRow>
            <StatsChartDataTd bold>Year total</StatsChartDataTd>
            {yearTotals.map((total, j) => (
              <StatsChartDataTd key={visibleYears[j]} align="right" bold>
                {total > 0 ? total.toLocaleString() : "—"}
              </StatsChartDataTd>
            ))}
          </StatsChartDataRow>
        </StatsChartDataBody>
      </StatsChartDataTable>
    );
  }

  return (
    <StatsChartDataTable
      title={`${title} — data`}
      subtitle={
        axisNote
          ? `${scopeLabel} · ${subtitleYears} · ${axisNote}`
          : `${scopeLabel} · ${subtitleYears}`
      }
      footer={
        <p className="font-mono text-[9px] tracking-wide text-charcoal/50">
          {footerNote} {valueLabel} per calendar month.
        </p>
      }
    >
      <StatsChartDataHead>
        <tr>
          <StatsChartDataTh>Month</StatsChartDataTh>
          {visibleYears.map((yr) => {
            const cfg = yearChartStyle(yr);
            return (
              <StatsChartDataTh key={yr} align="right">
                <span style={{ color: cfg.stroke }}>{yr}</span>
              </StatsChartDataTh>
            );
          })}
          {visibleYears.length > 1 ? (
            <StatsChartDataTh align="right">Mo. avg</StatsChartDataTh>
          ) : null}
        </tr>
      </StatsChartDataHead>
      <StatsChartDataBody>
        {MONTHS.map((name, i) => {
          const month = i + 1;
          const values = visibleYears.map((yr) => countFor(data, yr, month));
          const avg =
            values.filter((v) => v > 0).length > 0
              ? Math.round(
                  values.reduce((a, b) => a + b, 0) / values.filter((v) => v > 0).length,
                )
              : 0;
          return (
            <StatsChartDataRow key={name} stripe={i % 2 === 1}>
              <StatsChartDataTd bold>{name}</StatsChartDataTd>
              {values.map((v, j) => (
                <StatsChartDataTd key={visibleYears[j]} align="right" muted={v === 0}>
                  {v > 0 ? v.toLocaleString() : "—"}
                </StatsChartDataTd>
              ))}
              {visibleYears.length > 1 ? (
                <StatsChartDataTd align="right" muted={avg === 0}>
                  {avg > 0 ? avg.toLocaleString() : "—"}
                </StatsChartDataTd>
              ) : null}
            </StatsChartDataRow>
          );
        })}
        <StatsChartDataRow>
          <StatsChartDataTd bold>Year total</StatsChartDataTd>
          {yearTotals.map((total, j) => (
            <StatsChartDataTd key={visibleYears[j]} align="right" bold>
              {total > 0 ? total.toLocaleString() : "—"}
            </StatsChartDataTd>
          ))}
          {visibleYears.length > 1 ? (
            <StatsChartDataTd align="right" muted>
              —
            </StatsChartDataTd>
          ) : null}
        </StatsChartDataRow>
      </StatsChartDataBody>
    </StatsChartDataTable>
  );
}
