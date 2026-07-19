"use client";

import { useState, type ReactNode } from "react";
import ListingScoreBreakdownModal from "@/components/ListingScoreBreakdownModal";
import GoldilocksScoreExplainModal from "@/components/GoldilocksScoreExplainModal";
import type { ScoreBreakdown } from "@/lib/goldilocks-score-info";

function scoreTextColor(value: number): string {
  if (value >= 85) return "text-sage";
  if (value >= 70) return "text-gold";
  return "text-charcoal/50";
}

/**
 * Clickable Goldilocks score for list/result rows. Opens the factor breakdown
 * when `breakdown` is present; otherwise the composite methodology modal.
 */
export default function ClickableGoldilocksScore({
  score,
  breakdown = null,
  title,
  subtitle = null,
  listingHref = null,
  isRental = false,
  className,
  children,
}: {
  score: number;
  breakdown?: ScoreBreakdown | null;
  title: string;
  subtitle?: string | null;
  listingHref?: string | null;
  isRental?: boolean;
  /** Extra classes on the button (font size, etc.). Color is applied unless overridden. */
  className?: string;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  if (!Number.isFinite(score) || score <= 0) {
    return (
      <span
        className={`font-mono tabular-nums text-charcoal/35 ${className ?? ""}`}
        aria-label="Score unavailable"
      >
        —
      </span>
    );
  }

  const color = scoreTextColor(score);
  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        className={`font-mono font-semibold tabular-nums underline underline-offset-2 decoration-charcoal/20 hover:decoration-gold transition-colors cursor-pointer ${color} ${className ?? ""}`}
        aria-label={`Score ${score.toFixed(1)} — view breakdown`}
      >
        {children ?? score.toFixed(1)}
      </button>
      {open && breakdown ? (
        <ListingScoreBreakdownModal
          open
          onClose={() => setOpen(false)}
          score={breakdown}
          title={title}
          subtitle={subtitle}
          listingHref={listingHref}
          isRental={isRental}
        />
      ) : null}
      {open && !breakdown ? (
        <GoldilocksScoreExplainModal
          topic="composite"
          context={{ composite: score, isRental }}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
