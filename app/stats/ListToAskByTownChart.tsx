"use client";

import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { StatsCalcTooltipShell } from "./StatsCalcTooltip";
import { useStatsChartReady } from "./stats-chart-frame-context";
import {
  fetchListToAskRows,
  formatAskGap,
  formatVsAsk,
  type ListToAskRow,
} from "./list-to-ask-data";
import { statsListToAskTitle } from "./stats-labels";
import type { StatsCity, StatsKind, Town } from "./stats-towns";
import { STATS_TOWN_COLOR } from "./stats-town-colors";

/** Closed over the first ask reads as the seller's end, under it as the buyer's. */
const OVER_ASK = "#5ba08a";
const UNDER_ASK = "#c45c4a";

export default function ListToAskByTownChart({
  kind,
  selectedCity = "All",
  onTownData,
}: {
  kind: StatsKind;
  /** Town in focus, dimmed against the rest when one is picked. */
  selectedCity?: StatsCity;
  /** Opens the supporting by-town table. Pass a town to highlight that row. */
  onTownData?: (town?: Town) => void;
}) {
  // Held with the kind it was fetched for, so switching tabs reads as loading
  // without an extra setState on the way in.
  const [loaded, setLoaded] = useState<{
    kind: StatsKind;
    rows: ListToAskRow[];
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchListToAskRows(kind).then((rows) => {
      if (!cancelled) setLoaded({ kind, rows });
    });
    return () => {
      cancelled = true;
    };
  }, [kind]);

  const loading = loaded?.kind !== kind;
  const rows = loading ? [] : (loaded?.rows ?? []);
  /** Frame chrome (title + Show town data) once the fetch settles, even if empty. */
  const chartReady = !loading;
  useStatsChartReady(chartReady);

  const noun = kind === "rental" ? "leases" : "sales";

  return (
    <div className="stats-chart-card rounded-2xl overflow-hidden border border-white/10 shadow-2xl shadow-navy/30">
      {chartReady ? (
        <div className="bg-[#0f1628] px-6 pt-6 pb-2">
          <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-white/40 mb-1">
            {statsListToAskTitle(kind)}
          </p>
          <p className="font-serif text-xl text-white">
            Closed {noun} · against the first asking price
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
              No closings with a published asking price yet
            </span>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
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
              {/*
               * Ratios cluster in the high 90s to low 100s, so a bar drawn from
               * zero would make every town look identical. Bars run from the
               * asking price instead, which is the line that actually matters.
               */}
              <YAxis
                tickFormatter={(v: number) => formatVsAsk(v)}
                tick={{
                  fontFamily: "monospace",
                  fontSize: 10,
                  fill: "rgba(255,255,255,0.35)",
                }}
                axisLine={false}
                tickLine={false}
                width={52}
              />
              <ReferenceLine
                y={0}
                stroke="rgba(255,255,255,0.35)"
                strokeDasharray="4 4"
                label={{
                  value: "First ask",
                  position: "insideTopLeft",
                  fill: "rgba(255,255,255,0.35)",
                  fontSize: 9,
                  fontFamily: "monospace",
                }}
              />
              <Tooltip
                cursor={{ fill: "rgba(255,255,255,0.04)" }}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const row = payload[0]?.payload as ListToAskRow | undefined;
                  if (!row) return null;
                  return (
                    <StatsCalcTooltipShell
                      label={String(label ?? row.town)}
                      valueLine={`${row.pct.toFixed(1)}% of ask · ${formatVsAsk(
                        row.vsAsk,
                      )} · ${formatAskGap(row.dollars)} per ${
                        kind === "rental" ? "lease" : "sale"
                      }`}
                      calc={row.calc}
                    />
                  );
                }}
              />
              <Bar
                dataKey="vsAsk"
                radius={[4, 4, 4, 4]}
                maxBarSize={72}
                cursor={onTownData ? "pointer" : undefined}
                onClick={(data) => {
                  const town = (data.payload as ListToAskRow | undefined)?.town;
                  if (town) onTownData?.(town);
                }}
              >
                {rows.map((row) => {
                  const dimmed =
                    selectedCity !== "All" && selectedCity !== row.town;
                  return (
                    <Cell
                      key={row.town}
                      fill={row.vsAsk >= 0 ? OVER_ASK : UNDER_ASK}
                      fillOpacity={dimmed ? 0.3 : 1}
                    />
                  );
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {chartReady ? (
        <div className="bg-[#0a1020] px-6 py-3 flex flex-wrap items-center justify-between gap-3">
          <p className="font-mono text-[9px] tracking-wide text-white/20">
            Total close prices ÷ total original asks since 2024 · sorted furthest
            under ask → furthest over · above the line favours sellers
            {onTownData ? " · click a town for its closings" : ""}
          </p>
          {onTownData ? (
            <div className="flex flex-wrap items-center gap-4">
              {rows.map((row) => (
                <button
                  key={row.town}
                  type="button"
                  onClick={() => onTownData(row.town)}
                  className="flex items-center gap-1.5 hover:opacity-80 transition-opacity cursor-pointer"
                  aria-label={`View ${row.town} closings against first ask`}
                >
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{
                      backgroundColor: STATS_TOWN_COLOR[row.town],
                      boxShadow: `0 0 6px ${STATS_TOWN_COLOR[row.town]}`,
                    }}
                  />
                  <span
                    className="font-mono text-[9px]"
                    style={{ color: STATS_TOWN_COLOR[row.town] }}
                  >
                    {row.town}
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
