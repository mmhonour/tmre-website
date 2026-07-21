"use client";

/**
 * Collapse band between top/bottom Goldilocks tiers. Shown only while middle
 * rows are hidden — once expanded, this panel disappears (see DealBoardList).
 */
export default function DealBoardMiddleTierToggle({
  middleCount,
  resultCount,
  onToggle,
}: {
  /** @deprecated Always collapsed when this control is mounted. */
  expanded?: boolean;
  middleCount: number;
  resultCount: number;
  onToggle: () => void;
}) {
  const pct =
    resultCount > 0 ? Math.round((middleCount / resultCount) * 100) : 0;
  const countLabel = `${middleCount.toLocaleString()} ${
    middleCount === 1 ? "listing" : "listings"
  }`;

  return (
    <div className="border-y-2 border-gold/35 bg-gradient-to-b from-gold/[0.14] via-cream to-gold/[0.10] px-3 py-3.5 sm:px-4">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={false}
        className="group w-full flex flex-col items-center gap-1.5 rounded-xl border border-navy/20 bg-white px-4 py-3.5 shadow-[0_3px_0_0_rgba(28,42,58,0.18),0_4px_12px_rgba(28,42,58,0.08)] transition-[transform,box-shadow,border-color] hover:border-navy/35 hover:shadow-[0_2px_0_0_rgba(28,42,58,0.18)] active:translate-y-px active:shadow-[0_1px_0_0_rgba(28,42,58,0.16)]"
      >
        <span className="inline-flex items-center gap-2.5">
          <FlashArrow dir="down" />
          <span className="font-mono text-[11px] sm:text-[12px] tracking-[0.16em] uppercase font-bold text-navy">
            Middle tier
          </span>
          <FlashArrow dir="down" />
        </span>

        <span className="font-serif italic text-xl sm:text-2xl text-navy leading-none tabular-nums">
          {countLabel}
        </span>

        <span className="font-mono text-[10px] tracking-[0.12em] uppercase text-slate">
          Tap to show · {pct}% of this page hidden between top &amp; bottom
        </span>

        <span
          className="mt-0.5 inline-flex items-center gap-1.5 font-mono text-[9px] tracking-[0.14em] uppercase text-gold"
          aria-hidden
        >
          <FlashArrow dir="down" small />
          <span>Expand</span>
          <FlashArrow dir="down" small />
        </span>
      </button>
    </div>
  );
}

function FlashArrow({
  dir,
  small = false,
}: {
  dir: "up" | "down";
  small?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center justify-center font-mono font-bold text-gold ${
        dir === "up"
          ? "animate-intel-middle-tier-arrow-up"
          : "animate-intel-middle-tier-arrow-down"
      } ${small ? "text-[11px]" : "text-[14px] sm:text-[15px]"}`}
      aria-hidden
    >
      {dir === "up" ? "↑" : "↓"}
    </span>
  );
}
