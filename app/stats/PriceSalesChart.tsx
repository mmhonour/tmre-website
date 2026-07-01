"use client";

import { useEffect, useId, useMemo, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { StatsCity, StatsKind } from "./stats-towns";
import { TOWN_LIST } from "./stats-towns";
import {
  statsByPriceTitle,
  statsClosedLabel,
  statsClosePriceLabel,
  statsPriceBandLabel,
  statsVolumeNoun,
} from "./stats-labels";

type BucketRow = {
  id: string;
  label: string;
  count: number;
  share: number;
};

type ApiResponse = {
  city: string;
  period: string;
  totalSales: number;
  knownPrice: number;
  unknownPrice: number;
  buckets: BucketRow[];
  topBucket: BucketRow | null;
  fallback?: boolean;
};

const LINE_STROKE = "#D4AF37";
const DOT_DEFAULT = "#5ba08a";
const DOT_TOP = "#D4AF37";

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
      <ellipse cx={cx + 1.5} cy={cy + 2.5} rx={radius + 2} ry={radius * 0.55} fill="#000" opacity={0.22} />
      <circle cx={cx} cy={cy} r={radius + 3} fill={fill} opacity={0.14} />
      <circle cx={cx} cy={cy} r={radius} fill={fill} opacity={0.95} />
      <circle cx={cx - radius * 0.3} cy={cy - radius * 0.3} r={radius * 0.35} fill="#fff" opacity={0.55} />
    </g>
  );
}

