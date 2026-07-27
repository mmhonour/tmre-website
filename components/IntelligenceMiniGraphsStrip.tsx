"use client";

import {
  createContext,
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

export type IntelligenceMiniGraphSlot = {
  key: string;
  node: ReactNode;
};

export type MiniGraphsCarouselApi = {
  paused: boolean;
  /** True when the mobile one-at-a-time carousel is active. */
  isCarousel: boolean;
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
 * 2→3→1, 3→1→2, … until paused. Hide toggle can live outside (under Vintages).
 */
export default function IntelligenceMiniGraphsStrip({
  slots,
  onInteractRef,
  hidden: hiddenProp,
  onHiddenChange,
  showHideToggle = true,
  /** Hide graphs lives under Vintages on mobile — keep strip toggle for desktop only. */
  desktopHideToggleOnly = false,
}: {
  slots: IntelligenceMiniGraphSlot[];
  /** Parent assigns pause() when a chart point is clicked. */
  onInteractRef: MutableRefObject<(() => void) | null>;
  /** Controlled hide (when Hide graphs sits under Vintages on mobile). */
  hidden?: boolean;
  onHiddenChange?: (hidden: boolean) => void;
  /** When false, parent owns the Hide graphs control entirely. */
  showHideToggle?: boolean;
  desktopHideToggleOnly?: boolean;
}) {
  const items = useMemo(
    () => slots.filter((s) => s.node != null),
    [slots],
  );

  const [hiddenInternal, setHiddenInternal] = useState(false);
  const controlled = onHiddenChange != null;
  const hidden = controlled ? Boolean(hiddenProp) : hiddenInternal;

  const [prefReady, setPrefReady] = useState(false);
  const [isNarrow, setIsNarrow] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [showInteractiveHint, setShowInteractiveHint] = useState(false);

  const carouselApi = useMemo<MiniGraphsCarouselApi>(
    () => ({
      paused,
      isCarousel: isNarrow && items.length > 1,
      pause: () => setPaused(true),
      resume: () => setPaused(false),
      toggle: () => setPaused((p) => !p),
    }),
    [paused, isNarrow, items.length],
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
    onInteractRef.current = () => setPaused(true);
    return () => {
      onInteractRef.current = null;
    };
  }, [onInteractRef]);

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
    const id = window.setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % items.length);
    }, ROTATE_MS);
    return () => window.clearInterval(id);
  }, [prefReady, hidden, isNarrow, paused, items.length]);

  // Mobile: "interactive graph" lives to the right of the carousel bar.
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

  const setHiddenPref = (next: boolean) => {
    if (controlled) onHiddenChange?.(next);
    else setHiddenInternal(next);
    if (!next) setPaused(false);
    try {
      sessionStorage.setItem(HIDDEN_PREF_KEY, next ? "1" : "0");
    } catch {
      /* ignore */
    }
  };

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
      onClick={() => setPaused((p) => !p)}
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

  return (
    <MiniGraphsCarouselContext.Provider value={carouselApi}>
      <div className="mb-2 flex flex-col gap-1 items-stretch">
        {showHideToggle ? (
          <div
            className={`flex justify-end ${desktopHideToggleOnly ? "hidden lg:flex" : ""}`}
          >
            <button
              type="button"
              className={toggleClass}
              onClick={() => setHiddenPref(!hidden)}
              aria-pressed={hidden}
            >
              {hidden ? "Show graphs" : "Hide graphs"}
            </button>
          </div>
        ) : null}

        {!hidden ? (
          <div className="w-full">
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

            {isNarrow ? (
              <div className="mt-1.5 flex flex-wrap items-center justify-start gap-2">
                {items.length > 1 ? (
                  <>
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
                            setActiveIndex(i);
                            // Stay on the chosen graph while working with it.
                            setPaused(true);
                          }}
                        />
                      ))}
                    </div>
                    {pauseToggle}
                  </>
                ) : null}
                {interactiveHint}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </MiniGraphsCarouselContext.Provider>
  );
}
