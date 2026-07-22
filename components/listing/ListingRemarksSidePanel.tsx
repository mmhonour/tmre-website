"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

/** Auto-collapse expanded remarks back to half-height. */
export const LISTING_REMARKS_EXPAND_MS = 20_000;

/**
 * Desktop Listing remarks panel: default max-height is half of content;
 * expand via More (or external teaser) and auto-revert after 20s.
 */
export default function ListingRemarksSidePanel({
  remarks,
  frameClass,
  expanded,
  onExpand,
  onCollapse,
}: {
  remarks: string | null;
  frameClass: string;
  expanded: boolean;
  onExpand: () => void;
  onCollapse: () => void;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState(0);

  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const measure = () => setContentHeight(el.scrollHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [remarks]);

  const halfHeight = contentHeight > 0 ? Math.round(contentHeight * 0.5) : 0;
  const canToggle = contentHeight > 72 && halfHeight > 0;
  const maxHeight =
    contentHeight <= 0
      ? undefined
      : expanded
        ? contentHeight
        : halfHeight;

  if (!remarks?.trim()) {
    return (
      <div className={`${frameClass} flex flex-col`}>
        <p className="font-mono text-[8px] tracking-[0.2em] uppercase text-gold mb-2">
          Listing remarks
        </p>
        <p className="text-white/50 text-[12px] leading-relaxed">
          No public remarks for this listing.
        </p>
      </div>
    );
  }

  return (
    <div className={`${frameClass} flex flex-col`}>
      <p className="font-mono text-[8px] tracking-[0.2em] uppercase text-gold mb-2">
        Listing remarks
      </p>
      <div
        className="overflow-hidden transition-[max-height] duration-300 ease-out"
        style={maxHeight != null ? { maxHeight } : undefined}
      >
        <div ref={bodyRef}>
          <p className="text-white/80 text-[12px] leading-relaxed whitespace-pre-line">
            {remarks}
          </p>
        </div>
      </div>
      {canToggle ? (
        <button
          type="button"
          onClick={() => (expanded ? onCollapse() : onExpand())}
          className="mt-2 self-start font-mono text-[9px] tracking-[0.14em] uppercase text-gold/80 underline decoration-gold/35 underline-offset-2 transition-colors hover:text-gold"
          aria-expanded={expanded}
        >
          {expanded ? "Less" : "More"}
        </button>
      ) : null}
    </div>
  );
}

/** Hook: expanded remarks with forced revert after LISTING_REMARKS_EXPAND_MS. */
export function useListingRemarksExpand() {
  const [expanded, setExpanded] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current != null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const expand = useCallback(() => {
    setExpanded(true);
    clearTimer();
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setExpanded(false);
    }, LISTING_REMARKS_EXPAND_MS);
  }, [clearTimer]);

  const collapse = useCallback(() => {
    clearTimer();
    setExpanded(false);
  }, [clearTimer]);

  useEffect(() => () => clearTimer(), [clearTimer]);

  return { expanded, expand, collapse };
}
