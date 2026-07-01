"use client";

import { useId } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { StatsKind, Town } from "./stats-towns";
import { statsActiveLabel } from "./stats-labels";

const TOWN_COLOR: Record<Town, string> = {
  Norwalk: "#38bdf8",
  Westport: "#D4AF37",
  Wilton: "#f97316",
  Fairfield: "#5ba08a",
  Weston: "#818cf8",
  "New Canaan": "#fbbf24",
  Ridgefield: "#fb7185",
};

export type DomPoint = {
  town: Town;
  avgDom: number;
  pace: string;
};

function paceLabel(avgDom: number): string {
  if (avgDom <= 10) return "Moving fast";
  if (avgDom <= 20) return "Steady";
  return "Slower";
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

export default function AvgDomLineChart({
  data,
  loading,
  kind = "sale",
}: {
  data: DomPoint[];
  loading: boolean;
  kind?: StatsKind;
}) {
  const id = useId().replace(/:/g, "");
  const chartData = [...data]
    .filter((d) => d.avgDom > 0)
    .sort((a, b) => a.avgDom - b.avgDom)
    .map((d) => ({
      ...d,
      pace: d.pace || paceLabel(d.avgDom),
      color: TOWN_COLOR[d.town],
    }));

  const stroke = "#5ba08a";

  return (
    <div className="rounded-2xl overflow-hidden border border-white/10 shadow-2xl shadow-navy/30">
      <div className="bg-[#0f1628] px-6 pt-6 pb-2">
        <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-white/40 mb-1">
          Avg days on market
        </p>
        <p className="font-serif text-xl text-white">Lower is faster · by town</p>
      </div>

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
              No DOM data
            </span>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={chartData} margin={{ top: 16, right: 16, bottom: 8, left: 4 }}>
              <defs>
                <linearGradient id={`${id}-dom-grad`} x1="0" y1="0" x2="0" y2="1">
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
                dataKey="town"
                tick={{ fontFamily: "monospace", fontSize: 10, fill: "rgba(255,255,255,0.35)" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontFamily: "monospace", fontSize: 10, fill: "rgba(255,255,255,0.35)" }}
                axisLine={false}
                tickLine={false}
                width={32}
                tickFormatter={(v) => `${v}d`}
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
                formatter={(value, _name, item) => {
                  const pace = (item.payload as { pace?: string }).pace ?? "";
                  return [`${Math.round(Number(value))}d · ${pace}`, "Avg DOM"];
                }}
                cursor={{ stroke: "rgba(255,255,255,0.08)", strokeWidth: 1 }}
              />
              <Area
                type="monotone"
                dataKey="avgDom"
                stroke="transparent"
                fill={`url(#${id}-dom-grad)`}
                fillOpacity={1}
                isAnimationActive
              />
              <Line
                type="monotone"
                dataKey="avgDom"
                stroke={stroke}
                strokeWidth={3}
                dot={(props) => {
                  const row = chartData[props.index];
                  return (
                    <Dot3D
                      key={`dom-dot-${props.index}`}
                      cx={props.cx}
                      cy={props.cy}
                      fill={row?.color ?? stroke}
                      r={chartData.length === 1 ? 6 : 5}
                    />
                  );
                }}
                activeDot={{ r: 7, fill: stroke, stroke: "#fff", strokeWidth: 1.5 }}
                style={{ filter: `drop-shadow(0 0 8px ${stroke}66)` }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="bg-[#0a1020] px-6 py-3 flex flex-wrap items-center justify-between gap-3">
        <p className="font-mono text-[9px] tracking-wide text-white/20">
          Sorted fastest → slowest · {statsActiveLabel(kind)}
        </p>
        <div className="flex flex-wrap items-center gap-4">
          {chartData.map((d) => (
            <div key={d.town} className="flex items-center gap-1.5">
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: d.color, boxShadow: `0 0 6px ${d.color}` }}
              />
              <span className="font-mono text-[9px]" style={{ color: d.color }}>
                {d.town}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
