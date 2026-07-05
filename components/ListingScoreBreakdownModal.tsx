"use client";

import Link from "next/link";
import { useState } from "react";
import GoldilocksScoreExplainModal, {
  type ExplainContext,
} from "@/components/GoldilocksScoreExplainModal";
import ModalPortal from "@/components/ModalPortal";
import type { ScoreBreakdown } from "@/lib/goldilocks-score-info";
import type { ScoreExplainTopic } from "@/lib/goldilocks-score-info";

const FACTORS: {
  key: keyof ScoreBreakdown["weights"];
  label: string;
  scoreKey: keyof ScoreBreakdown;
  explainKey: ScoreExplainTopic;
}[] = [
  { key: "age", label: "Age", scoreKey: "age", explainKey: "age" },
  { key: "condition", label: "Condition", scoreKey: "condition", explainKey: "condition" },
  { key: "finishes", label: "Finishes", scoreKey: "finishesQuality", explainKey: "finishes" },
  { key: "ppsf", label: "PPSF fit", scoreKey: "pricePerSqftFit", explainKey: "ppsf" },
  { key: "layout", label: "Layout", scoreKey: "layoutQuality", explainKey: "layout" },
  { key: "schools", label: "Schools", scoreKey: "schoolRating", explainKey: "schools" },
];

export default function ListingScoreBreakdownModal({
  open,
  onClose,
  score,
  title,
  subtitle = null,
  listingHref = null,
  isRental = false,
  ppsfDiscount,
  reductionPct,
}: {
  open: boolean;
  onClose: () => void;
  score: ScoreBreakdown;
  title: string;
  subtitle?: string | null;
  listingHref?: string | null;
  isRental?: boolean;
  ppsfDiscount?: number | null;
  reductionPct?: number | null;
}) {
  const [explainTopic, setExplainTopic] = useState<ScoreExplainTopic | null>(null);

  const compositeColor =
    score.composite >= 85
      ? "text-sage"
      : score.composite >= 70
        ? "text-gold"
        : "text-navy";

  const explainContext: ExplainContext = {
    composite: score.composite,
    isRental,
    ppsfDiscount: ppsfDiscount ?? undefined,
    reductionPct: reductionPct ?? undefined,
    factorScore:
      explainTopic === "age"
        ? score.age
        : explainTopic === "condition"
          ? score.condition
          : explainTopic === "finishes"
          ? score.finishesQuality
          : explainTopic === "ppsf"
            ? score.pricePerSqftFit
            : explainTopic === "layout"
              ? score.layoutQuality
              : explainTopic === "schools"
                ? score.schoolRating
                : undefined,
    weight:
      explainTopic === "age"
        ? score.weights.age
        : explainTopic === "condition"
          ? score.weights.condition
          : explainTopic === "finishes"
          ? score.weights.finishes
          : explainTopic === "ppsf"
            ? score.weights.ppsf
            : explainTopic === "layout"
              ? score.weights.layout
              : explainTopic === "schools"
                ? score.weights.schools
                : undefined,
  };

  return (
    <>
      <ModalPortal open={open} onClose={onClose} ariaLabel="Score breakdown">
        <div
          className="relative bg-white rounded-3xl shadow-2xl shadow-navy/20 max-w-md w-full p-8 max-h-[min(85vh,calc(100vh-6rem))] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between mb-6">
            <div>
              <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-gold mb-1">
                Goldilocks score
                {subtitle ? ` · ${subtitle}` : ""}
              </p>
              <h2 className="font-serif text-2xl text-navy">{title}</h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-slate hover:text-navy transition-colors font-mono text-lg leading-none mt-1"
              aria-label="Close"
            >
              ×
            </button>
          </div>

          <div className="flex items-center gap-4 mb-6 pb-6 border-b border-charcoal/[0.08]">
            <button
              type="button"
              onClick={() => setExplainTopic("composite")}
              className={`font-mono text-4xl tabular-nums font-medium hover:opacity-80 transition-opacity underline underline-offset-4 decoration-charcoal/20 ${compositeColor}`}
            >
              {score.composite.toFixed(1)}
            </button>
            <div>
              <p className="text-sm text-charcoal">Composite score out of 100</p>
              <button
                type="button"
                onClick={() => setExplainTopic("composite")}
                className="font-mono text-[10px] tracking-[0.15em] uppercase text-gold hover:underline mt-1 inline-block"
              >
                What this means →
              </button>
            </div>
          </div>

          <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-slate mb-4">
            Score breakdown
          </p>
          <div className="space-y-4 mb-6">
            {FACTORS.map(({ key, label, scoreKey, explainKey }) => {
              const value = score[scoreKey] as number;
              return (
                <div key={key}>
                  <div className="flex items-center justify-between font-mono text-[10px] tracking-[0.1em] uppercase text-charcoal/70 mb-1.5">
                    <span>{label}</span>
                    <span>
                      {Math.round(value)}
                      <button
                        type="button"
                        onClick={() => setExplainTopic(explainKey)}
                        className="text-slate/50 hover:text-gold transition-colors underline underline-offset-2 decoration-charcoal/15"
                        aria-label={`Explain ${label}`}
                      >
                        {" →"}
                      </button>
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-cream overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-navy/60 to-gold/80 rounded-full transition-all"
                      style={{ width: `${Math.min(100, value)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between gap-4 pt-4 border-t border-charcoal/[0.06]">
            {listingHref ? (
              <Link
                href={listingHref}
                className="font-mono text-[10px] tracking-[0.15em] uppercase text-navy hover:text-gold transition-colors"
              >
                View listing →
              </Link>
            ) : null}
            <Link
              href="/score"
              className="font-mono text-[10px] tracking-[0.15em] uppercase text-gold hover:underline ml-auto"
            >
              Full scoring methodology →
            </Link>
          </div>
        </div>
      </ModalPortal>

      {explainTopic ? (
        <GoldilocksScoreExplainModal
          topic={explainTopic}
          context={explainContext}
          onClose={() => setExplainTopic(null)}
          layered
        />
      ) : null}
    </>
  );
}
