"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
  type TouchEvent as ReactTouchEvent,
} from "react";

const HIDDEN_PREF_KEY = "tmre-intel-mini-graphs-hidden";
const ROTATE_MS = 5_000;
const INTERACTIVE_HINT_MS = 10_000;
/** Hide the strip after this long with no pointer/chart interaction. */
const AUTO_HIDE_IDLE_MS = 10_000;
/** Horizontal finger swipe distance to change mobile carousel slide. */
const SWIPE_MIN_PX = 48;
/** Desktop multi-up window: slow L→R slide (transform only). */
const DESKTOP_SLIDE_MS = 1_400;
/** Tailwind gap-4 between desktop slides. */
const DESKTOP_GAP_PX = 16;
/**
 * How many mini-graphs show at once on desktop before the strip carousels.
 * 4 = vintage + inventory + DOM + Luxury/Mid/Value/Discount all visible.
 */
const DESKTOP_VISIBLE = 4;
/** Extra leading clones so the wrap seam can slide without a jump. */
const DESKTOP_CLONE_COUNT = DESKTOP_VISIBLE;

export type IntelligenceMiniGraphSlot = {
  key: string;
  node: ReactNode;
  /**
   * Mobile carousel dwell as multiples of ROTATE_MS (default 1).
   * Use 4 for the Luxury/Mid/Value/Discount layered inventory graph.
   */
  carouselDwellSteps?: number;
};

export type MiniGraphsCarouselApi = {
  paused: boolean;
  /** True when mobile (1-up) or desktop (windowed) carousel is active. */
  isCarousel: boolean;
  /** Key of the currently focused slide (null when not in carousel mode). */
  activeKey: string | null;
  /** True when this graph is on-screen (mobile active slide or desktop window). */
  isKeyVisible: (key: string) => boolean;
  pause: () => void;
  resume: () => void;
  toggle: () => void;
};

const MiniGraphsCarouselContext = createContext<MiniGraphsCarouselApi | null>(
  null,
);

/** Pause / play the mobile mini-graph carousel (used by the tri-inventory chart). */
export function useMiniGraphsCarousel(): MiniGraphsCarouselApi | null {
  return useContext(MiniGraphsCarouselContext);
}

/**
 * Desktop: up to DESKTOP_VISIBLE charts in a row; when there are more, slide
 * that window continuously L→R via transform — same pause / dwell as mobile.
 * Clones at the end of the track keep the wrap seam animated (no remount / fade).
 * Mobile: one chart at a time until paused.
 * Hide toggle often lives outside (left of board).
 */
