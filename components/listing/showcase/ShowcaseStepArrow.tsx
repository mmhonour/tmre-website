"use client";

/**
 * The Intelligence sort direction glyph (`DealBoardSortBar` uses ↑ / ↓ in a
 * rounded mono button), turned sideways for stepping through photos. Weighted
 * and given a hard offset shadow so it reads as a raised control over busy
 * photography rather than a hairline character.
 */
export default function ShowcaseStepArrow({
  direction,
  label,
  onClick,
  className = "",
}: {
  direction: "prev" | "next";
  label: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`listing-showcase-arrow inline-flex h-14 w-14 items-center justify-center rounded-xl text-[34px] font-bold leading-none text-white transition-colors hover:bg-white/15 ${className}`}
    >
      {direction === "prev" ? "←" : "→"}
    </button>
  );
}
