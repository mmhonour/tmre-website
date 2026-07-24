"use client";

import { type ReactNode, useEffect, useId, useMemo, useState } from "react";
import { useStatsChartReady } from "./stats-chart-frame-context";
import { useStatsMonthComparisonViewOptional } from "./stats-month-comparison-context";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { TOWN_LIST, type StatsCity, type StatsKind } from "./stats-towns";
import {
  buildContinuousYearChartData,
  buildMonthChartData,
  buildMonthSlots,
  DEFAULT_COMPARE_YEARS,
  Dot3D,
  FULL_CHART_YEARS,
  GradientDefs,
  isFutureCalendarMonth,
  pillClass,
  sortYears,
  yearChartStyle,
  type MonthlyCount,
  type TimelineMode,
} from "./stats-month-chart-utils";
import {
  readPersistedTimelineMode,
  writePersistedTimelineMode,
} from "./stats-view-prefs";
import { fetchStatsMonthData } from "./stats-month-api";

type MarketStats = { activeCount: number; medianPrice: number | null };

function cacheKey(city: StatsCity, kind: StatsKind, apiPath: string): string {
  return `${apiPath}:${city}:${kind}`;
}

export type StatsMonthComparisonChartProps = {
  city: StatsCity;
  kind: StatsKind;
  apiPath: string;
  title: string;
  volumeNoun: string;
  footerNote: string;
  /** Years shown in the chart (defaults to full 2019→current pool). */
  compareYears?: readonly number[];
  /** Initial / fixed selection when year pills are hidden. */
  defaultCompareYears?: readonly number[];
  /** When false, year pills are hidden and selection stays on defaultCompareYears. */
  yearSelectionEnabled?: boolean;
  /** 12-month calendar vs multi-month timeline when two or more years are shown. */
  timelineModeEnabled?: boolean;
  headerMetric?: (ctx: {
    loading: boolean;
    activeCount: number | null;
    data: MonthlyCount[];
  }) => ReactNode;
  /** Skip /api/market-stats when the parent already has active inventory. */
  headerActiveCount?: number | null;
  /** Allow fractional Y values (e.g. months supply). */
  allowYDecimals?: boolean;
  /** Format tooltip metric values (defaults to raw number). */
  formatMetricValue?: (value: number) => string;
};