export default function IntelligenceMiniGraphsStrip({
  slots,
  onInteractRef,
  hidden: hiddenProp,
  onHiddenChange,
  autoHideSuspended: autoHideSuspendedProp,
  onAutoHideSuspendedChange,
  showHideToggle = true,
  /** When parent owns mobile toggle, keep strip toggle for desktop only. */
  desktopHideToggleOnly = false,
  /** Optional trailing control on the mobile carousel row. */
  carouselTrailing = null,
}: {
  slots: IntelligenceMiniGraphSlot[];
  /** Parent assigns pause() when a chart point is clicked. */
  onInteractRef: MutableRefObject<(() => void) | null>;
  /** Controlled hide (when Hide graphs sits outside the strip). */
  hidden?: boolean;
  onHiddenChange?: (hidden: boolean) => void;
  /**
   * When true, skip the idle auto-hide timer (user clicked Show graphs).
   * Controlled when `onAutoHideSuspendedChange` is provided.
   */
  autoHideSuspended?: boolean;
  onAutoHideSuspendedChange?: (suspended: boolean) => void;
  /** When false, parent owns the Hide graphs control entirely. */
  showHideToggle?: boolean;
  desktopHideToggleOnly?: boolean;
  carouselTrailing?: ReactNode;
}) {
  // Parent passes a fresh `slots` array every render — derive a stable presence
  // key so carousel timers are not cleared on every Intelligence re-render.
  const slotPresenceKey = slots
    .map(
      (s) =>
        `${s.key}:${s.node != null ? "1" : "0"}:${s.carouselDwellSteps ?? 1}`,
    )
    .join("|");
  const items = useMemo(
    () => slots.filter((s) => s.node != null),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by slotPresenceKey
    [slotPresenceKey],
  );
  // Always render the latest nodes (scores/filters) even when presence is stable.
  const renderItems = useMemo(
    () => slots.filter((s) => s.node != null),
    [slots],
  );

  const [hiddenInternal, setHiddenInternal] = useState(false);
  const controlled = onHiddenChange != null;
  const hidden = controlled ? Boolean(hiddenProp) : hiddenInternal;

  const [autoHideSuspendedInternal, setAutoHideSuspendedInternal] =
    useState(false);
  const autoHideSuspendedControlled = onAutoHideSuspendedChange != null;
  const autoHideSuspended = autoHideSuspendedControlled
    ? Boolean(autoHideSuspendedProp)
    : autoHideSuspendedInternal;

  const setAutoHideSuspended = useCallback(
    (next: boolean) => {
      if (autoHideSuspendedControlled) onAutoHideSuspendedChange?.(next);
      else setAutoHideSuspendedInternal(next);
    },
    [autoHideSuspendedControlled, onAutoHideSuspendedChange],
  );

  const [prefReady, setPrefReady] = useState(false);
  const [isNarrow, setIsNarrow] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia("(max-width: 1023px)").matches
      : false,
  );
  const [activeIndex, setActiveIndex] = useState(0);
  /**
   * Desktop track position on an extended strip (items + leading clones).
   * Advances 0 → n, then snaps back to 0 without animation at the seam.
   */
  const [desktopSlideIndex, setDesktopSlideIndex] = useState(0);
  const [desktopSlideNoAnim, setDesktopSlideNoAnim] = useState(false);
  const [paused, setPaused] = useState(false);
  const [showInteractiveHint, setShowInteractiveHint] = useState(false);
  /** Bumped on real user interaction so the idle auto-hide timer restarts. */
  const [activityEpoch, setActivityEpoch] = useState(0);
  /** Mobile: keys already shown in the carousel — idle hide waits for a full tour. */
  const [seenCarouselKeys, setSeenCarouselKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  // Fresh visit / remount after navigating away — always start rotating.
  useEffect(() => {
    setPaused(false);
    setActiveIndex(0);
    setDesktopSlideIndex(0);
    setDesktopSlideNoAnim(false);
    setSeenCarouselKeys(new Set());
  }, []);

  const bumpActivity = useCallback(() => {
    setActivityEpoch((n) => n + 1);
  }, []);

  const setHiddenPref = useCallback(
    (next: boolean) => {
      if (controlled) onHiddenChange?.(next);
      else setHiddenInternal(next);
      if (next) setAutoHideSuspended(false);
      if (!next) setPaused(false);
      try {
        sessionStorage.setItem(HIDDEN_PREF_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
    },
    [controlled, onHiddenChange, setAutoHideSuspended],
  );

  const desktopCarousel =
    !isNarrow && items.length > DESKTOP_VISIBLE;
  const isCarousel =
    (isNarrow && items.length > 1) || desktopCarousel;
  const itemCountForSlide = items.length;

  const safeActiveIndex = useMemo(() => {
    if (items.length === 0) return 0;
    if (desktopCarousel) {
      return (
        ((desktopSlideIndex % items.length) + items.length) % items.length
      );
    }
    return ((activeIndex % items.length) + items.length) % items.length;
  }, [activeIndex, desktopCarousel, desktopSlideIndex, items.length]);

  const activeKey =
    isCarousel && items.length > 0
      ? (items[safeActiveIndex]?.key ?? null)
      : null;

  const isKeyVisible = useCallback(
    (key: string) => {
      if (!isCarousel || items.length === 0) return true;
      if (isNarrow) return items[safeActiveIndex]?.key === key;
      for (let o = 0; o < DESKTOP_VISIBLE; o++) {
        const idx = (safeActiveIndex + o) % items.length;
        if (items[idx]?.key === key) return true;
      }
      return false;
    },
    [isCarousel, isNarrow, items, safeActiveIndex],
  );

  // Keep desktop track index in range when the slot count changes.
  useEffect(() => {
    if (!desktopCarousel || itemCountForSlide === 0) return;
    setDesktopSlideIndex((prev) => {
      if (prev >= 0 && prev <= itemCountForSlide) return prev;
      return ((prev % itemCountForSlide) + itemCountForSlide) % itemCountForSlide;
    });
  }, [desktopCarousel, itemCountForSlide]);

  // After sliding into the cloned tail, snap back to the real head with no anim.
  useEffect(() => {
    if (!desktopSlideNoAnim) return;
    let inner = 0;
    const outer = window.requestAnimationFrame(() => {
      inner = window.requestAnimationFrame(() => setDesktopSlideNoAnim(false));
    });
    return () => {
      window.cancelAnimationFrame(outer);
      window.cancelAnimationFrame(inner);
    };
  }, [desktopSlideNoAnim]);

  // prefers-reduced-motion skips transform transitions — still seam-snap.
  useEffect(() => {
    if (!desktopCarousel || itemCountForSlide === 0) return;
    if (desktopSlideIndex < itemCountForSlide) return;
    if (
      typeof window !== "undefined" &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    setDesktopSlideNoAnim(true);
    setDesktopSlideIndex(desktopSlideIndex % itemCountForSlide);
  }, [desktopCarousel, desktopSlideIndex, itemCountForSlide]);

  const carouselApi = useMemo<MiniGraphsCarouselApi>(
    () => ({
      paused,
      isCarousel,
      activeKey,
      isKeyVisible,
      pause: () => {
        setPaused(true);
        bumpActivity();
      },
      resume: () => {
        setPaused(false);
        bumpActivity();
      },
      toggle: () => {
        setPaused((p) => !p);
        bumpActivity();
      },
    }),
    [paused, isCarousel, activeKey, isKeyVisible, bumpActivity],
  );

  useEffect(() => {
    if (!controlled) {
      try {
        setHiddenInternal(sessionStorage.getItem(HIDDEN_PREF_KEY) === "1");
      } catch {
        /* private mode */
      }
    }
    setPrefReady(true);
  }, [controlled]);

  useEffect(() => {
    // Match Tailwind `lg`: phones + tablets get 1-up so all graphs are reachable.
    // Desktop `lg+` shows up to DESKTOP_VISIBLE in a row (carousels if more).
    const mq = window.matchMedia("(max-width: 1023px)");
    const sync = () => setIsNarrow(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    onInteractRef.current = () => {
      setPaused(true);
      bumpActivity();
    };
    return () => {
      onInteractRef.current = null;
    };
  }, [onInteractRef, bumpActivity]);

  useEffect(() => {
    if (items.length === 0) return;
    if (activeIndex >= items.length || activeIndex < 0) {
      setActiveIndex(((activeIndex % items.length) + items.length) % items.length);
    }
  }, [items.length, activeIndex]);

  const itemCount = items.length;
  const activeDwellSteps = (() => {
    if (items.length === 0) return 1;
    if (!desktopCarousel) {
      return Math.max(1, items[safeActiveIndex]?.carouselDwellSteps ?? 1);
    }
    let max = 1;
    for (let o = 0; o < DESKTOP_VISIBLE; o++) {
      const idx = (safeActiveIndex + o) % items.length;
      max = Math.max(max, items[idx]?.carouselDwellSteps ?? 1);
    }
    return max;
  })();

  const goDesktopSlide = useCallback(
    (nextLogical: number, { animate }: { animate: boolean }) => {
      if (itemCount === 0) return;
      const logical =
        ((nextLogical % itemCount) + itemCount) % itemCount;
      if (!animate) {
        setDesktopSlideNoAnim(true);
        setDesktopSlideIndex(logical);
        return;
      }
      const cur = desktopSlideIndex % itemCount;
      if (logical === cur && desktopSlideIndex < itemCount) return;
      setDesktopSlideIndex(logical);
    },
    [desktopSlideIndex, itemCount],
  );

  const onCarouselTouchStart = useCallback(
    (e: ReactTouchEvent) => {
      if (!isNarrow || itemCount <= 1) return;
      const t = e.changedTouches[0] ?? e.touches[0];
      if (!t) return;
      touchStartRef.current = { x: t.clientX, y: t.clientY };
    },
    [isNarrow, itemCount],
  );

  const onCarouselTouchEnd = useCallback(
    (e: ReactTouchEvent) => {
      const start = touchStartRef.current;
      touchStartRef.current = null;
      if (!start || !isNarrow || itemCount <= 1) return;
      const t = e.changedTouches[0];
      if (!t) return;
      const dx = t.clientX - start.x;
      const dy = t.clientY - start.y;
      if (Math.abs(dx) < SWIPE_MIN_PX) return;
      // Prefer vertical page scroll / chart drag when the gesture is mostly vertical.
      if (Math.abs(dx) <= Math.abs(dy)) return;
      const step = dx < 0 ? 1 : -1;
      bumpActivity();
      setPaused(true);
      setActiveIndex((prev) => (prev + step + itemCount) % itemCount);
    },
    [isNarrow, itemCount, bumpActivity],
  );

  useEffect(() => {
    if (!prefReady || hidden || paused || !isCarousel || itemCount === 0) {
      return;
    }
    const dwellMs = ROTATE_MS * activeDwellSteps;
    const id = window.setTimeout(() => {
      if (desktopCarousel) {
        // Continuous L→R: (1,2,3) → (2,3,4) → (3,4,1) → … via extended track.
        setDesktopSlideIndex((prev) => prev + 1);
        return;
      }
      setActiveIndex((prev) => (prev + 1) % itemCount);
    }, dwellMs);
    return () => window.clearTimeout(id);
    // Deliberately omit `items` — parent re-renders must not reset the dwell timer.
  }, [
    prefReady,
    hidden,
    paused,
    isCarousel,
    desktopCarousel,
    itemCount,
    activeIndex,
    desktopSlideIndex,
    activeDwellSteps,
  ]);

  // One "INTERACTIVE GRAPHS" cue (mobile beside controls; desktop once, right-aligned).
  useEffect(() => {
    if (!prefReady || hidden || items.length === 0) {
      setShowInteractiveHint(false);
      return;
    }
    setShowInteractiveHint(true);
    const id = window.setTimeout(
      () => setShowInteractiveHint(false),
      INTERACTIVE_HINT_MS,
    );
    return () => window.clearTimeout(id);
  }, [prefReady, hidden, items.length]);

  // Mark on-screen carousel slides as seen (mobile 1-up + desktop window).
  useEffect(() => {
    if (hidden || items.length === 0) return;
    if (!isCarousel) {
      setSeenCarouselKeys(new Set(items.map((s) => s.key)));
      return;
    }
    setSeenCarouselKeys((prev) => {
      const next = new Set(prev);
      if (isNarrow) {
        const key = items[safeActiveIndex]?.key;
        if (key) next.add(key);
      } else {
        for (let o = 0; o < DESKTOP_VISIBLE; o++) {
          const key = items[(safeActiveIndex + o) % items.length]?.key;
          if (key) next.add(key);
        }
      }
      return next.size === prev.size ? prev : next;
    });
  }, [hidden, isCarousel, isNarrow, items, safeActiveIndex]);

  // Auto-hide after idle — skipped when user explicitly clicked Show graphs.
  // On mobile carousel, wait until every graph has been shown at least once
  // so Luxury/Mid/Value/Discount (#4) isn’t hidden before it appears.
  useEffect(() => {
    if (!prefReady || hidden || items.length === 0 || autoHideSuspended) return;
    if (isCarousel && seenCarouselKeys.size < items.length) return;
    const id = window.setTimeout(() => {
      setHiddenPref(true);
    }, AUTO_HIDE_IDLE_MS);
    return () => window.clearTimeout(id);
  }, [
    prefReady,
    hidden,
    items.length,
    activityEpoch,
    autoHideSuspended,
    setHiddenPref,
    isCarousel,
    seenCarouselKeys,
  ]);

  if (renderItems.length === 0) return null;

  const toggleClass =
    "font-mono text-[9px] tracking-[0.12em] uppercase text-navy/55 underline decoration-navy/25 underline-offset-2 transition-colors hover:text-navy hover:decoration-gold";

  const pauseToggle = (
    <button
      type="button"
      className={`inline-flex h-6 w-6 items-center justify-center rounded-full border shadow-sm transition-colors ${
        paused
          ? "border-gold/50 bg-gold/15 text-navy hover:bg-gold/25"
          : "border-navy/20 bg-white text-navy hover:border-navy/40 hover:bg-navy/[0.04]"
      }`}
      onClick={() => {
        bumpActivity();
        setPaused((p) => !p);
      }}
      aria-pressed={paused}
      aria-label={paused ? "Resume graph rotation" : "Pause graph rotation"}
      title={paused ? "Play carousel" : "Pause carousel"}
    >
      {paused ? (
        <svg viewBox="0 0 12 12" className="h-3 w-3" fill="currentColor" aria-hidden>
          <path d="M3.2 1.6v8.8l7.2-4.4z" />
        </svg>
      ) : (
        <svg viewBox="0 0 12 12" className="h-3 w-3" fill="currentColor" aria-hidden>
          <rect x="2.4" y="1.8" width="2.2" height="8.4" rx="0.4" />
          <rect x="7.4" y="1.8" width="2.2" height="8.4" rx="0.4" />
        </svg>
      )}
    </button>
  );

  const interactiveHintMobile = (
    <p
      className={`pointer-events-none shrink-0 italic text-[10px] leading-snug text-slate/55 transition-opacity duration-700 ease-in-out ${
        showInteractiveHint ? "animate-interactive-graph-hint" : "opacity-0"
      }`}
      aria-hidden={!showInteractiveHint}
    >
      interactive graph
    </p>
  );

  /** Desktop: single cue, bottom-aligned with count row, right edge of listings column. */
  const interactiveHintDesktop = (
    <p
      className={`pointer-events-none shrink-0 self-end font-mono text-[9px] leading-none tracking-[0.12em] uppercase text-navy/55 transition-opacity duration-700 ease-in-out ${
        showInteractiveHint ? "animate-interactive-graph-hint" : "opacity-0"
      }`}
      aria-hidden={!showInteractiveHint}
    >
      Interactive graphs
    </p>
  );

  const desktopWindowEndExclusive = desktopCarousel
    ? safeActiveIndex + DESKTOP_VISIBLE
    : 0;
  const desktopRangeLabel = (() => {
    if (!desktopCarousel || renderItems.length === 0) return "";
    const start = safeActiveIndex + 1;
    if (desktopWindowEndExclusive <= renderItems.length) {
      return `${start}–${desktopWindowEndExclusive}`;
    }
    const wrapEnd = desktopWindowEndExclusive - renderItems.length;
    return `${start}–${renderItems.length} · 1–${wrapEnd}`;
  })();

  const carouselCount =
    isCarousel && renderItems.length > 1 ? (
      <span
        className="font-mono text-[9px] tracking-[0.12em] uppercase tabular-nums text-navy/55"
        aria-live="polite"
      >
        {desktopCarousel
          ? `${desktopRangeLabel} of ${renderItems.length}`
          : `${safeActiveIndex + 1} of ${renderItems.length}`}
        {desktopCarousel ? ` · ${DESKTOP_VISIBLE} shown` : ""}
      </span>
    ) : null;

  const carouselChrome = isCarousel ? (
    <div className="mt-1.5 flex items-center gap-2">
      <div className="flex min-w-0 flex-1 flex-wrap items-center justify-start gap-2">
        {carouselCount}
        <div
          className="flex items-center gap-1.5"
          role="tablist"
          aria-label="Mini graphs"
        >
          {renderItems.map((item, i) => {
            const selected = desktopCarousel
              ? Array.from({ length: DESKTOP_VISIBLE }, (_, o) =>
                  (safeActiveIndex + o) % renderItems.length,
                ).includes(i)
              : i === safeActiveIndex;
            return (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-label={`Show graph ${i + 1} of ${renderItems.length}`}
                className={`h-1.5 rounded-full transition-all ${
                  selected
                    ? "w-4 bg-navy"
                    : "w-1.5 bg-navy/25 hover:bg-navy/45"
                }`}
                onClick={() => {
                  bumpActivity();
                  setPaused(true);
                  if (desktopCarousel) {
                    goDesktopSlide(i, { animate: true });
                  } else {
                    setActiveIndex(i);
                  }
                }}
              />
            );
          })}
        </div>
        {pauseToggle}
        {isNarrow ? interactiveHintMobile : null}
      </div>
      {!isNarrow ? (
        <div className="ml-auto shrink-0">{interactiveHintDesktop}</div>
      ) : null}
      {isNarrow && carouselTrailing ? (
        <div className="ml-auto shrink-0">{carouselTrailing}</div>
      ) : null}
    </div>
  ) : !isNarrow || carouselTrailing ? (
    <div className="mt-1.5 flex items-center gap-2">
      <div className="min-w-0 flex-1" />
      {!isNarrow ? interactiveHintDesktop : null}
      {isNarrow && carouselTrailing ? (
        <div className="ml-auto shrink-0">{carouselTrailing}</div>
      ) : null}
    </div>
  ) : null;

  return (
    <MiniGraphsCarouselContext.Provider value={carouselApi}>
      <div
        className={
          hidden && !showHideToggle
            ? ""
            : "mb-2 flex flex-col gap-1 items-stretch"
        }
      >
        {showHideToggle ? (
          <div
            className={`flex justify-start ${desktopHideToggleOnly ? "hidden lg:flex" : ""}`}
          >
            <button
              type="button"
              className={toggleClass}
              onClick={() => {
                if (hidden) {
                  setAutoHideSuspended(true);
                  setHiddenPref(false);
                } else {
                  setHiddenPref(true);
                }
              }}
              aria-pressed={hidden}
            >
              {hidden ? "Show graphs" : "Hide graphs"}
            </button>
          </div>
        ) : null}

        {!hidden ? (
          <div className="w-full" onPointerDownCapture={bumpActivity}>
            <div
              className={
                isNarrow || desktopCarousel
                  ? "relative w-full overflow-hidden touch-pan-y [container-type:inline-size]"
                  : "w-full"
              }
              onTouchStart={isNarrow ? onCarouselTouchStart : undefined}
              onTouchEnd={isNarrow ? onCarouselTouchEnd : undefined}
              onTouchCancel={
                isNarrow
                  ? () => {
                      touchStartRef.current = null;
                    }
                  : undefined
              }
              aria-roledescription={isCarousel ? "carousel" : undefined}
              aria-label={
                isNarrow && renderItems.length > 1
                  ? "Mini graphs — swipe left or right to change"
                  : desktopCarousel
                    ? `Mini graphs — ${DESKTOP_VISIBLE} visible; slides continuously left to right`
                    : undefined
              }
            >
              {desktopCarousel ? (
                <div
                  className={`flex flex-row items-start gap-4 will-change-transform ease-in-out motion-reduce:transition-none ${
                    desktopSlideNoAnim
                      ? "transition-none"
                      : "transition-transform"
                  }`}
                  style={{
                    // 100cqi = strip width; slot = one card + gap.
                    transform: `translateX(calc(-${desktopSlideIndex} * (100cqi + ${DESKTOP_GAP_PX}px) / ${DESKTOP_VISIBLE}))`,
                    transitionDuration: desktopSlideNoAnim
                      ? "0ms"
                      : `${DESKTOP_SLIDE_MS}ms`,
                  }}
                  onTransitionEnd={(e) => {
                    if (e.target !== e.currentTarget) return;
                    if (e.propertyName !== "transform") return;
                    if (itemCount === 0) return;
                    if (desktopSlideIndex < itemCount) return;
                    // Landed on clones — snap to the equivalent real index.
                    setDesktopSlideNoAnim(true);
                    setDesktopSlideIndex(desktopSlideIndex % itemCount);
                  }}
                >
                  {[
                    ...renderItems,
                    ...renderItems.slice(0, DESKTOP_CLONE_COUNT),
                  ].map((item, i) => {
                    const logical = i % Math.max(renderItems.length, 1);
                    const visible =
                      logical === safeActiveIndex ||
                      Array.from({ length: DESKTOP_VISIBLE }, (_, o) =>
                        (safeActiveIndex + o) % renderItems.length,
                      ).includes(logical);
                    const cardW = `calc((100cqi - ${(DESKTOP_VISIBLE - 1) * DESKTOP_GAP_PX}px) / ${DESKTOP_VISIBLE})`;
                    return (
                      <div
                        key={`${item.key}-${i}`}
                        className="min-w-0 shrink-0"
                        style={{ width: cardW, flex: `0 0 ${cardW}` }}
                        aria-hidden={!visible}
                      >
                        {item.node}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div
                  className={
                    isNarrow
                      ? "flex transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none"
                      : "flex flex-row items-start gap-4"
                  }
                  style={
                    isNarrow
                      ? { transform: `translateX(-${safeActiveIndex * 100}%)` }
                      : undefined
                  }
                >
                  {renderItems.map((item, i) => (
                    <div
                      key={item.key}
                      className={
                        isNarrow
                          ? "w-full min-w-full shrink-0"
                          : "w-full min-w-0 flex-1"
                      }
                      aria-hidden={isNarrow ? i !== safeActiveIndex : undefined}
                    >
                      {item.node}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {carouselChrome}
          </div>
        ) : null}
      </div>
    </MiniGraphsCarouselContext.Provider>
  );
}
