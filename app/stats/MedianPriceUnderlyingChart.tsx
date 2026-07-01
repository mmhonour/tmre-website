"use client";

import { useId, useMemo } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { classifySalePrice, PRICE_BUCKETS } from "@/lib/price-buckets";
import { classifyRentPrice, RENT_BUCKETS } from "@/lib/rent-buckets";
import type { StatsListingRow } from "@/lib/stats-listing-rows";
import type { StatsKind, Town } from "./stats-towns";
import {
  statsActiveLabel,
  statsClosedLabel,
  statsVolumeNoun,
} from "./stats-labels";

const LINE_STROKE = "#D4AF37";
const DOT_DEFAULT = "#5ba08a";
const DOT_MEDIAN = "#D4AF37";

function fmtAxis(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
}

function fmtTooltip(n: number, kind: StatsKind): string {
  const base =
    n >= 1_000_000
      ? `$${(n / 1_000_000).toFixed(2)}M`
      : n >= 1_000
        ? `$${Math.round(n / 1_000)}K`
        : `$${Math.round(n).toLocaleString()}`;
  return kind === "rental" ? `${base}/mo` : base;
}

function rowChartPrice(
  row: StatsListingRow,
  isActivePool: boolean,
): number | null {
  if (isActivePool) {
    return row.price != null && row.price > 0 ? row.price : null;
  }
  if (row.closedPrice != null && row.closedPrice > 0) return row.closedPrice;
  return null;
}

function Dot3D({
  cx,
  cy,
  fill,
  r = 5,
  highlight = false,
}: {
  cx?: number;
  cy?: number;
  fill: string;
  r?: number;
  highlight?: boolean;
}) {
  if (cx == null || cy == null) return null;
  const radius = highlight ? r + 1 : r;
  return (
    <g style={{ filter: highlight ? `drop-shadow(0 0 8px ${fill}aa)` : undefined }}>
      <circle cx={cx} cy={cy} r={radius + 3} fill={fill} opacity={0.14} />
      <circle cx={cx} cy={cy} r={radius} fill={fill} opacity={0.95} />
      <circle cx={cx - radius * 0.3} cy={cy - radius * 0.3} r={radius * 0.35} fill="#fff" opacity={0.55} />
    </g>
  );
}

