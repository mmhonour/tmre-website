"use client";

import { StatsCalcTooltipShell } from "@/components/StatsCalcTooltip";
import {
  MARKET_PULSE_FAVOR_FACTORS,
  marketPulseHeatBand,
  type MarketPulseHeatBandId,
} from "@/lib/market-pulse-favorability";

/** Caption colour per band — warm at the seller end, cool at the buyer end. */
const BAND_TEXT: Record<MarketPulseHeatBandId, string> = {
  "seller-hot": "text-[var(--mp-heat-seller,#C45C4A)]",
  "seller-warm": "text-[var(--mp-heat-seller,#C45C4A)]/80",
  balanced: "text-[var(--mp-muted-text)]",
  "buyer-warm": "text-[var(--mp-heat-buyer,#4A7C8A)]/85",
  "buyer-hot": "text-[var(--mp-heat-buyer,#4A7C8A)]",
};

const HEAT_GRADIENT =
  "linear-gradient(90deg, var(--mp-heat-seller,#C45C4A) 0%, var(--mp-heat-mid,#D8B45C) 50%, var(--mp-heat-buyer,#4A7C8A) 100%)";

const LIVE_FACTORS = MARKET_PULSE_FAVOR_FACTORS.filter(
  (f) => f.status === "live",
).map((f) => f.label);

/**
 * Where one town sits on the seller ↔ buyer spectrum, as a heat strip beside
 * its name. Reads off the same composite that drives the Seller / Buyer
 * Friendly sort, so the strips always run in the order the towns are listed.
 */
export default function MarketPulseHeatStrip({
  townLabel,
  pct,
  peerCount,
  scopeLabel,
}: {
  townLabel: string;
  /** Position on the spectrum, 0 (seller end) to 100 (buyer end). */
  pct: number;
  /** Towns the composite ranked against. */
  peerCount: number;
  /** Active tab scope, e.g. `sales` / `rentals`. */
  scopeLabel: string;
}) {
  const clamped = Math.max(0, Math.min(100, pct));
  const band = marketPulseHeatBand(clamped / 100);
  const reading = `${band.label} — ${band.counter}`;
  return (
    <span className="group/heat relative flex shrink-0 items-center gap-1.5">
      <span
        className={`[font-family:var(--mp-mono-font)] text-[9px] tracking-[0.1em] uppercase leading-none ${BAND_TEXT[band.id]}`}
      >
        {band.label}
      </span>
      <span
        role="img"
        aria-label={`${townLabel}: ${reading}`}
        className="relative block h-1.5 w-14 rounded-full sm:w-20"
        style={{ background: HEAT_GRADIENT }}
      >
        <span
          className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--mp-card-bg,#FFFFFF)] bg-[var(--mp-text)] shadow-sm transition-[left] duration-150 ease-out"
          style={{ left: `${clamped}%` }}
        />
      </span>
      <span
        className="pointer-events-none absolute right-0 bottom-[calc(100%+6px)] z-20 w-max max-w-[min(280px,70vw)] opacity-0 transition-opacity duration-150 group-hover/heat:opacity-100 group-focus-within/heat:opacity-100"
        role="tooltip"
      >
        <StatsCalcTooltipShell
          label="Buyer / seller heat"
          valueLine={`${townLabel} · ${reading}`}
          calc={{
            summary: `Where ${townLabel} lands across the ${peerCount} towns on this ${scopeLabel} tab — the same composite that orders the Seller / Buyer Friendly sort, so it moves with every filter you set.`,
            detail: [
              `Ranked on ${LIVE_FACTORS.join(", ")}.`,
              "Relative to the towns shown, not an absolute market call: the extremes always sit at one town each.",
            ],
          }}
          theme="light"
        />
      </span>
    </span>
  );
}
