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
/** Desktop 3-up window: slow L↔R slide (transform only). */
const DESKTOP_SLIDE_MS = 1_400;
/** Tailwind gap-4 between desktop slides. */
const DESKTOP_GAP_PX = 16;

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
  /** True when mobile (1-up) or desktop (3-up window) carousel is active. */
  isCarousel: boolean;
  /** Key of the currently focused slide (null when not in carousel mode). */
  activeKey: string | null;
  /** True when this graph is on-screen (mobile active slide or desktop 3-up window). */
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

/** How many mini-graphs show at once on desktop before the strip carousels. */
const DESKTOP_VISIBLE = 3;

/**
 * Desktop: up to 3 charts in a row; when there are more, slowly slide the
 * 3-wide window left↔right (transform ping-pong — same pause / dwell as mobile).
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
  const [paused, setPaused] = useState(false);
  const [showInteractiveHint, setShowInteractiveHint] = useState(false);
  /** Bumped on real user interaction so the idle auto-hide timer restarts. */
  const [activityEpoch, setActivityEpoch] = useState(0);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  /** Desktop ping-pong direction for the sliding 3-up window. */
  const desktopDirRef = useRef(1);

  // Fresh visit / remount after navigating away — always start rotating.
  useEffect(() => {
    setPaused(false);
    setActiveIndex(0);
    desktopDirRef.current = 1;
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
  const desktopMaxIndex = Math.max(0, items.length - DESKTOP_VISIBLE);

  const safeActiveIndex = useMemo(() => {
    if (items.length === 0) return 0;
    if (desktopCarousel) {
      return Math.min(Math.max(0, activeIndex), desktopMaxIndex);
    }
    return activeIndex % items.length;
  }, [activeIndex, desktopCarousel, desktopMaxIndex, items.length]);

  const activeKey =
    isCarousel && items.length > 0
      ? (items[safeActiveIndex]?.key ?? null)
      : null;

  const isKeyVisible = useCallback(
    (key: string) => {
      if (!isCarousel || items.length === 0) return true;
      if (isNarrow) return items[safeActiveIndex]?.key === key;
      for (let o = 0; o < DESKTOP_VISIBLE; o++) {
        if (items[safeActiveIndex + o]?.key === key) return true;
      }
      return false;
    },
    [isCarousel, isNarrow, items, safeActiveIndex],
  );

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
    // Match Tailwind `lg`: phones + tablets get 1-up so all graphs (incl. DOM)
    // are reachable. Desktop `lg+` keeps the 3-wide sliding window.
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
    if (desktopCarousel) {
      if (activeIndex > desktopMaxIndex) setActiveIndex(desktopMaxIndex);
      return;
    }
    if (activeIndex >= items.length) setActiveIndex(0);
  }, [items.length, activeIndex, desktopCarousel, desktopMaxIndex]);

  const itemCount = items.length;
  const activeDwellSteps = (() => {
    if (items.length === 0) return 1;
    if (!desktopCarousel) {
      return Math.max(1, items[safeActiveIndex]?.carouselDwellSteps ?? 1);
    }
    let max = 1;
    for (let o = 0; o < DESKTOP_VISIBLE; o++) {
      max = Math.max(max, items[safeActiveIndex + o]?.carouselDwellSteps ?? 1);
    }
    return max;
  })();

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
        const max = Math.max(0, itemCount - DESKTOP_VISIBLE);
        if (max === 0) return;
        setActiveIndex((prev) => {
          const cur = Math.min(Math.max(0, prev), max);
          let next = cur + desktopDirRef.current;
          if (next > max) {
            desktopDirRef.current = -1;
            next = Math.max(0, max - 1);
          } else if (next < 0) {
            desktopDirRef.current = 1;
            next = Math.min(1, max);
          }
          return next;
        });
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
    activeDwellSteps,
  ]);

  // Mobile: "interactive graph" hint beside the carousel controls.
  useEffect(() => {
    if (!prefReady || hidden || !isNarrow || items.length === 0) {
      setShowInteractiveHint(false);
      return;
    }
    setShowInteractiveHint(true);
    const id = window.setTimeout(
      () => setShowInteractiveHint(false),
      INTERACTIVE_HINT_MS,
    );
    return () => window.clearTimeout(id);
  }, [prefReady, hidden, isNarrow, items.length]);

  // Auto-hide after idle — skipped when user explicitly clicked Show graphs.
  useEffect(() => {
    if (!prefReady || hidden || items.length === 0 || autoHideSuspended) return;
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

  const interactiveHint = (
    <p
      className={`pointer-events-none shrink-0 italic text-[10px] leading-snug text-slate/55 transition-opacity duration-700 ease-in-out ${
        showInteractiveHint ? "animate-interactive-graph-hint" : "opacity-0"
      }`}
      aria-hidden={!showInteractiveHint}
    >
      interactive graph
    </p>
  );

  const desktopWindowEnd = desktopCarousel
    ? Math.min(renderItems.length, safeActiveIndex + DESKTOP_VISIBLE)
    : 0;

  const carouselCount =
    isCarousel && renderItems.length > 1 ? (
      <span
        className="font-mono text-[9px] tracking-[0.12em] uppercase tabular-nums text-navy/55"
        aria-live="polite"
      >
        {desktopCarousel
          ? `${safeActiveIndex + 1}–${desktopWindowEnd} of ${renderItems.length}`
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
              ? i >= safeActiveIndex && i < safeActiveIndex + DESKTOP_VISIBLE
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
                  if (desktopCarousel) {
                    setActiveIndex(
                      Math.min(i, Math.max(0, renderItems.length - DESKTOP_VISIBLE)),
                    );
                    desktopDirRef.current = 1;
                  } else {
                    setActiveIndex(i);
                  }
                  setPaused(true);
                }}
              />
            );
          })}
        </div>
        {pauseToggle}
        {isNarrow ? interactiveHint : null}
      </div>
      {isNarrow && carouselTrailing ? (
        <div className="ml-auto shrink-0">{carouselTrailing}</div>
      ) : null}
    </div>
  ) : isNarrow && carouselTrailing ? (
    <div className="mt-1.5 flex items-center gap-2">
      <div className="min-w-0 flex-1" />
      <div className="ml-auto shrink-0">{carouselTrailing}</div>
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
                    ? "Mini graphs — three visible; slides slowly left and right"
                    : undefined
              }
            >
              {desktopCarousel ? (
                <div
                  className="flex flex-row items-start gap-4 will-change-transform transition-transform ease-in-out motion-reduce:transition-none"
                  style={{
                    // 100cqi = viewport width (container); slot = one card + gap.
                    transform: `translateX(calc(-${safeActiveIndex} * (100cqi + ${DESKTOP_GAP_PX}px) / ${DESKTOP_VISIBLE}))`,
                    transitionDuration: `${DESKTOP_SLIDE_MS}ms`,
                  }}
                >
                  {renderItems.map((item, i) => {
                    const visible =
                      i >= safeActiveIndex &&
                      i < safeActiveIndex + DESKTOP_VISIBLE;
                    const cardW = `calc((100cqi - ${(DESKTOP_VISIBLE - 1) * DESKTOP_GAP_PX}px) / ${DESKTOP_VISIBLE})`;
                    return (
                      <div
                        key={item.key}
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
