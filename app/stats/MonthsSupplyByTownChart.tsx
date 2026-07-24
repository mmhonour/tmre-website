"use client";

import { useEffect, useId, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { defaultStatsMonthCompareYears } from "@/lib/stats-month-years";
import { pillClass, sortYears } from "./stats-month-chart-utils";
import { TOWN_LIST, type StatsKind, type Town } from "./stats-towns";
import { statsMonthsSupplyByMonthTownTitle } from "./stats-labels";
import { STATS_TOWN_COLOR } from "./stats-town-colors";
import { useStatsChartReady } from "./stats-chart-frame-context";

type MonthlyCount = { year: number; month: number; count: number };

const CURRENT_YEAR = new Date().getFullYear();
const COMPARE_YEARS = defaultStatsMonthCompareYears();

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

type MonthSlot = { year: number; month: number; label: string };

function buildMonthSlots(years: readonly number[]): MonthSlot[] {
  const slots: MonthSlot[] = [];
  for (const yr of sortYears(years)) {
    for (let month = 1; month <= 12; month++) {
      if (isFutureMonth(yr, month)) continue;
      slots.push({ year: yr, month, label: continuousMonthLabel(yr, month) });
    }
  }
  return slots;
}

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

function activeTowns(
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

function formatSupply(n: number): string {
  return n.toFixed(1);
}

function Dot3D({
  cx,
  cy,
  fill,
  r = 3,
}: {
  cx?: number;
  cy?: number;
  fill: string;
  r?: number;
}) {
  if (cx == null || cy == null) return null;
  return (
    <g>
      <circle cx={cx} cy={cy} r={r + 2} fill={fill} opacity={0.15} />
      <circle cx={cx} cy={cy} r={r} fill={fill} opacity={0.9} />
      <circle cx={cx - r * 0.3} cy={cy - r * 0.3} r={r * 0.35} fill="#fff" opacity={0.55} />
    </g>
  );
}

/**
 * All-Towns months supply: one line per town (mirrors upper All Towns control).
 * Fixed to the same 2025/2026 window as the single-town months-supply chart.
 */
export default function MonthsSupplyByTownChart({ kind }: { kind: StatsKind }) {
  const id = useId().replace(/:/g, "");
  const [byTown, setByTown] = useState<Partial<Record<Town, MonthlyCount[]>>>({});
  const [loading, setLoading] = useState(true);
  const [fallback, setFallback] = useState(false);
  const [selectedYears, setSelectedYears] = useState<Set<number>>(
    () => new Set(COMPARE_YEARS),
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/months-supply-by-month/by-town?kind=${kind}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (data: {
          towns?: Partial<Record<Town, MonthlyCount[]>>;
          fallback?: boolean;
        } | null) => {
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

  const visibleYears = useMemo(() => sortYears(selectedYears), [selectedYears]);
  const monthSlots = useMemo(() => buildMonthSlots(visibleYears), [visibleYears]);
  const chartData = useMemo(
    () => buildContinuousChartData(byTown, visibleYears),
    [byTown, visibleYears],
  );
  const towns = useMemo(
    () => activeTowns(byTown, visibleYears),
    [byTown, visibleYears],
  );
  const chartReady = !loading && Object.keys(byTown).length > 0;
  useStatsChartReady(chartReady);

  const toggleYear = (yr: number) => {
    setSelectedYears((prev) => {
      const next = new Set(prev);
      if (next.has(yr)) {
        if (next.size <= 1) return prev;
        next.delete(yr);
      } else {
        next.add(yr);
      }
      return next;
    });
  };

  return (
    <div className="stats-chart-card rounded-2xl overflow-hidden border border-white/10 shadow-2xl shadow-navy/30">
      {chartReady ? (
        <div className="bg-[#0f1628] px-6 pt-6 pb-2">
          <div className="flex items-start justify-between mb-5 gap-4 flex-wrap">
            <div>
              <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-white/40 mb-1">
                {statsMonthsSupplyByMonthTownTitle(kind)}
              </p>
              <p className="font-serif text-xl text-white">
                All Towns ·{" "}
                <span style={{ color: STATS_TOWN_COLOR.Westport }}>
                  {monthSlots.length} months
                </span>
              </p>
              <p className="mt-1 font-mono text-[10px] tracking-wide text-white/35">
                One line per town · end-of-month active ÷ trailing 3-mo avg{" "}
                {kind === "rental" ? "leases" : "closings"} · {visibleYears.join(", ")}
              </p>
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

          <div className="stats-chart-interactive stats-print-screen-only flex flex-wrap items-center gap-2 mb-4">
            <span className="font-mono text-[9px] tracking-[0.15em] uppercase text-white/30 shrink-0">
              Compare years
            </span>
            {COMPARE_YEARS.map((yr) => {
              const active = selectedYears.has(yr);
              return (
                <button
                  key={yr}
                  type="button"
                  onClick={() => toggleYear(yr)}
                  aria-pressed={active}
                  className={pillClass(active)}
                >
                  {yr}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="bg-[#0f1628] px-2 pb-4">
        {loading && !Object.keys(byTown).length ? (
          <div className="h-80 flex items-center justify-center">
            <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-white/30 animate-pulse">
              Loading chart…
            </span>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={360}>
            <AreaChart
              data={chartData}
              margin={{ top: 12, right: 16, bottom: 20, left: -4 }}
            >
              <defs>
                {towns.map((town) => {
                  const color = STATS_TOWN_COLOR[town];
                  return (
                    <linearGradient
                      key={town}
                      id={`${id}-grad-${town}`}
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop offset="0%" stopColor={color} stopOpacity={0.28} />
                      <stop offset="60%" stopColor={color} stopOpacity={0.1} />
                      <stop offset="100%" stopColor={color} stopOpacity={0} />
                    </linearGradient>
                  );
                })}
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(255,255,255,0.05)"
                vertical={false}
              />
              <XAxis
                dataKey="month"
                tick={{
                  fontFamily: "monospace",
                  fontSize: 11,
                  fill: "rgba(255,255,255,0.65)",
                  fontWeight: 600,
                }}
                axisLine={{ stroke: "rgba(255,255,255,0.35)" }}
                tickLine={{ stroke: "rgba(255,255,255,0.25)" }}
                interval={0}
                angle={-40}
                textAnchor="end"
                height={52}
              />
              <YAxis
                allowDecimals
                tick={{ fontFamily: "monospace", fontSize: 10, fill: "rgba(255,255,255,0.35)" }}
                axisLine={false}
                tickLine={false}
                width={32}
                tickFormatter={(v) => formatSupply(Number(v))}
              />
              <Tooltip
                contentStyle={{
                  background: "#1a1f35",
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 12,
                  fontFamily: "monospace",
                  fontSize: 11,
                  color: "#fff",
                }}
                labelStyle={{
                  color: "#D4AF37",
                  marginBottom: 6,
                  textTransform: "uppercase",
                  letterSpacing: "0.15em",
                  fontSize: 10,
                }}
                formatter={(value: unknown, name: unknown) => {
                  const n = typeof value === "number" ? value : Number(value);
                  if (!Number.isFinite(n) || n <= 0) return ["—", String(name)];
                  return [`${formatSupply(n)} mo`, String(name)];
                }}
              />
              {[...towns].reverse().map((town) => {
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
                      />
                    )}
                    activeDot={{ r: 6, fill: color, stroke: "#fff", strokeWidth: 1.5 }}
                    connectNulls={false}
                    isAnimationActive={false}
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
            Months supply · All Towns · {monthSlots.length}-month timeline · by town
          </p>
          <div className="flex flex-wrap items-center gap-3">
            {towns.map((town) => (
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
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
