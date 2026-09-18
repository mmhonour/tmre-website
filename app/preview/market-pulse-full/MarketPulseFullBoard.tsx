"use client";

import type { CSSProperties } from "react";
import MarketPulseContent from "@/components/MarketPulseContent";
import { MARKET_PULSE_JOIN_BRIEF_ID } from "@/lib/market-pulse-defaults";
import type { MarketDigestSnapshot } from "@/lib/market-digest-types";
import {
  DEFAULT_MARKET_PULSE_THEME,
  marketPulseThemeCssVars,
} from "@/lib/page-theme-shared";
import type { MarketPulseCompareSet } from "@/lib/market-pulse-wow";

export default function MarketPulseFullBoard({
  snapshot,
  compares,
  etDate,
}: {
  snapshot: MarketDigestSnapshot;
  compares: MarketPulseCompareSet;
  etDate: string;
}) {
  return (
    <div
      style={marketPulseThemeCssVars(DEFAULT_MARKET_PULSE_THEME) as CSSProperties}
      className="market-pulse-theme bg-[var(--mp-page-bg)] [font-family:var(--mp-body-font)]"
    >
      <div className="px-2 pb-12 sm:px-6 lg:px-10">
        <MarketPulseContent
          snapshot={snapshot}
          etDate={etDate}
          compares={compares}
          weekOverWeek
          initialChartLayout="unstacked"
          initialComparePeriod="wow"
          skipClosedFetch
        />
      </div>
      <section
        id={MARKET_PULSE_JOIN_BRIEF_ID}
        className="scroll-mt-24 border-t border-[var(--mp-hairline,rgba(0,0,0,0.08))] px-6 py-10 text-center"
      >
        <p className="[font-family:var(--mp-mono-font)] text-[11px] uppercase tracking-[0.2em] text-[var(--mp-accent)]">
          Get it Mondays
        </p>
        <p className="mt-2 font-serif text-2xl text-[var(--mp-text)]">
          Join the brief.
        </p>
      </section>
    </div>
  );
}
