"use client";

/**
 * The Intelligence sort direction glyph (`DealBoardSortBar` uses ↑ / ↓ in a
 * rounded mono button), turned sideways for stepping through photos.
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
      className={`inline-flex h-11 w-11 items-center justify-center rounded-lg font-mono text-[22px] leading-none text-white/70 transition-colors hover:bg-white/15 hover:text-white ${className}`}
    >
      {direction === "prev" ? "←" : "→"}
    </button>
  );
}
