"use client";

import { useState } from "react";
import MarketPulseCompareBlurb from "@/components/MarketPulseCompareBlurb";
import MarketPulseTownPanel from "@/components/MarketPulseTownPanel";
import type { MarketPulseCombinedTownRow } from "@/lib/market-pulse-combined-rows";
import {
  DEFAULT_MARKET_PULSE_LOOKBACK_ID,
  marketPulseLookbackChartLabel,
} from "@/lib/market-pulse-lookback";
import { marketPulseTownScale } from "@/lib/market-pulse-town-scale";
import {
  availableComparePeriods,
  marketPulseCompareBlurbLines,
  marketPulseCompareCaption,
  type MarketPulseComparePeriod,
  type MarketPulseCompareSet,
} from "@/lib/market-pulse-wow";

const PERIOD_LABEL: Record<"off" | MarketPulseComparePeriod, string> = {
  off: "Off",
  wow: "WoW",
  mom: "MoM",
  yoy: "YoY",
};

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
      <div className="mx-auto max-w-xl px-4 pb-16 pt-24 sm:px-6">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-gold">
          UI preview
        </p>
        <h1 className="mb-2 font-serif text-3xl text-navy">
          Market Pulse week timeline
        </h1>
        <p className="mb-6 text-sm leading-relaxed text-slate">
          Off / WoW switch (MoM appears once a ~4-week slot exists; YoY the
          same). Numbers sit in a blurb to the right of the denim panel — not on
          the bars. Fixture towns, not live cache. Production page defaults Off;
          the Monday email always includes WoW (or MoM).
        </p>

        <div
          className="mb-5 flex flex-wrap gap-1"
          role="radiogroup"
          aria-label="Compare to prior weeks"
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
                {PERIOD_LABEL[id]}
              </button>
            );
          })}
        </div>

        <ul className="space-y-3">
          {current.map((row) => (
            <li key={row.city}>
              <div className="flex items-stretch gap-2">
                <div className="min-w-0 flex-1">
                  <MarketPulseTownPanel
                    row={row}
                    scale={scale}
                    lookbackId={lookbackId}
                    townLabel={row.city === "All" ? "All Towns" : row.city}
                  />
                </div>
                {period !== "off" && compare ? (
                  <MarketPulseCompareBlurb
                    caption={marketPulseCompareCaption(compare, period)}
                    lines={marketPulseCompareBlurbLines(compare, row.city)}
                  />
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
