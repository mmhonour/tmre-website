"use client";

export default function DealBoardMiddleTierToggle({
  expanded,
  middleCount,
  resultCount,
  onToggle,
}: {
  expanded: boolean;
  middleCount: number;
  resultCount: number;
  onToggle: () => void;
}) {
  const label = expanded ? (
    <>Hide middle tier · {middleCount} listings ↑</>
  ) : (
    <>
      Show middle tier · {middleCount} listings (
      {Math.round((middleCount / resultCount) * 100)}%) ↓
    </>
  );

  return (
    <div className="border-y border-charcoal/[0.10] bg-cream/50 px-4 py-3">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-center gap-2 font-mono text-[10px] tracking-[0.14em] uppercase text-gold hover:text-navy transition-colors py-1"
        aria-expanded={expanded}
      >
        {label}
      </button>
    </div>
  );
}
