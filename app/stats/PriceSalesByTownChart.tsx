"use client";

import { useEffect, useId, useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { STATS_CLOSED_PERIOD_START } from "@/lib/stats-listing-rows";
import { loadTabJson } from "@/lib/tab-data-prefetch";
import { pillClass } from "./stats-month-chart-utils";
import { statsByPriceTownTitle, statsVolumeNoun } from "./stats-labels";
import { STATS_TOWN_COLOR } from "./stats-town-colors";
import { TOWN_LIST, type StatsKind, type Town } from "./stats-towns";
import { useStatsChartReady } from "./stats-chart-frame-context";

type BucketRow = {
  id: string;
  label: string;
  count: number;
  share: number;
};

type TownPricePayload = {
  city: string;
  period: string;
  buckets: BucketRow[];
  totalSales: number;
};

type ApiResponse = {
  kind: StatsKind;
  period: string;
  year: number;
  towns: Partial<Record<Town, TownPricePayload>>;
};

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from(
  { length: CURRENT_YEAR - STATS_CLOSED_PERIOD_START + 1 },
  (_, i) => STATS_CLOSED_PERIOD_START + i,
).reverse();

function Dot3D({
  cx,
  cy,
  fill,
  r = 3.5,
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
    </g>
  );
}

export default function PriceSalesByTownChart({ kind }: { kind: StatsKind }) {
  const id = useId().replace(/:/g, "");
  const [year, setYear] = useState(CURRENT_YEAR);
  const [payload, setPayload] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const volumeNoun = statsVolumeNoun(kind);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void loadTabJson<ApiResponse>(
      `/api/sales-by-price/by-town?kind=${kind}&year=${year}`,
    )
      .then((d) => {
        if (cancelled) return;
        setPayload(d);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setPayload(null);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [kind, year]);

  const townsWithData = useMemo(() => {
    const list = TOWN_LIST.filter((town) =>
      (payload?.towns?.[town]?.buckets ?? []).some((b) => b.count > 0),
    );
    return list.length > 0 ? list : [...TOWN_LIST];
  }, [payload]);

  const chartData = useMemo(() => {
    const bands =
      payload?.towns?.[townsWithData[0]!]?.buckets ??
      payload?.towns?.[TOWN_LIST[0]!]?.buckets ??
      [];
    return bands.map((band) => {
      const row: Record<string, string | number> = {
        id: band.id,
        label: band.label,
      };
      for (const town of TOWN_LIST) {
        const match = payload?.towns?.[town]?.buckets?.find((b) => b.id === band.id);
        row[town] = match?.count ?? 0;
      }
      return row;
    });
  }, [payload, townsWithData]);

  const chartReady = !loading && !!payload && chartData.length > 0;
  useStatsChartReady(chartReady);

  return (
    <div className="stats-chart-card rounded-2xl overflow-hidden border border-white/10 shadow-2xl shadow-navy/30">
      {chartReady ? (
        <div className="bg-[#0f1628] px-6 pt-6 pb-2">
          <div className="flex items-start justify-between mb-4 gap-4 flex-wrap">
            <div>
              <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-white/40 mb-1">
                {statsByPriceTownTitle(kind)}
              </p>
              <p className="font-serif text-xl text-white">
                All Towns{" "}
                <span className="text-white/40">·</span>{" "}
                <span className="text-gold">tracking {year}</span>
              </p>
              <p className="mt-2 font-mono text-[11px] text-white/50">
                Closed {volumeNoun} by price band — one line per town
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <div className="flex flex-wrap justify-end gap-1.5">
                {YEAR_OPTIONS.map((y) => (
                  <button
                    key={y}
                    type="button"
                    onClick={() => setYear(y)}
                    className={pillClass(year === y)}
                    aria-pressed={year === y}
                  >
                    {y}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 font-mono text-[10px] tracking-wide text-white/40">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    loading ? "bg-gold animate-pulse-dot" : "bg-sage animate-pulse-dot"
                  }`}
                />
                {loading ? "Loading…" : "Live"}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="bg-[#0f1628] px-2 pb-4">
        {loading && !payload ? (
          <div className="h-80 flex items-center justify-center">
            <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-white/30 animate-pulse">
              Loading chart…
            </span>
          </div>
        ) : chartData.length === 0 ? (
          <div className="h-80 flex items-center justify-center">
            <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-white/30">
              No price data for {year}
            </span>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={360}>
            <LineChart data={chartData} margin={{ top: 16, right: 16, bottom: 8, left: 4 }}>
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
                formatter={(value, name) => [
                  `${Number(value).toLocaleString()} ${volumeNoun}`,
                  String(name),
                ]}
                labelFormatter={(label) => `${label} · ${year}`}
              />
              <Legend
                wrapperStyle={{
                  fontFamily: "monospace",
                  fontSize: 10,
                  color: "rgba(255,255,255,0.55)",
                  paddingTop: 8,
                }}
              />
              {townsWithData.map((town) => (
                <Line
                  key={`${id}-${town}`}
                  type="linear"
                  dataKey={town}
                  name={town}
                  stroke={STATS_TOWN_COLOR[town]}
                  strokeWidth={2.25}
                  dot={(props) => (
                    <Dot3D
                      key={`${town}-dot-${props.index}`}
                      cx={props.cx}
                      cy={props.cy}
                      fill={STATS_TOWN_COLOR[town]}
                    />
                  )}
                  activeDot={{ r: 5, stroke: "#fff", strokeWidth: 1 }}
                  connectNulls
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {chartReady ? (
        <div className="bg-[#0a1020] px-6 py-3 flex flex-wrap items-center justify-between gap-3">
          <p className="font-mono text-[9px] tracking-wide text-white/20">
            Tracking closed {volumeNoun} in {year} · {townsWithData.length} towns
          </p>
          <p className="font-mono text-[9px] tracking-wide text-white/20">
            Year {year}
          </p>
        </div>
      ) : null}
    </div>
  );
}