export default function StatsMonthComparisonChart({
  city,
  kind,
  apiPath,
  title,
  volumeNoun,
  footerNote,
  compareYears = FULL_CHART_YEARS,
  defaultCompareYears = DEFAULT_COMPARE_YEARS,
  yearSelectionEnabled = true,
  timelineModeEnabled = yearSelectionEnabled,
  headerMetric,
  headerActiveCount,
  allowYDecimals = false,
  formatMetricValue,
}: StatsMonthComparisonChartProps) {
  const id = useId().replace(/:/g, "");
  const viewCtx = useStatsMonthComparisonViewOptional();
  const key = cacheKey(city, kind, apiPath);
  const statsKey = cacheKey(city, kind, "market-stats");
  const internalTimelinePrefKey = `tmre_stats_chart_timeline:${apiPath}:${city}:${kind}`;
  const [cache, setCache] = useState<Partial<Record<string, MonthlyCount[]>>>({});
  const [fallbacks, setFallbacks] = useState<Partial<Record<string, boolean>>>({});
  const [loading, setLoading] = useState(false);
  const [statsCache, setStatsCache] = useState<Partial<Record<string, MarketStats | null>>>({});
  const [internalTimelineMode, setInternalTimelineMode] = useState<TimelineMode>(
    () => readPersistedTimelineMode(internalTimelinePrefKey) ?? "calendar",
  );
  const [internalSelectedYears, setInternalSelectedYears] = useState<Set<number>>(
    () => new Set(defaultCompareYears),
  );

  useEffect(() => {
    if (viewCtx) return;
    const stored = readPersistedTimelineMode(internalTimelinePrefKey);
    if (stored) setInternalTimelineMode(stored);
  }, [city, kind, apiPath, internalTimelinePrefKey, viewCtx]);

  useEffect(() => {
    if (viewCtx || !yearSelectionEnabled) return;
    setInternalSelectedYears(new Set(defaultCompareYears));
  }, [city, kind, apiPath, yearSelectionEnabled, defaultCompareYears, viewCtx]);

  const selectedYears = viewCtx?.selectedYears ?? internalSelectedYears;
  const toggleYear =
    viewCtx?.toggleYear ??
    ((yr: number) => {
      if (!yearSelectionEnabled) return;
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
  const setTimelineMode =
    viewCtx?.setTimelineMode ??
    ((mode: TimelineMode) => {
      setInternalTimelineMode(mode);
      writePersistedTimelineMode(internalTimelinePrefKey, mode);
    });

  const visibleYears = viewCtx?.visibleYears ??
    (yearSelectionEnabled ? sortYears(selectedYears) : [...defaultCompareYears]);
  const multiYearMode = viewCtx?.multiYearMode ?? visibleYears.length > 1;
  const continuousMode =
    viewCtx?.continuousMode ??
    (timelineModeEnabled && multiYearMode && timelineMode === "continuous");
  const monthCount =
    viewCtx?.monthCount ??
    buildMonthSlots(visibleYears, isFutureCalendarMonth).length;
  const effectiveYearSelection = viewCtx?.yearSelectionEnabled ?? yearSelectionEnabled;
  const effectiveTimelineModeEnabled = viewCtx?.timelineModeEnabled ?? timelineModeEnabled;
  const effectiveCompareYears = viewCtx?.compareYears ?? compareYears;

  useEffect(() => {
    if (viewCtx || !multiYearMode || timelineMode !== "continuous") return;
    setInternalTimelineMode("calendar");
  }, [multiYearMode, timelineMode, viewCtx]);

  useEffect(() => {
    if (cache[key]) return;
    setLoading(true);

    fetchStatsMonthData(apiPath, city, kind).then((res) => {
      if (!res) {
        setLoading(false);
        return;
      }
      setCache((prev) => ({ ...prev, [key]: res.data }));
      setFallbacks((prev) => ({ ...prev, [key]: !!res.fallback }));
      setLoading(false);
    });
  }, [city, kind, key, cache, apiPath]);

  useEffect(() => {
    if (headerActiveCount != null) {
      setStatsCache((prev) => {
        const existing = prev[statsKey];
        if (
          existing?.activeCount === headerActiveCount &&
          existing?.medianPrice === null
        ) {
          return prev;
        }
        return {
          ...prev,
          [statsKey]: { activeCount: headerActiveCount, medianPrice: null },
        };
      });
      return;
    }

    let cancelled = false;
    const kindParam = `&kind=${kind}`;

    const storeStats = (value: MarketStats | null) => {
      if (cancelled) return;
      setStatsCache((prev) =>
        prev[statsKey] !== undefined ? prev : { ...prev, [statsKey]: value },
      );
    };

    if (city === "All") {
      Promise.all(
        TOWN_LIST.map((t) =>
          fetch(`/api/market-stats?city=${encodeURIComponent(t)}${kindParam}`, {
            cache: "no-store",
          })
            .then((r) => (r.ok ? (r.json() as Promise<MarketStats>) : null))
            .catch(() => null),
        ),
      ).then((results) => {
        const total = results.reduce((sum, r) => sum + (r?.activeCount ?? 0), 0);
        storeStats({ activeCount: total, medianPrice: null });
      });
    } else {
      fetch(`/api/market-stats?city=${encodeURIComponent(city)}${kindParam}`, {
        cache: "no-store",
      })
        .then((r) => (r.ok ? (r.json() as Promise<MarketStats>) : null))
        .then((d) => storeStats(d))
        .catch(() => storeStats(null));
    }

    return () => {
      cancelled = true;
    };
  }, [city, kind, statsKey, headerActiveCount]);

  const data = cache[key] ?? [];
  const isFallback = fallbacks[key] ?? false;
  const chartData = useMemo(
    () =>
      continuousMode
        ? buildContinuousYearChartData(data, visibleYears, isFutureCalendarMonth)
        : buildMonthChartData(data, visibleYears, isFutureCalendarMonth),
    [continuousMode, data, visibleYears],
  );
  const activeCount = statsCache[statsKey]?.activeCount ?? null;
  const chartHeight = continuousMode ? 360 : 300;
  const continuousAxisTick = {
    fontFamily: "monospace",
    fontSize: 11,
    fill: "rgba(255,255,255,0.65)",
    fontWeight: 600,
  };

  const yearSummary = visibleYears.map((yr, i) => {
    const cfg = yearChartStyle(yr);
    return (
      <span key={yr}>
        {i > 0 ? <span className="text-white/40"> · </span> : null}
        <span style={{ color: cfg.stroke }}>{yr}</span>
      </span>
    );
  });

  const cityLabel = city === "All" ? "All Towns" : `${city}, CT`;
  const chartReady = !loading && data.length > 0;
  useStatsChartReady(chartReady);

  return (
    <div className="stats-chart-card rounded-2xl overflow-hidden border border-white/10 shadow-2xl shadow-navy/30">
      {chartReady ? (
      <div className="bg-[#0f1628] px-6 pt-6 pb-2">
        <div className="flex items-start justify-between mb-5 gap-4 flex-wrap">
          <div>
            <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-white/40 mb-1">
              {title}
            </p>
            <p className="font-serif text-xl text-white">
              {cityLabel} ·{" "}
              {continuousMode ? (
                <span>{monthCount} months</span>
              ) : (
                yearSummary
              )}
            </p>
            {continuousMode ? (
              <p className="mt-1 font-mono text-[10px] tracking-wide text-white/35">
                {monthCount}-month timeline · one line per year · {visibleYears.join(", ")}
              </p>
            ) : null}
          </div>
          <div className="flex items-center gap-5">
            {headerMetric ? headerMetric({ loading, activeCount, data }) : null}

            <div className="flex items-center gap-2 font-mono text-[10px] tracking-wide">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  loading
                    ? "bg-gold animate-pulse-dot"
                    : isFallback
                      ? "bg-coral"
                      : "bg-sage animate-pulse-dot"
                }`}
              />
              <span className="text-white/40">
                {loading ? "Loading…" : isFallback ? "Estimated" : "Live"}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-4">
          {effectiveYearSelection ? (
            <>
              <span className="font-mono text-[9px] tracking-[0.15em] uppercase text-white/30 shrink-0">
                Compare years
              </span>
              {effectiveCompareYears.map((yr) => {
                const active = selectedYears.has(yr);
                const cfg = yearChartStyle(yr);
                return (
                  <button
                    key={yr}
                    type="button"
                    onClick={() => toggleYear(yr)}
                    aria-pressed={active}
                    className={`${pillClass(active)} inline-flex items-center gap-1.5`}
                    style={
                      active ? { borderColor: `${cfg.stroke}88`, color: cfg.stroke } : undefined
                    }
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
            </>
          ) : null}
        </div>

        {effectiveTimelineModeEnabled ? (
          <div className="flex flex-wrap items-center gap-3 mb-4">
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
              title={
                multiYearMode ? undefined : "Select two or more years for a multi-month timeline"
              }
            >
              {multiYearMode ? `${monthCount}-month timeline` : "Multi-month timeline"}
            </button>
          </div>
        ) : null}
      </div>
      ) : null}

      <div className="bg-[#0f1628] px-2 pb-4">
        {loading && !data.length ? (
          <div className="h-72 flex items-center justify-center">
            <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-white/30 animate-pulse">
              Loading chart…
            </span>
          </div>
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
              <GradientDefs id={id} years={visibleYears} />
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
                interval={continuousMode ? "preserveStartEnd" : undefined}
                angle={continuousMode ? -40 : 0}
                textAnchor={continuousMode ? "end" : "middle"}
                height={continuousMode ? 52 : 30}
              />
              <YAxis
                allowDecimals={allowYDecimals}
                tick={{ fontFamily: "monospace", fontSize: 10, fill: "rgba(255,255,255,0.35)" }}
                axisLine={false}
                tickLine={false}
                width={allowYDecimals ? 36 : 28}
              />
              <Tooltip
                contentStyle={{
                  background: "#1a1f35",
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 12,
                  fontFamily: "monospace",
                  fontSize: 11,
                  color: "#fff",
                  boxShadow: "0 20px 40px rgba(0,0,0,0.4)",
                }}
                labelStyle={{
                  color: "#D4AF37",
                  marginBottom: 6,
                  textTransform: "uppercase",
                  letterSpacing: "0.15em",
                  fontSize: 10,
                }}
                labelFormatter={(label, payload) => {
                  const slotLabel = payload?.[0]?.payload?.slotLabel;
                  return slotLabel != null ? String(slotLabel) : String(label);
                }}
                formatter={(value, name) => {
                  if (value == null || value === "") return ["—", String(name)];
                  const n = typeof value === "number" ? value : Number(value);
                  if (!Number.isFinite(n) || n === 0) return ["—", String(name)];
                  const display = formatMetricValue
                    ? formatMetricValue(n)
                    : String(n);
                  return [`${display} ${volumeNoun}`, String(name)];
                }}
                cursor={{ stroke: "rgba(255,255,255,0.08)", strokeWidth: 1 }}
              />
              {[...visibleYears].reverse().map((yr) => {
                const cfg = yearChartStyle(yr);
                return (
                  <Area
                    key={yr}
                    type="monotone"
                    dataKey={String(yr)}
                    name={String(yr)}
                    stroke={cfg.stroke}
                    strokeWidth={cfg.width}
                    fill={`url(#${id}-grad-${yr})`}
                    dot={(props) => (
                      <Dot3D
                        key={`dot-${yr}-${props.index}`}
                        cx={props.cx}
                        cy={props.cy}
                        fill={cfg.stroke}
                        r={continuousMode ? Math.max(3, cfg.dotR - 1) : cfg.dotR}
                      />
                    )}
                    activeDot={{ r: 7, fill: cfg.stroke, stroke: "#fff", strokeWidth: 1.5 }}
                    connectNulls={false}
                    strokeDasharray={cfg.dash}
                    style={{ filter: `drop-shadow(0 0 6px ${cfg.stroke}55)` }}
                  />
                );
              })}
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {chartReady ? (
      <div className="bg-[#0a1020] px-6 py-3">
        <p className="font-mono text-[9px] tracking-wide text-white/20 text-right">
          {footerNote}
          {effectiveYearSelection && visibleYears.length < effectiveCompareYears.length
            ? ` · comparing ${visibleYears.join(", ")}`
            : ""}
          {continuousMode ? ` · ${monthCount}-month timeline` : ""}
        </p>
      </div>
      ) : null}
    </div>
  );
}
