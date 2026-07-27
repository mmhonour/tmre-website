"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type MutableRefObject,
  type ReactNode,
} from "react";

const HIDDEN_PREF_KEY = "tmre-intel-mini-graphs-hidden";
const ROTATE_MS = 5_000;
const INTERACTIVE_HINT_MS = 10_000;
/** Hide the strip after this long with no pointer/chart interaction. */
const AUTO_HIDE_IDLE_MS = 10_000;

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
  /** True when the mobile one-at-a-time carousel is active. */
  isCarousel: boolean;
  /** Key of the currently visible slide (null when not in carousel mode). */
  activeKey: string | null;
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
 * Desktop: Median | Inventory by price | Market-band inventory by price in one row.
 * Mobile: one chart at a time; slides left through 1→2→3, then continues as
 * 2→3→1, 3→1→2, … until paused. Hide toggle often lives outside (left of board).
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
  const items = useMemo(
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
  const [isNarrow, setIsNarrow] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [showInteractiveHint, setShowInteractiveHint] = useState(false);
  /** Bumped on real user interaction so the idle auto-hide timer restarts. */
  const [activityEpoch, setActivityEpoch] = useState(0);

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

  const activeKey =
    isNarrow && items.length > 0
      ? (items[activeIndex]?.key ?? null)
      : null;

  const carouselApi = useMemo<MiniGraphsCarouselApi>(
    () => ({
      paused,
      isCarousel: isNarrow && items.length > 1,
      activeKey,
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
    [paused, isNarrow, items.length, activeKey, bumpActivity],
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
    const mq = window.matchMedia("(max-width: 639px)");
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
    if (activeIndex >= items.length) setActiveIndex(0);
  }, [items.length, activeIndex]);

  useEffect(() => {
    if (
      !prefReady ||
      hidden ||
      !isNarrow ||
      paused ||
      items.length <= 1
    ) {
      return;
    }
    const steps = Math.max(1, items[activeIndex]?.carouselDwellSteps ?? 1);
    const dwellMs = ROTATE_MS * steps;
    const id = window.setTimeout(() => {
      setActiveIndex((prev) => (prev + 1) % items.length);
    }, dwellMs);
    return () => window.clearTimeout(id);
  }, [prefReady, hidden, isNarrow, paused, items, activeIndex]);

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

  if (items.length === 0) return null;

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

  const carouselCount =
    items.length > 1 ? (
      <span
        className="font-mono text-[9px] tracking-[0.12em] uppercase tabular-nums text-navy/55"
        aria-live="polite"
      >
        {activeIndex + 1} of {items.length}
      </span>
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
          <div
            className="w-full"
            onPointerDownCapture={bumpActivity}
          >
            <div
              className={
                isNarrow ? "relative w-full overflow-hidden" : "w-full"
              }
            >
              <div
                className={
                  isNarrow
                    ? "flex transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none"
                    : "flex flex-row items-start gap-4"
                }
                style={
                  isNarrow
                    ? { transform: `translateX(-${activeIndex * 100}%)` }
                    : undefined
                }
              >
                {items.map((item, i) => (
                  <div
                    key={item.key}
                    className={
                      isNarrow
                        ? "w-full min-w-full shrink-0 flex justify-start"
                        : "w-full min-w-0 max-w-md flex-1"
                    }
                    aria-hidden={isNarrow ? i !== activeIndex : undefined}
                  >
                    {item.node}
                  </div>
                ))}
              </div>
            </div>

            {isNarrow && (items.length > 1 || carouselTrailing) ? (
              <div className="mt-1.5 flex items-center gap-2">
                {items.length > 1 ? (
                  <div className="flex min-w-0 flex-1 flex-wrap items-center justify-start gap-2">
                    {carouselCount}
                    <div
                      className="flex items-center gap-1.5"
                      role="tablist"
                      aria-label="Mini graphs"
                    >
                      {items.map((item, i) => (
                        <button
                          key={item.key}
                          type="button"
                          role="tab"
                          aria-selected={i === activeIndex}
                          aria-label={`Show graph ${i + 1} of ${items.length}`}
                          className={`h-1.5 rounded-full transition-all ${
                            i === activeIndex
                              ? "w-4 bg-navy"
                              : "w-1.5 bg-navy/25 hover:bg-navy/45"
                          }`}
                          onClick={() => {
                            bumpActivity();
                            setActiveIndex(i);
                            // Stay on the chosen graph while working with it.
                            setPaused(true);
                          }}
                        />
                      ))}
                    </div>
                    {pauseToggle}
                    {interactiveHint}
                  </div>
                ) : (
                  <div className="min-w-0 flex-1" />
                )}
                {carouselTrailing ? (
                  <div className="ml-auto shrink-0">{carouselTrailing}</div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </MiniGraphsCarouselContext.Provider>
  );
}
