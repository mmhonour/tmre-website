"use client";

import {
  useEffect,
  useMemo,
  useState,
  type MutableRefObject,
  type ReactNode,
} from "react";

const HIDDEN_PREF_KEY = "tmre-intel-mini-graphs-hidden";
const ROTATE_MS = 5_000;

export type IntelligenceMiniGraphSlot = {
  key: string;
  node: ReactNode;
};

/**
 * Desktop: Median | Inventory by price | Luxury inventory by price in one row.
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
  /** Parent assigns () => pause carousel when a chart point is clicked. */
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
      className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-navy/20 bg-white font-mono text-[11px] text-navy shadow-sm transition-colors hover:border-navy/40 hover:bg-navy/[0.04]"
      onClick={() => setPaused((p) => !p)}
      aria-pressed={paused}
      aria-label={paused ? "Resume graph rotation" : "Pause graph rotation"}
      title={paused ? "Play" : "Pause"}
    >
      {paused ? "▶" : "⏸"}
    </button>
  );

  return (
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

          {isNarrow && items.length > 1 ? (
            <div className="mt-1.5 flex items-center justify-start gap-2">
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
                    onClick={() => setActiveIndex(i)}
                  />
                ))}
              </div>
              {pauseToggle}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
