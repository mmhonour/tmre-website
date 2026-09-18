"use client";

import { useState } from "react";
import {
  PANEL_SURFACE,
  PANEL_TITLE,
  PanelBarRow,
} from "@/components/market-pulse-bar";
import MarketPulseTownPanel from "@/components/MarketPulseTownPanel";
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
  marketPulseFillDeltaText,
  type MarketPulseComparePeriod,
  type MarketPulseCompareSet,
} from "@/lib/market-pulse-wow";

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
  const invMax = Math.max(...current.map((r) => r.activeCount ?? 0), 1);

  return (
    <div className="min-h-screen bg-cream">
      <div className="mx-auto max-w-xl px-4 pb-16 pt-24 sm:px-6">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-gold">
          UI preview
        </p>
        <h1 className="mb-2 font-serif text-3xl text-navy">
          Market Pulse week change
        </h1>
        <p className="mb-6 text-sm leading-relaxed text-slate">
          Off / Week Over Week / Month Over Month / Year Over Year. Cream
          callouts on the 6px gold, navy type, stacked and unstacked. Fixture
          towns, not live cache.
        </p>

        <div
          className="mb-5 flex min-w-0 flex-wrap gap-1"
          role="radiogroup"
          aria-label="Compare to a prior period"
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
          <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.14em] text-gold">
            {marketPulseCompareCaption(compare, period)}
          </p>
        ) : null}

        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-slate">
          Unstacked
        </p>
        <section className={`${PANEL_SURFACE} mb-8`}>
          <p className={PANEL_TITLE}>Active inventory</p>
          <ul className="mt-1">
            {current.map((row) => (
              <li key={`inv-${row.city}`}>
                <PanelBarRow
                  label={row.city === "All" ? "All Towns" : row.city}
                  valueText={
                    row.activeCount != null ? String(row.activeCount) : "—"
                  }
                  leftPct={0}
                  widthPct={((row.activeCount ?? 0) / invMax) * 100}
                  fillDelta={marketPulseFillDeltaText(
                    compare,
                    row.city,
                    "inventory",
                  )}
                  fillDeltaInk="black"
                />
              </li>
            ))}
          </ul>
        </section>

        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-slate">
          Stacked
        </p>
        <ul className="space-y-3">
          {current.map((row) => (
            <li key={row.city}>
              <MarketPulseTownPanel
                row={row}
                scale={scale}
                lookbackId={lookbackId}
                townLabel={row.city === "All" ? "All Towns" : row.city}
                compare={compare}
                fillDeltaInk="black"
              />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
