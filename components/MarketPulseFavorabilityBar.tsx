"use client";

import { marketPulseHeatBand } from "@/lib/market-pulse-favorability";

/**
 * Buyer ↔ seller spectrum: coral → gold → sage with a white marker.
 * Shared by stacked town cards and the unstacked heat panel.
 */
export default function MarketPulseFavorabilityBar({
  score,
  peerCount,
  compact = false,
}: {
  score: number | null;
  /** Null on the All Towns row, which is the towns rather than one of them. */
  peerCount: number | null;
  compact?: boolean;
}) {
  const pct = score == null ? null : Math.min(100, Math.max(0, score * 100));
  const band = pct == null ? null : marketPulseHeatBand(pct / 100);
  return (
    <div>
      <div
        className={`flex items-baseline justify-between gap-2 [font-family:var(--mp-mono-font)] uppercase tracking-[0.16em] text-white/45 ${
          compact ? "text-[8px]" : "text-[9px]"
        }`}
      >
        <span>Seller</span>
        <span className="truncate text-white/70">
          {band?.label ?? "No signal"}
          {peerCount != null ? ` · vs ${peerCount} towns` : ""}
        </span>
        <span>Buyer</span>
      </div>
      <div
        className={`relative mt-1.5 w-full rounded-full bg-gradient-to-r from-coral via-gold to-sage ${
          compact ? "h-1.5" : "h-2"
        }`}
      >
        {pct != null ? (
          <span
            className="absolute top-1/2 h-3.5 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_0_2px_rgba(38,55,79,0.9)] transition-[left] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
            style={{ left: `${pct}%` }}
            aria-hidden
          />
        ) : null}
      </div>
    </div>
  );
}
