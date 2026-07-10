"use client";

import { useEffect, useMemo, useState } from "react";
import { TOWN_LIST, type StatsKind, type Town } from "./stats-towns";
import { statsActiveByMonthTownTitle } from "./stats-labels";
import { STATS_TOWN_COLOR } from "./stats-town-colors";
import { useActiveByTownView } from "./active-by-town-context";
import { buildMonthSlots } from "./stats-month-chart-utils";
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

export default function ActiveByTownDataTable({ kind }: { kind: StatsKind }) {
  const {
    visibleYears,
    continuousMode,
    calendarMultiYearMode,
    singleYear,
    monthCount,
  } = useActiveByTownView();
  const [byTown, setByTown] = useState<Partial<Record<Town, MonthlyCount[]>>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    fetch(`/api/active-by-month/by-town?kind=${kind}`, { cache: "no-store" })
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

  const calendarRows = useMemo(() => {
    const out: { town: Town; year: number; months: number[]; total: number }[] = [];
    for (const town of TOWN_LIST) {
      for (const year of visibleYears) {
        const months = MONTHS.map((_, i) => countFor(byTown[town], year, i + 1));
        const total = months.reduce((a, b) => a + b, 0);
        if (total > 0 || !calendarMultiYearMode) {
          out.push({ town, year, months, total });
        }
      }
    }
    return out.length > 0
      ? out
      : TOWN_LIST.flatMap((town) =>
          visibleYears.map((year) => ({
            town,
            year,
            months: MONTHS.map((_, i) => countFor(byTown[town], year, i + 1)),
            total: 0,
          })),
        );
  }, [byTown, calendarMultiYearMode, visibleYears]);

  const timelineRows = useMemo(() => {
    const slots = buildMonthSlots(visibleYears, isFutureMonth);
    return slots.map(({ year, month, label }) => {
      const values = TOWN_LIST.map((town) => ({
        town,
        count: countFor(byTown[town], year, month),
      }));
      return {
        label,
        slotLabel: `${MONTHS[month - 1]} ${year}`,
        year,
        values,
      };
    });
  }, [byTown, visibleYears]);

  const subtitle = `All Towns · ${visibleYears.join(" · ")}${
    continuousMode ? ` · ${monthCount}-month timeline` : ""
  }`;

  if (loading) {
    return (
      <StatsChartDataTable
        title={`${statsActiveByMonthTownTitle(kind)} — data`}
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

  if (continuousMode) {
    return (
      <StatsChartDataTable
        title={`${statsActiveByMonthTownTitle(kind)} — data`}
        subtitle={subtitle}
        footer={
          <p className="font-mono text-[9px] tracking-wide text-charcoal/50">
            One row per month slot on the stacked timeline. Color matches the chart legend.{" "}
            {CURRENT_YEAR} excludes future months.
          </p>
        }
      >
        <StatsChartDataHead>
          <tr>
            <StatsChartDataTh>Period</StatsChartDataTh>
            {TOWN_LIST.map((town) => (
              <StatsChartDataTh key={town} align="right">
                <span style={{ color: STATS_TOWN_COLOR[town] }}>{town}</span>
              </StatsChartDataTh>
            ))}
          </tr>
        </StatsChartDataHead>
        <StatsChartDataBody>
          {timelineRows.map((row, i) => (
            <StatsChartDataRow key={`${row.slotLabel}-${i}`} stripe={i % 2 === 1}>
              <StatsChartDataTd bold>{row.slotLabel}</StatsChartDataTd>
              {row.values.map(({ town, count }) => (
                <StatsChartDataTd key={town} align="right" muted={count === 0}>
                  {count > 0 ? count.toLocaleString() : "—"}
                </StatsChartDataTd>
              ))}
            </StatsChartDataRow>
          ))}
        </StatsChartDataBody>
      </StatsChartDataTable>
    );
  }

  return (
    <StatsChartDataTable
      title={`${statsActiveByMonthTownTitle(kind)} — data`}
      subtitle={subtitle}
      footer={
        <p className="font-mono text-[9px] tracking-wide text-charcoal/50">
          One row per town and year. End-of-month inventory. Color matches the chart legend.{" "}
          {CURRENT_YEAR} excludes future months.
          {singleYear != null ? ` Showing ${singleYear} only.` : ""}
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
        {calendarRows.map((row, i) => (
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