export default function PriceSalesChart({
  city,
  kind,
  selectedBucketId = null,
  onBucketClick,
}: {
  city: StatsCity;
  kind: StatsKind;
  selectedBucketId?: string | null;
  onBucketClick?: (bucket: { id: string; label: string }) => void;
}) {
  const id = useId().replace(/:/g, "");
  const [cache, setCache] = useState<Partial<Record<string, ApiResponse>>>({});
  const [loading, setLoading] = useState(false);
  const key = `${city}:${kind}`;

  useEffect(() => {
    if (cache[key]) return;
    setLoading(true);

    const url =
      city === "All"
        ? `/api/sales-by-price?city=All&kind=${kind}`
        : `/api/sales-by-price?city=${encodeURIComponent(city)}&kind=${kind}`;

    fetch(url, { cache: "no-store" })
      .then((r) => r.json() as Promise<ApiResponse>)
      .then((d) => {
        setCache((prev) => ({ ...prev, [key]: d }));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [city, kind, key, cache]);

  const payload = cache[key];
  const topId = payload?.topBucket?.id ?? null;

  const selectBucket = (row: BucketRow) => {
    onBucketClick?.({ id: row.id, label: row.label });
  };

  const chartData = useMemo(
    () =>
      (payload?.buckets ?? []).map((b) => ({
        ...b,
        isTop: b.id === topId,
        isSelected: b.id === selectedBucketId,
      })),
    [payload?.buckets, topId, selectedBucketId],
  );

  const isFallback = payload?.fallback ?? false;
  const isRental = kind === "rental";
  const volumeNoun = statsVolumeNoun(kind);
  const volumeNounCap = volumeNoun.charAt(0).toUpperCase() + volumeNoun.slice(1);

  return (
    <div className="rounded-2xl overflow-hidden border border-white/10 shadow-2xl shadow-navy/30">
      <div className="bg-[#0f1628] px-6 pt-6 pb-2">
        <div className="flex items-start justify-between mb-5 gap-4 flex-wrap">
          <div>
            <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-white/40 mb-1">
              {statsByPriceTitle(kind)}
            </p>
            <p className="font-serif text-xl text-white">
              {city === "All" ? "All Towns" : `${city}, CT`}
              {payload?.period ? (
                <>
                  {" "}
                  <span className="text-white/40">·</span>{" "}
                  <span className="text-gold">{payload.period}</span> closed
                </>
              ) : null}
            </p>
            {payload?.topBucket && (
              <p className="mt-2 font-mono text-[11px] text-white/50">
                Top {isRental ? "rent" : "price"} band:{" "}
                <span className="text-gold">{payload.topBucket.label}</span>
                {" · "}
                {payload.topBucket.count.toLocaleString()} {volumeNoun}
                {payload.knownPrice > 0 && (
                  <> ({Math.round(payload.topBucket.share * 100)}%)</>
                )}
              </p>
            )}
            {onBucketClick && (
              <p className="mt-1 font-mono text-[10px] text-white/35">
                Click a data point or price band to view underlying {volumeNoun}
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

      <div className="bg-[#0f1628] px-2 pb-4">
        {loading && !payload ? (
          <div className="h-72 flex items-center justify-center">
            <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-white/30 animate-pulse">
              Loading chart…
            </span>
          </div>
        ) : chartData.length === 0 ? (
          <div className="h-72 flex items-center justify-center">
            <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-white/30">
              No price data
            </span>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart data={chartData} margin={{ top: 16, right: 16, bottom: 8, left: 4 }}>
              <defs>
                <linearGradient id={`${id}-price-line-grad`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={LINE_STROKE} stopOpacity={0.38} />
                  <stop offset="55%" stopColor={LINE_STROKE} stopOpacity={0.12} />
                  <stop offset="100%" stopColor={LINE_STROKE} stopOpacity={0} />
                </linearGradient>
                <linearGradient id={`${id}-price-depth`} x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#475569" stopOpacity={0.08} />
                  <stop offset="50%" stopColor={LINE_STROKE} stopOpacity={0.06} />
                  <stop offset="100%" stopColor="#5ba08a" stopOpacity={0.08} />
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
                  const row = item.payload as BucketRow;
                  const pct =
                    payload && payload.knownPrice > 0
                      ? Math.round(row.share * 100)
                      : null;
                  return [
                    pct != null ? `${value} ${volumeNoun} (${pct}%)` : `${value} ${volumeNoun}`,
                    isRental ? "Closed lease" : "Closed",
                  ];
                }}
                cursor={{ stroke: "rgba(255,255,255,0.08)", strokeWidth: 1 }}
              />
              <Area
                type="linear"
                dataKey="count"
                stroke="transparent"
                fill={`url(#${id}-price-depth)`}
                fillOpacity={1}
                connectNulls
                isAnimationActive={false}
              />
              <Area
                type="linear"
                dataKey="count"
                stroke="transparent"
                fill={`url(#${id}-price-line-grad)`}
                fillOpacity={1}
                connectNulls
                isAnimationActive={false}
              />
              <Line
                type="linear"
                dataKey="count"
                stroke="rgba(0,0,0,0.35)"
                strokeWidth={5}
                dot={false}
                activeDot={false}
                connectNulls
                isAnimationActive={false}
              />
              <Line
                type="linear"
                dataKey="count"
                stroke={LINE_STROKE}
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
                connectNulls
                isAnimationActive={false}
                onClick={(row) => {
                  const bucket = row as BucketRow;
                  if (bucket?.id) selectBucket(bucket);
                }}
                dot={(props) => {
                  const row = chartData[props.index];
                  const fill = row?.isSelected
                    ? "#fff"
                    : row?.isTop
                      ? DOT_TOP
                      : DOT_DEFAULT;
                  return (
                    <g
                      key={`price-dot-${props.index}`}
                      onClick={() => row && selectBucket(row)}
                      style={{ cursor: onBucketClick ? "pointer" : undefined }}
                    >
                      <Dot3D
                        cx={props.cx}
                        cy={props.cy}
                        fill={fill}
                        r={row?.isSelected ? 7 : row?.isTop ? 6 : 5}
                        highlight={row?.isSelected || row?.isTop}
                      />
                    </g>
                  );
                }}
                activeDot={{
                  r: 8,
                  fill: LINE_STROKE,
                  stroke: "#fff",
                  strokeWidth: 1.5,
                  cursor: onBucketClick ? "pointer" : undefined,
                }}
                style={{ filter: `drop-shadow(0 0 10px ${LINE_STROKE}77)` }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      {chartData.length > 0 && (
        <div className="bg-[#0f1628] px-4 sm:px-6 pb-5 border-t border-white/[0.06]">
          <p className="font-mono text-[10px] tracking-[0.15em] uppercase text-white/35 mb-3 pt-4">
            {statsByPriceTitle(kind)} band
          </p>
          <div className="overflow-x-auto rounded-xl border border-white/[0.08]">
            <table className="w-full text-left min-w-[320px]">
              <thead>
                <tr className="border-b border-white/[0.08] bg-white/[0.03]">
                  <th className="px-4 py-3 font-mono text-[9px] tracking-[0.15em] uppercase text-white/40">
                    {statsPriceBandLabel(kind)}
                  </th>
                  <th className="px-4 py-3 font-mono text-[9px] tracking-[0.15em] uppercase text-white/40 text-right">
                    {volumeNounCap}
                  </th>
                  <th className="px-4 py-3 font-mono text-[9px] tracking-[0.15em] uppercase text-white/40 text-right">
                    Share
                  </th>
                </tr>
              </thead>
              <tbody>
                {chartData.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => onBucketClick && selectBucket(row)}
                    className={`border-b border-white/[0.05] last:border-0 ${
                      row.isSelected
                        ? "bg-white/[0.08]"
                        : row.isTop
                          ? "bg-gold/[0.06]"
                          : ""
                    } ${onBucketClick ? "cursor-pointer hover:bg-white/[0.05]" : ""}`}
                  >
                    <td
                      className={`px-4 py-3 text-sm ${
                        row.isSelected
                          ? "text-white font-medium"
                          : row.isTop
                            ? "text-gold font-medium"
                            : "text-white/85"
                      }`}
                    >
                      {row.label}
                    </td>
                    <td
                      className={`px-4 py-3 font-mono text-sm tabular-nums text-right ${
                        row.isSelected
                          ? "text-white font-medium"
                          : row.isTop
                            ? "text-gold font-medium"
                            : "text-white"
                      }`}
                    >
                      {row.count.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 font-mono text-sm tabular-nums text-right text-white/50">
                      {payload && payload.knownPrice > 0
                        ? `${Math.round(row.share * 100)}%`
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
              {payload && (
                <tfoot>
                  <tr className="border-t border-white/[0.08] bg-white/[0.03]">
                    <td className="px-4 py-3 font-mono text-[10px] tracking-wide uppercase text-white/45">
                      Total
                    </td>
                    <td className="px-4 py-3 font-mono text-sm tabular-nums text-right text-white font-medium">
                      {payload.totalSales.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 font-mono text-[10px] tabular-nums text-right text-white/45">
                      {payload.unknownPrice > 0
                        ? `${payload.unknownPrice} unpriced`
                        : "100%"}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      <div className="bg-[#0a1020] px-6 py-3 flex flex-wrap items-center justify-between gap-3">
        <p className="font-mono text-[9px] tracking-wide text-white/20">
          {statsClosePriceLabel(kind)} ·{" "}
          {payload?.totalSales?.toLocaleString() ?? "—"}{" "}
          {statsClosedLabel(kind)}
          {payload && payload.unknownPrice > 0
            ? ` · ${payload.unknownPrice} missing price`
            : ""}
        </p>
        {city === "All" && (
          <p className="font-mono text-[9px] tracking-wide text-white/20">
            {TOWN_LIST.length} towns aggregated
          </p>
        )}
      </div>
    </div>
  );
}
