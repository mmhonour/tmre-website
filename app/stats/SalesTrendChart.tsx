"use client";

import { useEffect, useId, useState } from "react";
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
import { statsByMonthTitle, statsClosedLabel, statsVolumeNoun } from "./stats-labels";

type MonthlyCount = { year: number; month: number; count: number };
type ApiResponse = { city: string; data: MonthlyCount[]; fallback?: boolean };

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
const YEARS = [CURRENT_YEAR - 2, CURRENT_YEAR - 1, CURRENT_YEAR];

const YEAR_CONFIG: Record<number, { stroke: string; fill: string; opacity: number; width: number }> =
  {
    [CURRENT_YEAR - 2]: { stroke: "#94a3b8", fill: "#94a3b8", opacity: 0.12, width: 1.5 },
    [CURRENT_YEAR - 1]: { stroke: "#D4AF37", fill: "#D4AF37", opacity: 0.18, width: 2.5 },
    [CURRENT_YEAR]: { stroke: "#5ba08a", fill: "#5ba08a", opacity: 0.28, width: 3 },
  };

function buildChartData(data: MonthlyCount[]) {
  return MONTHS.map((name, i) => {
    const row: Record<string, string | number> = { month: name };
    YEARS.forEach((yr) => {
      const found = data.find((d) => d.year === yr && d.month === i + 1);
      const isFuture = yr === CURRENT_YEAR && i + 1 > new Date().getMonth() + 1;
      row[yr] = isFuture ? 0 : (found?.count ?? 0);
    });
    return row;
  });
}