export default function MedianPriceUnderlyingChart({
  rows,
  townFilter,
  loading,
  medianPrice,
  kind = "sale",
  listingPool = "closed",
}: {
  rows: StatsListingRow[];
  townFilter: Town | "All";
  loading: boolean;
  medianPrice: number | null;
  kind?: StatsKind;
  listingPool?: "active" | "closed";
}) {
  const id = useId().replace(/:/g, "");
  const isRental = kind === "rental";
  const isActivePool = listingPool === "active";
  const volumeNoun = statsVolumeNoun(kind);

  const scopedRows = useMemo(
    () => (townFilter === "All" ? rows : rows.filter((r) => r.town === townFilter)),
    [rows, townFilter],
  );

  const chartData = useMemo(() => {
    const buckets = isRental ? RENT_BUCKETS : PRICE_BUCKETS;
    const counts = new Map<string, number>();
    for (const b of buckets) counts.set(b.id, 0);

    for (const row of scopedRows) {
      const price = rowChartPrice(row, isActivePool);
      const bucketId = isRental
        ? classifyRentPrice(price)
        : classifySalePrice(price);
      if (bucketId === "unknown") continue;
      counts.set(bucketId, (counts.get(bucketId) ?? 0) + 1);
    }

    const medianBucketId =
      medianPrice != null
        ? isRental
          ? classifyRentPrice(medianPrice)
          : classifySalePrice(medianPrice)
        : null;

    return buckets
      .map((b) => ({
        id: b.id,
        label: b.label,
        count: counts.get(b.id) ?? 0,
        containsMedian: b.id === medianBucketId,
      }))
      .filter((b) => b.count > 0);
  }, [scopedRows, isRental, isActivePool, medianPrice]);

  const scopeLabel =
    townFilter === "All" ? "All towns" : `${townFilter}, CT`;
  const poolLabel = isActivePool ? statsActiveLabel(kind) : statsClosedLabel(kind);

  return (
    <div className="mb-8 rounded-2xl overflow-hidden border border-white/10 shadow-2xl shadow-navy/30">
      <div className="bg-[#0f1628] px-6 pt-6 pb-2">
        <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-white/40 mb-1">
          {isRental ? "Median closed rent distribution" : "Median closed price distribution"}
        </p>
        <p className="font-serif text-xl text-white">
          {scopeLabel}
          {medianPrice != null ? (
            <>
              {" "}
              <span className="text-white/40">·</span>{" "}
              <span className="text-gold">{fmtTooltip(medianPrice, kind)}</span> median
            </>
          ) : null}
        </p>
        <p className="mt-2 font-mono text-[11px] text-white/50">
          {poolLabel} in this view
          {scopedRows.length > 0 && (
            <>
              {" "}
              · {scopedRows.length.toLocaleString()} {volumeNoun}
            </>
          )}
        </p>
      </div>

      <div className="bg-[#0f1628] px-2 pb-4">
        {loading ? (
          <div className="h-64 flex items-center justify-center">
            <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-white/30 animate-pulse">
              Loading chart…
            </span>
          </div>
        ) : chartData.length === 0 ? (
          <div className="h-64 flex items-center justify-center">
            <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-white/30">
              No price data for chart
            </span>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={chartData} margin={{ top: 16, right: 16, bottom: 8, left: 4 }}>
              <defs>
                <linearGradient id={`${id}-median-grad`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={LINE_STROKE} stopOpacity={0.38} />
                  <stop offset="55%" stopColor={LINE_STROKE} stopOpacity={0.12} />
                  <stop offset="100%" stopColor={LINE_STROKE} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(255,255,255,0.05)"
                vertical={false}
              />
              <XAxis
                dataKey="label"
                tick={{ fontFamily: "monospace", fontSize: 8, fill: "rgba(255,255,255,0.35)" }}
                axisLine={false}
                tickLine={false}
                interval={0}
                angle={-32}
                textAnchor="end"
                height={64}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontFamily: "monospace", fontSize: 10, fill: "rgba(255,255,255,0.35)" }}
                axisLine={false}
                tickLine={false}
                width={36}
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
                  const row = item.payload as { containsMedian?: boolean };
                  const suffix = row.containsMedian ? " · median band" : "";
                  return [`${value} ${volumeNoun}${suffix}`, isRental ? "Rent band" : "Price band"];
                }}
                cursor={{ stroke: "rgba(255,255,255,0.08)", strokeWidth: 1 }}
              />
              <Area
                type="monotone"
                dataKey="count"
                stroke="transparent"
                fill={`url(#${id}-median-grad)`}
                fillOpacity={1}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="count"
                stroke={LINE_STROKE}
                strokeWidth={3}
                dot={(props) => {
                  const row = chartData[props.index];
                  return (
                    <Dot3D
                      key={`median-u-dot-${props.index}`}
                      cx={props.cx}
                      cy={props.cy}
                      fill={row?.containsMedian ? DOT_MEDIAN : DOT_DEFAULT}
                      r={row?.containsMedian ? 6 : 5}
                      highlight={row?.containsMedian}
                    />
                  );
                }}
                activeDot={{ r: 7, fill: LINE_STROKE, stroke: "#fff", strokeWidth: 1.5 }}
                style={{ filter: `drop-shadow(0 0 8px ${LINE_STROKE}66)` }}
              />
              {medianPrice != null && chartData.some((b) => b.containsMedian) ? (
                <ReferenceLine
                  x={chartData.find((b) => b.containsMedian)?.label}
                  stroke="rgba(255,255,255,0.25)"
                  strokeDasharray="4 4"
                />
              ) : null}
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="bg-[#0a1020] px-6 py-3">
        <p className="font-mono text-[9px] tracking-wide text-white/20">
          {isRental ? "Rent" : "Price"} bands from underlying {volumeNoun}
          {medianPrice != null ? ` · median ${fmtTooltip(medianPrice, kind)}` : ""}
        </p>
      </div>
    </div>
  );
}
