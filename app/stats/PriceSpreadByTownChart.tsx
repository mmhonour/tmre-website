"use client";

import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { StatsCalcTooltipShell } from "./StatsCalcTooltip";
import { useStatsChartReady } from "./stats-chart-frame-context";
import {
  fetchPriceSpreadRows,
  formatSpreadMoney,
  formatSpreadPct,
  type PriceSpreadRow,
} from "./price-spread-data";
import { statsPriceSpreadTitle } from "./stats-labels";
import type { StatsCity, StatsKind } from "./stats-towns";

const MEDIAN_FILL = "#6B7C9B";
const DELTA_FILL = "#7A6A8A";

/**
 * Median, average and the gap between them, per town.
 *
 * Drawn as one stacked bar rather than two: the median is the base, the delta
 * sits on top of it, and the two together reach the average. That way the gap
 * is a length you can compare across towns instead of a subtraction you do in
 * your head from two separate bars.
 */
export default function PriceSpreadByTownChart({
  kind,
  selectedCity = "All",
}: {
  kind: StatsKind;
  /** Town in focus, held at full strength while the rest dim. */
  selectedCity?: StatsCity;
}) {
  const [loaded, setLoaded] = useState<{
    kind: StatsKind;
    rows: PriceSpreadRow[];
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchPriceSpreadRows(kind).then((rows) => {
      if (!cancelled) setLoaded({ kind, rows });
    });
    return () => {
      cancelled = true;
    };
  }, [kind]);

  const loading = loaded?.kind !== kind;
  const rows = loading ? [] : (loaded?.rows ?? []);
  const chartReady = !loading && rows.length > 0;
  useStatsChartReady(chartReady);

  const noun = kind === "rental" ? "leases" : "sales";

  return (
    <div className="stats-chart-card rounded-2xl overflow-hidden border border-white/10 shadow-2xl shadow-navy/30">
      {chartReady ? (
        <div className="bg-[#0f1628] px-6 pt-6 pb-2">
          <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-white/40 mb-1">
            {statsPriceSpreadTitle(kind)}
          </p>
          <p className="font-serif text-xl text-white">
            Closed {noun} · how far the average runs above the typical one
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
        ) : rows.length === 0 ? (
          <div className="h-72 flex items-center justify-center">
            <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-white/30">
              No closed prices for these towns yet
            </span>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <BarChart
              data={rows}
              margin={{ top: 16, right: 16, bottom: 8, left: 8 }}
              barCategoryGap="22%"
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(255,255,255,0.05)"
                vertical={false}
              />
              <XAxis
                type="category"
                dataKey="town"
                tick={{
                  fontFamily: "monospace",
                  fontSize: 10,
                  fill: "rgba(255,255,255,0.35)",
                }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(v: number) => formatSpreadMoney(v)}
                tick={{
                  fontFamily: "monospace",
                  fontSize: 10,
                  fill: "rgba(255,255,255,0.35)",
                }}
                axisLine={false}
                tickLine={false}
                width={56}
              />
              <Tooltip
                cursor={{ fill: "rgba(255,255,255,0.04)" }}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const row = payload[0]?.payload as PriceSpreadRow | undefined;
                  if (!row) return null;
                  return (
                    <StatsCalcTooltipShell
                      label={String(label ?? row.town)}
                      valueLine={`${formatSpreadMoney(
                        row.medianPrice,
                      )} median · ${formatSpreadMoney(
                        row.averagePrice,
                      )} average · ${formatSpreadMoney(
                        row.priceDelta,
                      )} delta (${formatSpreadPct(row.priceDeltaPct)})`}
                      calc={row.deltaCalc}
                    />
                  );
                }}
              />
              <Bar
                dataKey="medianPrice"
                stackId="price"
                fill={MEDIAN_FILL}
                radius={[0, 0, 4, 4]}
                maxBarSize={72}
              />
              <Bar
                dataKey="priceDelta"
                stackId="price"
                fill={DELTA_FILL}
                radius={[4, 4, 0, 0]}
                maxBarSize={72}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {chartReady ? (
        <div className="bg-[#0a1020] px-6 py-3 flex flex-wrap items-center justify-between gap-3">
          <p className="font-mono text-[9px] tracking-wide text-white/20">
            Sorted lowest median → highest ·{" "}
            {selectedCity === "All" ? "all towns" : selectedCity}
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <span className="flex items-center gap-1.5">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: MEDIAN_FILL }}
              />
              <span className="font-mono text-[9px] text-white/45">Median</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: DELTA_FILL }}
              />
              <span className="font-mono text-[9px] text-white/45">
                Delta to average
              </span>
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