function GradientDefs({ id }: { id: string }) {
  return (
    <defs>
      {YEARS.map((yr) => {
        const cfg = YEAR_CONFIG[yr];
        return (
          <linearGradient key={yr} id={`${id}-grad-${yr}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={cfg.fill} stopOpacity={cfg.opacity * 2.2} />
            <stop offset="60%" stopColor={cfg.fill} stopOpacity={cfg.opacity * 0.6} />
            <stop offset="100%" stopColor={cfg.fill} stopOpacity={0} />
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
  r = 5,
}: {
  cx?: number;
  cy?: number;
  fill: string;
  r?: number;
}) {
  if (cx == null || cy == null) return null;
  return (
    <g>
      <circle cx={cx} cy={cy} r={r + 3} fill={fill} opacity={0.15} />
      <circle cx={cx} cy={cy} r={r} fill={fill} opacity={0.9} />
      <circle cx={cx - r * 0.3} cy={cy - r * 0.3} r={r * 0.35} fill="#fff" opacity={0.55} />
    </g>
  );
}

type MarketStats = { activeCount: number; medianPrice: number | null };

function trailingAvg(data: MonthlyCount[]): number | null {
  const now = new Date();
  const counts: number[] = [];
  for (let offset = 1; offset <= 3; offset++) {
    const d = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const entry = data.find((e) => e.year === d.getFullYear() && e.month === d.getMonth() + 1);
    if (entry) counts.push(entry.count);
  }
  if (!counts.length) return null;
  return counts.reduce((a, b) => a + b, 0) / counts.length;
}

function cacheKey(city: StatsCity, kind: StatsKind): string {
  return `${city}:${kind}`;
}

export default function SalesTrendChart({
  city,
  kind,
}: {
  city: StatsCity;
  kind: StatsKind;
}) {
  const id = useId().replace(/:/g, "");
  const [cache, setCache] = useState<Partial<Record<string, MonthlyCount[]>>>({});
  const [fallbacks, setFallbacks] = useState<Partial<Record<string, boolean>>>({});
  const [loading, setLoading] = useState(false);
  const [statsCache, setStatsCache] = useState<Partial<Record<string, MarketStats | null>>>({});

  const key = cacheKey(city, kind);

  useEffect(() => {
    if (cache[key]) return;
    setLoading(true);

    const kindParam = `&kind=${kind}`;

    if (city === "All") {
      Promise.all(
        TOWN_LIST.map((t) =>
          fetch(`/api/sales-by-month?city=${encodeURIComponent(t)}${kindParam}`, {
            cache: "no-store",
          })
            .then((r) => r.json() as Promise<ApiResponse>)
            .catch(() => null),
        ),
      ).then((results) => {
        const totals = new Map<string, number>();
        let anyFallback = false;
        for (const res of results) {
          if (!res) continue;
          if (res.fallback) anyFallback = true;
          for (const { year, month, count } of res.data) {
            const k = `${year}-${month}`;
            totals.set(k, (totals.get(k) ?? 0) + count);
          }
        }
        const combined: MonthlyCount[] = [];
        for (const yr of YEARS) {
          for (let mo = 1; mo <= 12; mo++) {
            combined.push({ year: yr, month: mo, count: totals.get(`${yr}-${mo}`) ?? 0 });
          }
        }
        setCache((prev) => ({ ...prev, [key]: combined }));
        setFallbacks((prev) => ({ ...prev, [key]: anyFallback }));
        setLoading(false);
      });
    } else {
      fetch(`/api/sales-by-month?city=${encodeURIComponent(city)}${kindParam}`, {
        cache: "no-store",
      })
        .then((r) => r.json() as Promise<ApiResponse>)
        .then((d) => {
          setCache((prev) => ({ ...prev, [key]: d.data }));
          setFallbacks((prev) => ({ ...prev, [key]: !!d.fallback }));
          setLoading(false);
        })
        .catch(() => setLoading(false));
    }
  }, [city, kind, key, cache]);

  useEffect(() => {
    if (statsCache[key] !== undefined) return;
    const kindParam = `&kind=${kind}`;
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
        setStatsCache((prev) => ({ ...prev, [key]: { activeCount: total, medianPrice: null } }));
      });
    } else {
      fetch(`/api/market-stats?city=${encodeURIComponent(city)}${kindParam}`, {
        cache: "no-store",
      })
        .then((r) => (r.ok ? (r.json() as Promise<MarketStats>) : null))
        .then((d) => setStatsCache((prev) => ({ ...prev, [key]: d })))
        .catch(() => setStatsCache((prev) => ({ ...prev, [key]: null })));
    }
  }, [city, kind, key, statsCache]);

  const data = cache[key] ?? [];
  const isFallback = fallbacks[key] ?? false;
  const chartData = buildChartData(data);

  const activeCount = statsCache[key]?.activeCount ?? null;
  const avgClosings = trailingAvg(data);
  const monthsSupply =
    activeCount && avgClosings && avgClosings > 0 ? activeCount / avgClosings : null;
  const supplyColor =
    monthsSupply == null
      ? "text-white/40"
      : monthsSupply <= 2
        ? "text-coral"
        : monthsSupply <= 4
          ? "text-gold"
          : "text-sage";
  const supplyLabel =
    monthsSupply == null
      ? null
      : monthsSupply <= 2
        ? "Seller's market"
        : monthsSupply <= 4
          ? "Balanced"
          : "Buyer's market";

  return (
    <div className="rounded-2xl overflow-hidden border border-white/10 shadow-2xl shadow-navy/30">
      <div className="bg-[#0f1628] px-6 pt-6 pb-2">
        <div className="flex items-start justify-between mb-5 gap-4 flex-wrap">
          <div>
            <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-white/40 mb-1">
              {statsByMonthTitle(kind)}
            </p>
            <p className="font-serif text-xl text-white">
              {city === "All" ? "All Towns" : `${city}, CT`} · {YEARS[0]}{" "}
              <span className="text-white/40">·</span>{" "}
              <span className="text-gold">{YEARS[1]}</span>{" "}
              <span className="text-white/40">·</span>{" "}
              <span className="text-sage">{YEARS[2]}</span>
            </p>
          </div>
          <div className="flex items-center gap-5">
            <div className="text-right">
              <p className="font-mono text-[9px] tracking-[0.2em] uppercase text-white/30 mb-0.5">
                {kind === "rental" ? "Months of supply" : "Months supply"}
              </p>
              <p
                className={`font-mono text-2xl tabular-nums font-medium leading-none ${supplyColor}`}
              >
                {monthsSupply != null ? monthsSupply.toFixed(1) : "—"}
              </p>
              {supplyLabel && (
                <p className={`font-mono text-[9px] tracking-wide mt-0.5 ${supplyColor}`}>
                  {supplyLabel}
                </p>
              )}
            </div>

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

        <div className="flex items-center gap-6 mb-4">
          {YEARS.map((yr) => {
            const cfg = YEAR_CONFIG[yr];
            return (
              <div key={yr} className="flex items-center gap-2">
                <div className="flex items-center gap-1">
                  <div
                    className="h-px w-6 rounded"
                    style={{ backgroundColor: cfg.stroke, opacity: 0.8 }}
                  />
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: cfg.stroke, boxShadow: `0 0 6px ${cfg.stroke}` }}
                  />
                </div>
                <span className="font-mono text-[10px]" style={{ color: cfg.stroke }}>
                  {yr}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-[#0f1628] px-2 pb-4">
        {loading && !data.length ? (
          <div className="h-72 flex items-center justify-center">
            <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-white/30 animate-pulse">
              Loading chart…
            </span>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={chartData} margin={{ top: 12, right: 16, bottom: 4, left: -4 }}>
              <GradientDefs id={id} />
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
                formatter={(value, name) =>
                  !value
                    ? ["—", String(name)]
                    : [`${value} ${statsVolumeNoun(kind)}`, String(name)]
                }
                cursor={{ stroke: "rgba(255,255,255,0.08)", strokeWidth: 1 }}
              />
              {[...YEARS].reverse().map((yr) => {
                const cfg = YEAR_CONFIG[yr];
                return (
                  <Area
                    key={yr}
                    type="monotone"
                    dataKey={yr}
                    stroke={cfg.stroke}
                    strokeWidth={cfg.width}
                    fill={`url(#${id}-grad-${yr})`}
                    dot={(props) => (
                      <Dot3D
                        key={`dot-${props.index}`}
                        cx={props.cx}
                        cy={props.cy}
                        fill={cfg.stroke}
                        r={yr === CURRENT_YEAR ? 5 : yr === CURRENT_YEAR - 1 ? 4 : 3}
                      />
                    )}
                    activeDot={{ r: 7, fill: cfg.stroke, stroke: "#fff", strokeWidth: 1.5 }}
                    connectNulls={false}
                    strokeDasharray={yr === CURRENT_YEAR - 2 ? "5 3" : undefined}
                    style={{ filter: `drop-shadow(0 0 6px ${cfg.stroke}55)` }}
                  />
                );
              })}
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="bg-[#0a1020] px-6 py-3">
        <p className="font-mono text-[9px] tracking-wide text-white/20 text-right">
          {statsClosedLabel(kind)} · {city === "All" ? "All Towns" : `${city}, CT`} · {CURRENT_YEAR} partial
          year
        </p>
      </div>
    </div>
  );
}
