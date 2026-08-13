"use client";

import { useEffect, useId, useRef, useState } from "react";
import { PRICE_DELTA_EXPLAIN } from "@/lib/market-pulse-price-delta";

/** Click/hover popup for the stacked Delta row label. */
export default function MarketPulseDeltaLabel({
  pctLabel,
}: {
  pctLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);
  const popupId = useId();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span ref={rootRef} className="relative inline-flex min-w-0 items-baseline gap-1">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={popupId}
        onClick={() => setOpen((v) => !v)}
        className="underline decoration-[var(--mp-muted-text)]/40 underline-offset-2 transition-colors hover:text-[var(--mp-accent)] hover:decoration-[var(--mp-accent)]/50 uppercase tracking-[0.06em]"
      >
        Delta
      </button>
      {pctLabel ? (
        <span className="shrink-0 tabular-nums text-[var(--mp-text)]">
          {pctLabel}
        </span>
      ) : null}
      {open ? (
        <span
          id={popupId}
          role="tooltip"
          className="absolute left-0 top-[calc(100%+6px)] z-30 w-[min(16.5rem,70vw)] rounded-xl border border-black/10 bg-white px-3 py-2.5 text-left font-normal normal-case tracking-normal shadow-lg shadow-black/15"
        >
          <span className="block font-mono text-[10px] tracking-[0.15em] uppercase text-[var(--mp-accent,#C8A951)]">
            Why average runs high
          </span>
          <span className="mt-1.5 block font-mono text-[10px] leading-relaxed text-black/65">
            {PRICE_DELTA_EXPLAIN}
          </span>
        </span>
      ) : null}
    </span>
  );
}
