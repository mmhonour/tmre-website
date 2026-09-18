"use client";

import { useState } from "react";
import WeeklyBriefContent from "@/components/WeeklyBriefContent";
import { MARKET_PULSE_CHROME_SNAPSHOT } from "./fixtures";
import {
  DEFAULT_MARKET_PULSE_LOOKBACK_ID,
  type MarketPulseLookbackId,
} from "@/lib/market-pulse-lookback";
import {
  DEFAULT_MARKET_PULSE_THEME,
  marketPulseThemeCssVars,
} from "@/lib/page-theme-shared";
import type { CSSProperties } from "react";

const TABS = [
  { id: "all", label: "ALL" },
  { id: "sfr", label: "Single Family" },
  { id: "condo", label: "Condo" },
] as const;

export default function MarketPulseChromePreviewClient() {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("all");
  const [lookbackId, setLookbackId] = useState<MarketPulseLookbackId>(
    DEFAULT_MARKET_PULSE_LOOKBACK_ID,
  );

  const categoryFilter = (
    <div
      className="flex min-w-0 flex-wrap gap-1"
      role="tablist"
      aria-label="Property type"
    >
      {TABS.map((cat) => {
        const selected = tab === cat.id;
        return (
          <button
            key={cat.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => setTab(cat.id)}
            className={`rounded-sm px-2 py-1 [font-family:var(--mp-mono-font)] text-[10px] tracking-[0.14em] uppercase transition-colors ${
              selected
                ? "bg-[var(--mp-text)]/15 text-[var(--mp-text)]"
                : "text-[var(--mp-muted-text)] hover:text-[var(--mp-text)]"
            }`}
          >
            {cat.label}
          </button>
        );
      })}
    </div>
  );

  return (
    <div
      style={marketPulseThemeCssVars(DEFAULT_MARKET_PULSE_THEME) as CSSProperties}
      className="market-pulse-theme min-h-screen bg-[var(--mp-page-bg)] pb-16 pt-24"
    >
      <div className="mx-auto max-w-2xl px-4 sm:px-6">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-gold">
          UI preview
        </p>
        <h1 className="mb-2 font-serif text-3xl text-navy">
          Market Pulse chrome
        </h1>
        <p className="mb-6 text-sm leading-relaxed text-slate">
          Lookback sits left of All Towns. KPIs are one compact row (Active
          Homes). Yin-yang names Seller / Buyer Friendly and what a tap does.
          Unstacked opens on a heat-map panel with all seven towns, names left
          of the bars. Fixture towns, not live cache.
        </p>
      </div>
      <div className="px-2 sm:px-6">
        <WeeklyBriefContent
          snapshot={MARKET_PULSE_CHROME_SNAPSHOT}
          etDate="Thursday, September 17, 2026"
          categoryFilter={categoryFilter}
          lookbackId={lookbackId}
          onLookbackIdChange={setLookbackId}
          closedBarMax={500}
          initialChartLayout="unstacked"
        />
      </div>
    </div>
  );
}
