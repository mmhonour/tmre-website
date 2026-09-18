"use client";

import type { CSSProperties } from "react";
import WeeklyBriefContent from "@/components/WeeklyBriefContent";
import type { MarketDigestSnapshot } from "@/lib/market-digest-types";
import {
  DEFAULT_MARKET_PULSE_THEME,
  marketPulseThemeCssVars,
} from "@/lib/page-theme-shared";
import type { MarketPulseCompareSet } from "@/lib/market-pulse-wow";

export default function MarketPulseWowPreviewClient({
  snapshot,
  compares,
  etDate,
}: {
  snapshot: MarketDigestSnapshot;
  compares: MarketPulseCompareSet;
  etDate: string;
}) {
  return (
    <div className="min-h-screen bg-cream">
      <div className="mx-auto max-w-3xl px-4 pb-8 pt-24 sm:px-6">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-gold">
          UI preview
        </p>
        <h1 className="mb-2 font-serif text-3xl text-navy">
          Unstacked Week Over Week
        </h1>
        <p className="mb-6 text-sm leading-relaxed text-slate">
          Full unstacked Market Pulse with Week Over Week cream callouts on
          every gold bar. Compact one-line KPIs so the floating strip stays
          thin on scroll. Fixture towns — not live cache. Toggle Off / Month /
          Year, or Stacked, the same way /market-pulse does.
        </p>
      </div>

      <div
        style={marketPulseThemeCssVars(DEFAULT_MARKET_PULSE_THEME) as CSSProperties}
        className="market-pulse-theme bg-[var(--mp-page-bg)] [font-family:var(--mp-body-font)]"
      >
        <div className="px-2 pb-16 sm:px-6 lg:px-10">
          <WeeklyBriefContent
            snapshot={snapshot}
            etDate={etDate}
            showDealOfTheWeek={false}
            weekOverWeek
            compares={compares}
            initialChartLayout="unstacked"
            initialComparePeriod="wow"
          />
        </div>
      </div>
    </div>
  );
}
