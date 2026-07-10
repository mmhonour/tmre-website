"use client";

import { useEffect, useId, useState } from "react";
import { useStatsChartReady } from "./stats-chart-frame-context";
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { TOWN_LIST, type StatsKind, type Town } from "./stats-towns";

const TOWN_COLOR: Record<Town, string> = {
  Norwalk: "#38bdf8",
  Westport: "#D4AF37",
  Wilton: "#f97316",
  Fairfield: "#5ba08a",
  Weston: "#818cf8",
  "New Canaan": "#fbbf24",
  Ridgefield: "#fb7185",
};

export type MedianPricePoint = {
  town: Town;
  medianPrice: number;
};

type ChartRow = MedianPricePoint & { color: string };

function fmtAxis(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
}

function fmtTooltip(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n).toLocaleString()}`;
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
      <circle cx={cx} cy={cy} r={r} fill={fill} opacity={0.95} />
      <circle cx={cx - r * 0.3} cy={cy - r * 0.3} r={r * 0.35} fill="#fff" opacity={0.55} />
    </g>
  );
}

export default function MedianPriceBarChart({
  data,
  loading: loadingProp = false,
  onTownClick,
  kind = "sale",
}: {
  data?: MedianPricePoint[];
  loading?: boolean;
  onTownClick?: (town: Town) => void;
  kind?: StatsKind;
}) {
  const id = useId().replace(/:/g, "");
  const stroke = "#D4AF37";
  const [fetchedData, setFetchedData] = useState<ChartRow[]>([]);
  const [fetching, setFetching] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFetching(true);

    Promise.all(
      TOWN_LIST.map((town) =>
        fetch(`/api/market-stats?city=${encodeURIComponent(town)}&kind=${kind}`, {
          cache: "no-store",
        })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null)
          .then((payload: { medianPrice?: number | null } | null) => ({
            town,
            medianPrice:
              typeof payload?.medianPrice === "number" && payload.medianPrice > 0
                ? payload.medianPrice
                : 0,
          })),
      ),
    ).then((rows) => {
      if (cancelled) return;
      setFetchedData(
        rows
          .filter((d) => d.medianPrice > 0)
          .sort((a, b) => a.medianPrice - b.medianPrice)
          .map((d) => ({ ...d, color: TOWN_COLOR[d.town] })),
      );
      setFetching(false);
    });

    return () => {
      cancelled = true;
    };
  }, [kind]);

  const propChartData: ChartRow[] = (data ?? [])
    .filter((d) => d.medianPrice > 0)
    .sort((a, b) => a.medianPrice - b.medianPrice)
    .map((d) => ({ ...d, color: TOWN_COLOR[d.town] }));

  const chartData = propChartData.length > 0 ? propChartData : fetchedData;
  const loading = loadingProp || (propChartData.length === 0 && fetching);
  const chartReady = !loading && chartData.length > 0;
  useStatsChartReady(chartReady);

  return (
    <div className="stats-chart-card rounded-2xl overflow-hidden border border-white/10 shadow-2xl shadow-navy/30">
      {chartReady ? (
      <div className="bg-[#0f1628] px-6 pt-6 pb-2">
        <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-white/40 mb-1">
          {kind === "rental" ? "Median rent by town" : "Median closed price by town"}
        </p>
        <p className="font-serif text-xl text-white">
          Closed {kind === "rental" ? "leases" : "sales"} ·{" "}
          {kind === "rental" ? "closed rent" : "closed price"}
        </p>
      </div>
      ) : null}

      <div className="bg-[#0f1628] px-2 pb-4">
        {loading ? (
          <div className="h-72 flex items-center justify-center">
            <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-white/30 animate-pulse">
              Loading chart…
            </span>
          </div>
        ) : chartData.length === 0 ? (
          <div className="h-72 flex items-center justify-center">
            <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-white/30">
              No median price data
            </span>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart
              data={chartData}
              margin={{ top: 16, right: 16, bottom: 8, left: 8 }}
              barCategoryGap={chartData.length === 1 ? "35%" : "22%"}
            >
              <defs>
                <linearGradient id={`${id}-price-grad`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={stroke} stopOpacity={0.35} />
                  <stop offset="60%" stopColor={stroke} stopOpacity={0.12} />
                  <stop offset="100%" stopColor={stroke} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(255,255,255,0.05)"
                vertical={false}
              />
              <XAxis
                type="category"
                dataKey="town"
                tick={{ fontFamily: "monospace", fontSize: 10, fill: "rgba(255,255,255,0.35)" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={fmtAxis}
                tick={{ fontFamily: "monospace", fontSize: 10, fill: "rgba(255,255,255,0.35)" }}
                axisLine={false}
                tickLine={false}
                width={52}
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
                formatter={(value) => [
                  fmtTooltip(Number(value)),
                  kind === "rental" ? "Median closed rent" : "Median closed price",
                ]}
                cursor={{ fill: "rgba(255,255,255,0.04)" }}
              />
              <Bar dataKey="medianPrice" fill={`url(#${id}-price-grad)`} radius={[8, 8, 0, 0]} maxBarSize={72}>
                {chartData.map((entry) => (
                  <Cell key={entry.town} fill={entry.color} />
                ))}
              </Bar>
              <Line
                type="monotone"
                dataKey="medianPrice"
                stroke={stroke}
                strokeWidth={2}
                dot={(props) => (
                  <Dot3D
                    key={`price-dot-${props.index}`}
                    cx={props.cx}
                    cy={props.cy}
                    fill={chartData[props.index]?.color ?? stroke}
                    r={chartData.length === 1 ? 6 : 5}
                  />
                )}
                activeDot={{ r: 7, fill: stroke, stroke: "#fff", strokeWidth: 1.5 }}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      {chartReady ? (
      <div className="bg-[#0a1020] px-6 py-3 flex flex-wrap items-center justify-between gap-3">
        <p className="font-mono text-[9px] tracking-wide text-white/20">
          Sorted lowest → highest · closed {kind === "rental" ? "leases" : "sales"}
        </p>
        <div className="flex flex-wrap items-center gap-4">
          {chartData.map((d) => (
            <button
              key={d.town}
              type="button"
              onClick={() => onTownClick?.(d.town)}
              disabled={!onTownClick}
              className={`flex items-center gap-1.5 ${
                onTownClick
                  ? "hover:opacity-80 transition-opacity cursor-pointer"
                  : "cursor-default"
              }`}
              aria-label={onTownClick ? `View ${d.town} median price listings` : undefined}
            >
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: d.color, boxShadow: `0 0 6px ${d.color}` }}
              />
              <span className="font-mono text-[9px]" style={{ color: d.color }}>
                {d.town}
              </span>
            </button>
          ))}
        </div>
      </div>
      ) : null}
    </div>
  );
}
