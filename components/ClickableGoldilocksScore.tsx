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

function scorePillClass(value: number): string {
  if (value >= 85) return "bg-sage/10 text-sage border-sage/30";
  if (value >= 70) return "bg-gold/10 text-gold border-gold/30";
  return "bg-charcoal/10 text-charcoal/55 border-charcoal/20";
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
  variant = "text",
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
  /** Pill matches Latest/Intelligence status chips. */
  variant?: "text" | "pill";
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  if (!Number.isFinite(score) || score <= 0) {
    return (
      <span
        className={
          variant === "pill"
            ? `inline-flex w-fit items-center rounded-full border border-charcoal/15 bg-charcoal/[0.04] px-2 py-0.5 font-mono text-[10px] tabular-nums text-charcoal/35 ${className ?? ""}`
            : `font-mono tabular-nums text-charcoal/35 ${className ?? ""}`
        }
        aria-label="Score unavailable"
      >
        —
      </span>
    );
  }

  const color = scoreTextColor(score);
  const buttonClass =
    variant === "pill"
      ? `inline-flex w-fit items-center rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold tabular-nums leading-none tracking-[0.08em] transition-colors hover:brightness-110 cursor-pointer ${scorePillClass(score)} ${className ?? ""}`
      : `font-mono font-semibold tabular-nums underline underline-offset-2 decoration-charcoal/20 hover:decoration-gold transition-colors cursor-pointer ${color} ${className ?? ""}`;
  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        className={buttonClass}
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
