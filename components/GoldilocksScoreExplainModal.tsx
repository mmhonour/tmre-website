"use client";

import Link from "next/link";
import {
  resolveExplainContent,
  type ScoreExplainTopic,
} from "@/lib/goldilocks-score-info";
import ModalPortal, { MODAL_PANEL_CLASS } from "@/components/ModalPortal";

type ExplainContext = {
  composite?: number;
  factorScore?: number;
  weight?: number;
  ppsfDiscount?: number;
  reductionPct?: number;
  isRental?: boolean;
  showWeights?: boolean;
};

export default function GoldilocksScoreExplainModal({
  topic,
  context,
  onClose,
  layered = false,
}: {
  topic: ScoreExplainTopic;
  context: ExplainContext;
  onClose: () => void;
  /** When true, stacks above another open modal (e.g. score breakdown). */
  layered?: boolean;
}) {
  const { title, lines } = resolveExplainContent(topic, context);

  return (
    <ModalPortal
      open
      onClose={onClose}
      ariaLabel={title}
      zClass={layered ? "z-[210]" : "z-[200]"}
    >
      <div
        className={MODAL_PANEL_CLASS}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-5">
          <div>
            <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-gold mb-1">
              Goldilocks score
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
        <div className="space-y-3 mb-6">
          {lines.map((line) => (
            <p key={line} className="text-sm text-charcoal leading-relaxed">
              {line}
            </p>
          ))}
        </div>
        <Link
          href="/score"
          className="font-mono text-[10px] tracking-[0.15em] uppercase text-gold hover:underline"
        >
          Full scoring methodology →
        </Link>
      </div>
    </ModalPortal>
  );
}

export type { ScoreExplainTopic, ExplainContext };
