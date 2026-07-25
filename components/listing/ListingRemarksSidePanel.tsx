"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

/** Auto-return scrolled remarks to the bottom of the panel. */
export const LISTING_REMARKS_EXPAND_MS = 20_000;

/**
 * Desktop Listing remarks: fixed viewport, content bottom-aligned.
 * More scrolls earlier text into view; Less returns to the bottom of the panel.
 * Panel height does not grow — Details/Analysis/Schools stay visible below.
 */
export default function ListingRemarksSidePanel({
  remarks,
  frameClass,
  expanded,
  onExpand,
  onCollapse,
  /** Match this height so remarks bottoms align with the Details panel. */
  alignHeightPx = null,
}: {
  remarks: string | null;
  frameClass: string;
  expanded: boolean;
  onExpand: () => void;
  onCollapse: () => void;
  alignHeightPx?: number | null;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [canMore, setCanMore] = useState(false);
  const [canLess, setCanLess] = useState(false);
  const pinBottomRef = useRef(true);
  /** True when More already scrolled; skip the expanded-edge effect. */
  const skipExpandScrollRef = useRef(false);
  const prevExpandedRef = useRef(expanded);

  const syncScrollState = useCallback(() => {
    const el = viewportRef.current;
    if (!el) {
      setCanMore(false);
      setCanLess(false);
      return;
    }
    const maxScroll = Math.max(0, el.scrollHeight - el.clientHeight);
    const top = el.scrollTop;
    // More = unread copy above the viewport (including the resting bottom view).
    setCanMore(maxScroll > 2 && top > 2);
    // Less = scrolled away from the bottom-aligned resting position.
    setCanLess(maxScroll > 2 && top < maxScroll - 2);
  }, []);

  const scrollToBottom = useCallback(
    (smooth: boolean) => {
      const el = viewportRef.current;
      if (!el) return;
      const top = Math.max(0, el.scrollHeight - el.clientHeight);
      el.scrollTo({ top, behavior: smooth ? "smooth" : "auto" });
      pinBottomRef.current = true;
      window.requestAnimationFrame(syncScrollState);
    },
    [syncScrollState],
  );

  const doPageMore = useCallback(() => {
    const el = viewportRef.current;
    if (!el) return;
    const maxScroll = Math.max(0, el.scrollHeight - el.clientHeight);
    if (maxScroll <= 2) return;
    const step = Math.max(48, Math.round(el.clientHeight * 0.85));
    pinBottomRef.current = false;
    el.scrollBy({ top: -step, behavior: "smooth" });
    window.setTimeout(syncScrollState, 320);
  }, [syncScrollState]);

  const handleMore = useCallback(() => {
    skipExpandScrollRef.current = true;
    doPageMore();
    onExpand();
  }, [doPageMore, onExpand]);

  const handleLess = useCallback(() => {
    scrollToBottom(true);
    onCollapse();
    window.setTimeout(syncScrollState, 320);
  }, [onCollapse, scrollToBottom, syncScrollState]);

  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const measure = () => setContentHeight(el.scrollHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [remarks]);

  useLayoutEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const measure = () => setViewportHeight(el.clientHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [remarks, alignHeightPx]);

  // Keep resting view pinned to the bottom of the text.
  useLayoutEffect(() => {
    if (!viewportRef.current || contentHeight <= 0) return;
    if (pinBottomRef.current || !expanded) {
      scrollToBottom(false);
    } else {
      syncScrollState();
    }
  }, [contentHeight, viewportHeight, expanded, scrollToBottom, syncScrollState]);

  // Teaser / external expand → one More page; collapse → bottom.
  useEffect(() => {
    const was = prevExpandedRef.current;
    if (expanded && !was) {
      if (skipExpandScrollRef.current) {
        skipExpandScrollRef.current = false;
      } else {
        doPageMore();
      }
    } else if (!expanded && was) {
      scrollToBottom(true);
    }
    prevExpandedRef.current = expanded;
  }, [expanded, doPageMore, scrollToBottom]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onScroll = () => {
      const maxScroll = Math.max(0, el.scrollHeight - el.clientHeight);
      pinBottomRef.current = el.scrollTop >= maxScroll - 2;
      syncScrollState();
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [syncScrollState, remarks]);

  const needsPaging = contentHeight > viewportHeight + 8 && viewportHeight > 0;

  // Prefer matching Details panel height; fall back to half the remarks content.
  const halfHeight = contentHeight > 0 ? Math.round(contentHeight * 0.5) : 0;
  const styleMaxHeight =
    alignHeightPx != null && alignHeightPx > 0
      ? Math.max(120, alignHeightPx)
      : halfHeight > 0
        ? halfHeight
        : undefined;

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

  const matchedMax =
    alignHeightPx != null && alignHeightPx > 0
      ? Math.max(120, alignHeightPx)
      : null;

  return (
    <div
      className={`${frameClass} flex flex-col justify-end`}
      style={matchedMax != null ? { maxHeight: matchedMax } : undefined}
    >
      <p className="shrink-0 font-mono text-[8px] tracking-[0.2em] uppercase text-gold mb-2">
        Listing remarks
      </p>
      <div
        ref={viewportRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain [scrollbar-width:thin]"
        style={
          matchedMax != null
            ? { maxHeight: Math.max(80, matchedMax - 52) }
            : styleMaxHeight != null
              ? { maxHeight: styleMaxHeight }
              : undefined
        }
      >
        <div ref={bodyRef} className="flex min-h-full flex-col justify-end">
          <p className="text-white/80 text-[12px] leading-relaxed whitespace-pre-line">
            {remarks}
          </p>
        </div>
      </div>
      {needsPaging ? (
        <div className="mt-2 flex shrink-0 items-center gap-3">
          {canMore ? (
            <button
              type="button"
              onClick={handleMore}
              className="font-mono text-[9px] tracking-[0.14em] uppercase text-gold/80 underline decoration-gold/35 underline-offset-2 transition-colors hover:text-gold"
            >
              More
            </button>
          ) : null}
          {canLess ? (
            <button
              type="button"
              onClick={handleLess}
              className="font-mono text-[9px] tracking-[0.14em] uppercase text-gold/80 underline decoration-gold/35 underline-offset-2 transition-colors hover:text-gold"
            >
              Less
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Hook: remarks “expanded” (scrolled up) with forced return to bottom after LISTING_REMARKS_EXPAND_MS. */
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
