"use client";

/**
 * Solid triangle matching the Intelligence sort control
 * (`DealBoardSortBar` / `IntelSortDrawer`), mirrored for the forward step.
 * Anchored to the vertical middle of the photo at each edge of the screen.
 */
export default function ShowcaseStepArrow({
  direction,
  label,
  onClick,
}: {
  direction: "prev" | "next";
  label: string;
  onClick: () => void;
}) {
  const back = direction === "prev";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`absolute top-1/2 z-20 -translate-y-1/2 inline-flex h-12 w-12 items-center justify-center rounded-full text-white/70 transition-colors hover:text-gold ${
        back ? "left-1 sm:left-3" : "right-1 sm:right-3"
      }`}
    >
      <svg viewBox="0 0 12 12" className="h-4 w-4" fill="currentColor" aria-hidden>
        <path d={back ? "M8.5 1.2 L2.8 6 L8.5 10.8 Z" : "M3.5 1.2 L9.2 6 L3.5 10.8 Z"} />
      </svg>
    </button>
  );
}
