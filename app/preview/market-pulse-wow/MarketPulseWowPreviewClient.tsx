"use client";

import { useState } from "react";
import MarketPulseTownPanel from "@/components/MarketPulseTownPanel";
import type { PanelBarFillDeltaInk } from "@/components/market-pulse-bar";
import type { MarketPulseCombinedTownRow } from "@/lib/market-pulse-combined-rows";
import {
  DEFAULT_MARKET_PULSE_LOOKBACK_ID,
  marketPulseLookbackChartLabel,
} from "@/lib/market-pulse-lookback";
import { marketPulseTownScale } from "@/lib/market-pulse-town-scale";
import {
  availableComparePeriods,
  MARKET_PULSE_COMPARE_SWITCH_LABEL,
  marketPulseCompareCaption,
  type MarketPulseComparePeriod,
  type MarketPulseCompareSet,
} from "@/lib/market-pulse-wow";

const INKS: { id: PanelBarFillDeltaInk; label: string; note: string }[] = [
  { id: "white", label: "White", note: "current page + email-adjacent" },
  { id: "black", label: "Black", note: "#1B2A4A on the gold fill" },
];

export default function MarketPulseWowPreviewClient({
  current,
  compares,
}: {
  current: MarketPulseCombinedTownRow[];
  compares: MarketPulseCompareSet;
}) {
  const lookbackId = DEFAULT_MARKET_PULSE_LOOKBACK_ID;
  const closedLookbackLabel = marketPulseLookbackChartLabel(lookbackId);
  const scale = marketPulseTownScale(current, {
    closedLookbackLabel,
    kind: "sale",
  });
  const periods = availableComparePeriods(compares);
  const [period, setPeriod] = useState<"off" | MarketPulseComparePeriod>("wow");
  const compare = period === "off" ? null : compares[period];
  const options: Array<"off" | MarketPulseComparePeriod> = ["off", ...periods];

  return (
    <div className="min-h-screen bg-cream">
      <div className="mx-auto max-w-5xl px-4 pb-16 pt-24 sm:px-6">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-gold">
          UI preview
        </p>
        <h1 className="mb-2 font-serif text-3xl text-navy">
          Market Pulse week change
        </h1>
        <p className="mb-6 text-sm leading-relaxed text-slate">
          Same 6px gold bars as production. White numbers vs black{" "}
          <span className="font-mono text-[11px] text-navy">#1B2A4A</span> in
          the middle of each fill. Off / Week Over Week. Fixture towns, not live
          cache.
        </p>

        <div
          className="mb-5 flex flex-wrap gap-1"
          role="radiogroup"
          aria-label="Compare to last week"
        >
          {options.map((id) => {
            const selected = period === id;
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setPeriod(id)}
                className={`rounded-sm px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] ${
                  selected
                    ? "bg-navy/15 text-navy"
                    : "text-slate hover:text-navy"
                }`}
              >
                {MARKET_PULSE_COMPARE_SWITCH_LABEL[id]}
              </button>
            );
          })}
        </div>

        {compare && period !== "off" ? (
          <p className="mb-4 font-mono text-[10px] uppercase tracking-[0.14em] text-gold">
            {marketPulseCompareCaption(compare, period)}
          </p>
        ) : null}

        <div className="grid gap-8 lg:grid-cols-2">
          {INKS.map((ink) => (
            <section key={ink.id}>
              <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.16em] text-navy">
                {ink.label} numbers
              </p>
              <p className="mb-3 text-xs text-slate">{ink.note}</p>
              <ul className="space-y-3">
                {current.map((row) => (
                  <li key={`${ink.id}-${row.city}`}>
                    <MarketPulseTownPanel
                      row={row}
                      scale={scale}
                      lookbackId={lookbackId}
                      townLabel={row.city === "All" ? "All Towns" : row.city}
                      compare={compare}
                      fillDeltaInk={ink.id}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
