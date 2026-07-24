"use client";

/** Prev / next controls overlaid on a listing photo hero. */
export default function ListingPhotoCycleControls({
  onPrev,
  onNext,
}: {
  onPrev: () => void;
  onNext: () => void;
}) {
  const btnClass =
    "absolute top-1/2 z-[2] flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/25 bg-navy/65 font-mono text-xl leading-none text-white/90 shadow-lg backdrop-blur-sm transition-colors hover:border-gold/50 hover:bg-navy/80 hover:text-gold focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/60";

  return (
    <>
      <button
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onPrev();
        }}
        aria-label="Previous photo"
        className={`${btnClass} left-2 sm:left-3`}
      >
        ‹
      </button>
      <button
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onNext();
        }}
        aria-label="Next photo"
        className={`${btnClass} right-2 sm:right-3`}
      >
        ›
      </button>
    </>
  );
}
