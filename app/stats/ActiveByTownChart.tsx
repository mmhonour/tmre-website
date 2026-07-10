"use client";

import { useEffect, useId, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { defaultStatsMonthCompareYears, statsMonthChartYears } from "@/lib/stats-month-years";
import { pillClass, sortYears, yearChartStyle } from "./stats-month-chart-utils";
import { TOWN_LIST, type StatsKind, type Town } from "./stats-towns";
import { statsActiveByMonthTownTitle, statsActiveInventoryNoun, statsActiveLabel } from "./stats-labels";
import { STATS_TOWN_COLOR } from "./stats-town-colors";
import { useActiveByTownViewOptional } from "./active-by-town-context";
import { useStatsChartReady } from "./stats-chart-frame-context";

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

type TimelineMode = "calendar" | "continuous";

type MonthSlot = { year: number; month: number; label: string };

function seriesKey(town: Town, year: number): string {
  return `${town}::${year}`;
}

function parseSeriesKey(key: string): { town: string; year: number } | null {
  const idx = key.lastIndexOf("::");
  if (idx < 0) return null;
  const year = Number(key.slice(idx + 2));
  if (!Number.isFinite(year)) return null;
  return { town: key.slice(0, idx), year };
}

function isFutureMonth(year: number, month: number): boolean {
  return year === CURRENT_YEAR && month > new Date().getMonth() + 1;
}

function countAt(
  byTown: Partial<Record<Town, MonthlyCount[]>>,
  town: Town,
  year: number,
  month: number,
): number {
  if (isFutureMonth(year, month)) return 0;
  return byTown[town]?.find((d) => d.year === year && d.month === month)?.count ?? 0;
}

function continuousMonthLabel(year: number, month: number): string {
  return month === 12 ? String(year) : String(month);
}

function yearLineStyle(year: number): { strokeWidth: number; dash?: string; opacity: number } {
  const ageFromCurrent = CURRENT_YEAR - year;
  return {
    strokeWidth: ageFromCurrent === 0 ? 2.5 : ageFromCurrent === 1 ? 2 : ageFromCurrent >= 4 ? 1.5 : 1.75,
    dash: ageFromCurrent >= 3 ? "5 3" : undefined,
    opacity: Math.max(0.55, 1 - ageFromCurrent * 0.08),
  };
}

function buildMonthSlots(years: readonly number[]): MonthSlot[] {
  const slots: MonthSlot[] = [];
  for (const yr of sortYears(years)) {
    for (let month = 1; month <= 12; month++) {
      if (isFutureMonth(yr, month)) continue;
      slots.push({
        year: yr,
        month,
        label: continuousMonthLabel(yr, month),
      });
    }
  }
  return slots;
}

function buildSingleYearChartData(
  byTown: Partial<Record<Town, MonthlyCount[]>>,
  year: number,
) {
  return MONTHS.map((name, i) => {
    const month = i + 1;
    const row: Record<string, string | number> = { month: name };
    for (const town of TOWN_LIST) {
      row[town] = countAt(byTown, town, year, month);
    }
    return row;
  });
}

/** One line per town per year on a Jan–Dec calendar axis. */
function buildAllYearsCalendarData(
  byTown: Partial<Record<Town, MonthlyCount[]>>,
  years: readonly number[],
) {
  return MONTHS.map((name, i) => {
    const month = i + 1;
    const row: Record<string, string | number> = { month: name };
    for (const town of TOWN_LIST) {
      for (const yr of years) {
        row[seriesKey(town, yr)] = countAt(byTown, town, yr, month);
      }
    }
    return row;
  });
}

/** One line per town across the selected years' month sequence. */
function buildContinuousChartData(
  byTown: Partial<Record<Town, MonthlyCount[]>>,
  years: readonly number[],
) {
  return buildMonthSlots(years).map(({ year, month, label }) => {
    const row: Record<string, string | number> = { month: label };
    for (const town of TOWN_LIST) {
      row[town] = countAt(byTown, town, year, month);
    }
    return row;
  });
}

type TownYearSeries = {
  town: Town;
  year: number;
  dataKey: string;
};

function activeTownYearSeries(
  byTown: Partial<Record<Town, MonthlyCount[]>>,
  years: readonly number[],
): TownYearSeries[] {
  const out: TownYearSeries[] = [];
  for (const town of TOWN_LIST) {
    for (const yr of years) {
      const hasData = (byTown[town] ?? []).some((d) => d.year === yr && d.count > 0);
      if (hasData) out.push({ town, year: yr, dataKey: seriesKey(town, yr) });
    }
  }
  return out.length > 0
    ? out
    : TOWN_LIST.flatMap((town) =>
        years.map((yr) => ({ town, year: yr, dataKey: seriesKey(town, yr) })),
      );
}

function activeTownsForYear(
  byTown: Partial<Record<Town, MonthlyCount[]>>,
  year: number,
): Town[] {
  const townsWithData = TOWN_LIST.filter((town) =>
    (byTown[town] ?? []).some((d) => d.year === year && d.count > 0),
  );
  return townsWithData.length > 0 ? townsWithData : [...TOWN_LIST];
}

function activeTownsContinuous(
  byTown: Partial<Record<Town, MonthlyCount[]>>,
  years: readonly number[],
): Town[] {
  const townsWithData = TOWN_LIST.filter((town) =>
    (byTown[town] ?? []).some(
      (d) => years.includes(d.year) && d.count > 0 && !isFutureMonth(d.year, d.month),
    ),
  );
  return townsWithData.length > 0 ? townsWithData : [...TOWN_LIST];
}

function viewLabel(
  visibleYears: readonly number[],
  timelineMode: TimelineMode,
  monthCount: number,
): string {
  const yearLabel = visibleYears.join(", ");
  if (visibleYears.length > 1) {
    return timelineMode === "continuous"
      ? `${yearLabel} · ${monthCount} months · by town`
      : `${yearLabel} · calendar · by town & year`;
  }
  const year = visibleYears[0]!;
  if (year === CURRENT_YEAR) return `${year} · 12 months (partial year)`;
  return `${year} · 12 months`;
}

function GradientDefs({ id, towns }: { id: string; towns: readonly Town[] }) {
  return (
    <defs>
      {towns.map((town) => {
        const color = STATS_TOWN_COLOR[town];
        return (
          <linearGradient key={town} id={`${id}-grad-${town}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.28} />
            <stop offset="60%" stopColor={color} stopOpacity={0.1} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        );
      })}
    </defs>
  );
}

function Dot3D({
  cx,
  cy,
  fill,
  r = 4,
  opacity = 1,
}: {
  cx?: number;
  cy?: number;
  fill: string;
  r?: number;
  opacity?: number;
}) {
  if (cx == null || cy == null) return null;
  return (
    <g opacity={opacity}>
      <circle cx={cx} cy={cy} r={r + 2} fill={fill} opacity={0.15} />
      <circle cx={cx} cy={cy} r={r} fill={fill} opacity={0.9} />
      <circle cx={cx - r * 0.3} cy={cy - r * 0.3} r={r * 0.35} fill="#fff" opacity={0.55} />
    </g>
  );
}

const tooltipStyle = {
  contentStyle: {
    background: "#1a1f35",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 12,
    fontFamily: "monospace",
    fontSize: 11,
    color: "#fff",
    boxShadow: "0 20px 40px rgba(0,0,0,0.4)",
  },
  labelStyle: {
    color: "#D4AF37",
    marginBottom: 6,
    textTransform: "uppercase" as const,
    letterSpacing: "0.15em",
    fontSize: 10,
  },
  cursor: { stroke: "rgba(255,255,255,0.08)", strokeWidth: 1 },
};

export default function ActiveByTownChart({ kind }: { kind: StatsKind }) {
  const id = useId().replace(/:/g, "");
  const viewCtx = useActiveByTownViewOptional();
  const [byTown, setByTown] = useState<Partial<Record<Town, MonthlyCount[]>>>({});
  const [fallback, setFallback] = useState(false);
  const [loading, setLoading] = useState(true);
  const [internalSelectedYears, setInternalSelectedYears] = useState<Set<number>>(
    () => new Set(defaultStatsMonthCompareYears()),
  );
  const [internalTimelineMode, setInternalTimelineMode] = useState<TimelineMode>("calendar");

  const chartYears = viewCtx?.chartYears ?? CHART_YEARS;
  const selectedYears = viewCtx?.selectedYears ?? internalSelectedYears;
  const toggleYear =
    viewCtx?.toggleYear ??
    ((yr: number) => {
      setInternalSelectedYears((prev) => {
        const next = new Set(prev);
        if (next.has(yr)) {
          if (next.size <= 1) return prev;
          next.delete(yr);
        } else {
          next.add(yr);
        }
        return next;
      });
    });
  const timelineMode = viewCtx?.timelineMode ?? internalTimelineMode;
  const setTimelineMode = viewCtx?.setTimelineMode ?? setInternalTimelineMode;
  const visibleYears = viewCtx?.visibleYears ?? sortYears(selectedYears);
  const multiYearMode = viewCtx?.multiYearMode ?? visibleYears.length > 1;
  const singleYear = viewCtx?.singleYear ?? (visibleYears.length === 1 ? visibleYears[0]! : null);
  const continuousMode = viewCtx?.continuousMode ?? (multiYearMode && timelineMode === "continuous");
  const calendarMultiYearMode =
    viewCtx?.calendarMultiYearMode ?? (multiYearMode && timelineMode === "calendar");
  const singleYearMode = singleYear != null;
  const monthCount =
    viewCtx?.monthCount ?? buildMonthSlots(visibleYears).length;

  useEffect(() => {
    if (viewCtx || !multiYearMode || timelineMode !== "continuous") return;
    setInternalTimelineMode("calendar");
  }, [multiYearMode, timelineMode, viewCtx]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    fetch(`/api/active-by-month/by-town?kind=${kind}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (
          data: {
            towns?: Partial<Record<Town, MonthlyCount[]>>;
            fallback?: boolean;
            statsCache?: boolean;
          } | null,
        ) => {
          if (cancelled || !data?.towns) {
            if (!cancelled) setLoading(false);
            return;
          }
          setByTown(data.towns);
          setFallback(Boolean(data.fallback));
          setLoading(false);
        },
      )
      .catch(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [kind]);

  const monthSlots = useMemo(() => buildMonthSlots(visibleYears), [visibleYears]);

  const chartData = useMemo(() => {
    if (continuousMode) return buildContinuousChartData(byTown, visibleYears);
    if (calendarMultiYearMode) return buildAllYearsCalendarData(byTown, visibleYears);
    if (singleYear != null) return buildSingleYearChartData(byTown, singleYear);
    return [];
  }, [byTown, calendarMultiYearMode, continuousMode, singleYear, visibleYears]);

  const townYearSeries = useMemo(
    () => (calendarMultiYearMode ? activeTownYearSeries(byTown, visibleYears) : []),
    [byTown, calendarMultiYearMode, visibleYears],
  );

  const singleYearTowns = useMemo(
    () => (singleYearMode && singleYear != null ? activeTownsForYear(byTown, singleYear) : []),
    [byTown, singleYear, singleYearMode],
  );

  const continuousTowns = useMemo(
    () => (continuousMode ? activeTownsContinuous(byTown, visibleYears) : []),
    [byTown, continuousMode, visibleYears],
  );

  const legendTowns = continuousMode
    ? continuousTowns
    : calendarMultiYearMode
      ? TOWN_LIST
      : singleYearTowns;

  const tooltipFormatter = (value: unknown, name: unknown) => {
    if (!value) return ["—", String(name)];
    const label = String(name);
    if (calendarMultiYearMode) {
      const parsed = parseSeriesKey(label);
      if (parsed) {
        return [`${value} ${statsActiveInventoryNoun(kind)}`, `${parsed.town} · ${parsed.year}`];
      }
    }
    return [`${value} ${statsActiveInventoryNoun(kind)}`, label];
  };

  const chartHeight = continuousMode ? 360 : calendarMultiYearMode ? 340 : 300;
  const continuousAxisTick = {
    fontFamily: "monospace",
    fontSize: 11,
    fill: "rgba(255,255,255,0.65)",
    fontWeight: 600,
  };

  const periodSelectionLabel = visibleYears.join(", ");
  const axisSelectionLabel =
    timelineMode === "continuous" ? `${monthCount}-month timeline` : "12 months";
  const chartReady = !loading && Object.keys(byTown).length > 0;
  useStatsChartReady(chartReady);

  return (
    <div className="stats-chart-card rounded-2xl overflow-hidden border border-white/10 shadow-2xl shadow-navy/30">
      {chartReady ? (
      <div className="bg-[#0f1628] px-6 pt-6 pb-2">
        <div className="flex items-start justify-between mb-5 gap-4 flex-wrap">
          <div>
            <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-white/40 mb-1">
              {statsActiveByMonthTownTitle(kind)}
            </p>
            <p className="font-serif text-xl text-white">
              All Towns ·{" "}
              <span style={{ color: STATS_TOWN_COLOR.Westport }}>
                {multiYearMode
                  ? continuousMode
                    ? `${monthCount} months`
                    : visibleYears.join(" · ")
                  : singleYear}
              </span>
            </p>
            {calendarMultiYearMode ? (
              <p className="mt-1 font-mono text-[10px] tracking-wide text-white/35">
                Calendar months · color = town · line weight = year ({visibleYears.join(", ")})
              </p>
            ) : null}
            {continuousMode ? (
              <p className="mt-1 font-mono text-[10px] tracking-wide text-white/35">
                {monthCount}-month timeline · one line per town · {visibleYears.join(", ")}
              </p>
            ) : null}
          </div>
          <div className="flex items-center gap-2 font-mono text-[10px] tracking-wide stats-chart-interactive stats-print-screen-only">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                loading
                  ? "bg-gold animate-pulse-dot"
                  : fallback
                    ? "bg-coral"
                    : "bg-sage animate-pulse-dot"
              }`}
            />
            <span className="text-white/40">
              {loading ? "Loading…" : fallback ? "Estimated" : "Live"}
            </span>
          </div>
        </div>

        <div className="stats-print-only flex flex-wrap items-center gap-2 mb-3">
          <span className="stats-print-selection-pill">Years: {periodSelectionLabel}</span>
          {multiYearMode ? (
            <span className="stats-print-selection-pill">Axis: {axisSelectionLabel}</span>
          ) : null}
        </div>

        <div className="stats-chart-interactive stats-print-screen-only flex flex-wrap items-center gap-2 mb-3">
          <span className="font-mono text-[9px] tracking-[0.15em] uppercase text-white/30 shrink-0">
            Compare years
          </span>
          {chartYears.map((yr) => {
            const active = selectedYears.has(yr);
            const cfg = yearChartStyle(yr);
            return (
              <button
                key={yr}
                type="button"
                onClick={() => toggleYear(yr)}
                aria-pressed={active}
                className={`${pillClass(active)} inline-flex items-center gap-1.5`}
                style={active ? { borderColor: `${cfg.stroke}88`, color: cfg.stroke } : undefined}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{
                    backgroundColor: cfg.stroke,
                    opacity: active ? 1 : 0.35,
                    boxShadow: active ? `0 0 6px ${cfg.stroke}` : undefined,
                  }}
                  aria-hidden
                />
                {yr}
              </button>
            );
          })}
        </div>

        <div className="stats-chart-interactive stats-print-screen-only flex flex-wrap items-center gap-3 mb-4">
          <span className="font-mono text-[9px] tracking-[0.15em] uppercase text-white/30">
            Axis
          </span>
          <button
            type="button"
            onClick={() => setTimelineMode("calendar")}
            aria-pressed={timelineMode === "calendar"}
            disabled={!multiYearMode}
            className={`${pillClass(timelineMode === "calendar")} disabled:opacity-35 disabled:pointer-events-none`}
            title={multiYearMode ? undefined : "Select two or more years to compare on one axis"}
          >
            12 months
          </button>
          <button
            type="button"
            onClick={() => setTimelineMode("continuous")}
            aria-pressed={timelineMode === "continuous"}
            disabled={!multiYearMode}
            className={`${pillClass(timelineMode === "continuous")} disabled:opacity-35 disabled:pointer-events-none`}
            title={multiYearMode ? undefined : "Select two or more years for a multi-month timeline"}
          >
            {multiYearMode ? `${monthCount}-month timeline` : "Multi-month timeline"}
          </button>
        </div>

        {calendarMultiYearMode ? (
          <div className="stats-chart-interactive stats-print-screen-only flex flex-wrap items-center gap-5 mb-4">
            {visibleYears.map((yr) => {
              const style = yearLineStyle(yr);
              return (
                <div key={yr} className="flex items-center gap-2">
                  <svg width={28} height={10} aria-hidden>
                    <line
                      x1={0}
                      y1={5}
                      x2={28}
                      y2={5}
                      stroke="rgba(255,255,255,0.55)"
                      strokeWidth={style.strokeWidth}
                      strokeDasharray={style.dash}
                    />
                  </svg>
                  <span className="font-mono text-[10px] text-white/45">{yr}</span>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
      ) : null}

      <div className="bg-[#0f1628] px-2 pb-4">
        {loading && !Object.keys(byTown).length ? (
          <div className="h-80 flex items-center justify-center">
            <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-white/30 animate-pulse">
              Loading chart…
            </span>
          </div>
        ) : calendarMultiYearMode ? (
          <ResponsiveContainer width="100%" height={chartHeight}>
            <LineChart data={chartData} margin={{ top: 12, right: 16, bottom: 4, left: -4 }}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(255,255,255,0.05)"
                vertical={false}
              />
              <XAxis
                dataKey="month"
                tick={{ fontFamily: "monospace", fontSize: 10, fill: "rgba(255,255,255,0.35)" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontFamily: "monospace", fontSize: 10, fill: "rgba(255,255,255,0.35)" }}
                axisLine={false}
                tickLine={false}
                width={28}
              />
              <Tooltip {...tooltipStyle} formatter={tooltipFormatter} />
              {townYearSeries.map(({ town, year, dataKey }) => {
                const color = STATS_TOWN_COLOR[town];
                const yrStyle = yearLineStyle(year);
                return (
                  <Line
                    key={dataKey}
                    type="monotone"
                    dataKey={dataKey}
                    name={dataKey}
                    stroke={color}
                    strokeWidth={yrStyle.strokeWidth}
                    strokeDasharray={yrStyle.dash}
                    strokeOpacity={yrStyle.opacity}
                    dot={(props) => (
                      <Dot3D
                        key={`dot-${dataKey}-${props.index}`}
                        cx={props.cx}
                        cy={props.cy}
                        fill={color}
                        r={year === CURRENT_YEAR ? 4 : 3}
                        opacity={yrStyle.opacity}
                      />
                    )}
                    activeDot={{ r: 6, fill: color, stroke: "#fff", strokeWidth: 1.5 }}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                );
              })}
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <ResponsiveContainer width="100%" height={chartHeight}>
            <AreaChart
              data={chartData}
              margin={{
                top: 12,
                right: 16,
                bottom: continuousMode ? 20 : 4,
                left: -4,
              }}
            >
              <GradientDefs
                id={id}
                towns={continuousMode ? continuousTowns : singleYearTowns}
              />
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(255,255,255,0.05)"
                vertical={false}
              />
              <XAxis
                dataKey="month"
                tick={
                  continuousMode
                    ? continuousAxisTick
                    : { fontFamily: "monospace", fontSize: 10, fill: "rgba(255,255,255,0.35)" }
                }
                axisLine={continuousMode ? { stroke: "rgba(255,255,255,0.35)" } : false}
                tickLine={continuousMode ? { stroke: "rgba(255,255,255,0.25)" } : false}
                interval={0}
                angle={continuousMode ? -40 : 0}
                textAnchor={continuousMode ? "end" : "middle"}
                height={continuousMode ? 52 : 30}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontFamily: "monospace", fontSize: 10, fill: "rgba(255,255,255,0.35)" }}
                axisLine={false}
                tickLine={false}
                width={28}
              />
              <Tooltip {...tooltipStyle} formatter={tooltipFormatter} />
              {[...(continuousMode ? continuousTowns : singleYearTowns)].reverse().map((town) => {
                const color = STATS_TOWN_COLOR[town];
                return (
                  <Area
                    key={town}
                    type="monotone"
                    dataKey={town}
                    name={town}
                    stroke={color}
                    strokeWidth={2}
                    fill={`url(#${id}-grad-${town})`}
                    dot={(props) => (
                      <Dot3D
                        key={`dot-${town}-${props.index}`}
                        cx={props.cx}
                        cy={props.cy}
                        fill={color}
                        r={continuousMode ? 3 : 4}
                      />
                    )}
                    activeDot={{ r: 6, fill: color, stroke: "#fff", strokeWidth: 1.5 }}
                    connectNulls={false}
                    style={{ filter: `drop-shadow(0 0 5px ${color}44)` }}
                  />
                );
              })}
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {chartReady ? (
      <div className="bg-[#0a1020] px-6 py-3 flex flex-wrap items-center justify-between gap-3">
        <p className="font-mono text-[9px] tracking-wide text-white/20">
          {statsActiveLabel(kind)} · All Towns · {viewLabel(visibleYears, timelineMode, monthCount)}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          {legendTowns.map((town) => (
            <div key={town} className="flex items-center gap-1.5">
              <div
                className="w-2 h-2 rounded-full"
                style={{
                  backgroundColor: STATS_TOWN_COLOR[town],
                  boxShadow: `0 0 6px ${STATS_TOWN_COLOR[town]}`,
                }}
              />
              <span
                className="font-mono text-[9px]"
                style={{ color: STATS_TOWN_COLOR[town] }}
              >
                {town}
                {calendarMultiYearMode ? ` ×${visibleYears.length}` : ""}
              </span>
            </div>
          ))}
        </div>
      </div>
      ) : null}
    </div>
  );
}
