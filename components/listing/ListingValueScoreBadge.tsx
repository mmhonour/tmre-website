"use client";

import type { ScoreBreakdown } from "@/lib/goldilocks-score-info";

export default function ListingValueScoreBadge({
  score,
  onClick,
  compact = false,
}: {
  score: number;
  onClick?: () => void;
  compact?: boolean;
}) {
  const sizeClass = compact
    ? "h-12 w-12 sm:h-14 sm:w-14 rounded-xl"
    : "h-14 w-14 sm:h-16 sm:w-16 rounded-xl";
  const valueClass = compact
    ? "text-base sm:text-lg"
    : "text-lg sm:text-xl";
  const label = "Score";

  const inner = (
    <>
      <span className={`font-mono font-medium tabular-nums leading-none ${valueClass}`}>
        {score.toFixed(1)}
      </span>
      <span className="font-mono text-[8px] tracking-[0.15em] uppercase mt-1 opacity-85">
        {label}
      </span>
    </>
  );

  const className = `${sizeClass} shrink-0 flex flex-col items-center justify-center bg-sage text-white shadow-lg shadow-sage/30 transition-all ${
    onClick
      ? "hover:brightness-110 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/60"
      : ""
  }`;

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={className}
        aria-label={`Value score ${score.toFixed(1)} — view breakdown`}
      >
        {inner}
      </button>
    );
  }

  return <div className={className}>{inner}</div>;
}

export type { ScoreBreakdown };
