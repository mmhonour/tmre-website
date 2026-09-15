"use client";

import MarketPulseTownPanel from "@/components/MarketPulseTownPanel";
import type { MarketPulseCombinedTownRow } from "@/lib/market-pulse-combined-rows";
import { DEFAULT_MARKET_PULSE_LOOKBACK_ID, marketPulseLookbackChartLabel } from "@/lib/market-pulse-lookback";
import { marketPulseTownScale } from "@/lib/market-pulse-town-scale";
import {
  marketPulseWowCaption,
  type MarketPulseWowCompare,
} from "@/lib/market-pulse-wow";

export default function MarketPulseWowPreviewClient({
  current,
  wow,
}: {
  current: MarketPulseCombinedTownRow[];
  wow: MarketPulseWowCompare | null;
}) {
  const lookbackId = DEFAULT_MARKET_PULSE_LOOKBACK_ID;
  const closedLookbackLabel = marketPulseLookbackChartLabel(lookbackId);
  const scale = marketPulseTownScale(current, {
    closedLookbackLabel,
    kind: "sale",
  });

  return (
    <div className="min-h-screen bg-cream">
      <div className="mx-auto max-w-2xl px-4 pb-16 pt-28 sm:px-6">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-gold">
          UI preview
        </p>
        <h1 className="mb-2 font-serif text-3xl text-navy">
          Market Pulse week-over-week
        </h1>
        <p className="mb-8 text-sm leading-relaxed text-slate">
          Stacked town bars now carry a precomputed WoW next to each value —
          this snapshot minus the previous Eastern send-day on{" "}
          <span className="font-medium text-navy">market_pulse_snapshots</span>
          . Fixture towns (not live cache). Production stays blank until two
          Mondays are archived. Filters off ALL / 12 mos / stacked hide it, same
          as the Monday email.
        </p>

        <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.14em] text-gold">
          {wow ? marketPulseWowCaption(wow) : "No prior Monday"}
        </p>
        <ul className="space-y-3">
          {current.map((row) => (
            <li key={row.city}>
              <MarketPulseTownPanel
                row={row}
                scale={scale}
                lookbackId={lookbackId}
                townLabel={row.city === "All" ? "All Towns" : row.city}
                wow={wow}
              />
            </li>
          ))}
        </ul>

        <div className="mt-10 rounded-2xl border border-charcoal/[0.08] bg-white px-5 py-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-gold">
            Waiting on a second Monday
          </p>
          <p className="mt-2 text-sm leading-relaxed text-slate">
            With only one archived send-day,{" "}
            <code className="font-mono text-[12px] text-navy">
              loadMarketPulseWow
            </code>{" "}
            returns null and the page/email omit the caption and the deltas. That
            is the live site today (15 Sep) if the first row landed 14 Sep.
          </p>
        </div>
      </div>
    </div>
  );
}
