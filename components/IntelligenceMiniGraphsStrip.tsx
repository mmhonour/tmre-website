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
 * 2→3→1, 3→1→2, … until the user clicks a graph element (pauses rotation).
 * Both: quiet/hide toggle to browse listings without mini-graphs.
 */
export default function IntelligenceMiniGraphsStrip({
  slots,
  onInteractRef,
}: {
  slots: IntelligenceMiniGraphSlot[];
  /** Parent assigns () => pause carousel when a chart point is clicked. */
  onInteractRef: MutableRefObject<(() => void) | null>;
}) {
  const items = useMemo(
    () => slots.filter((s) => s.node != null),
    [slots],
  );

  const [hidden, setHidden] = useState(false);
  const [prefReady, setPrefReady] = useState(false);
  const [isNarrow, setIsNarrow] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    try {
      setHidden(sessionStorage.getItem(HIDDEN_PREF_KEY) === "1");
    } catch {
      /* private mode */
    }
    setPrefReady(true);
  }, []);

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
    setHidden(next);
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

  return (
    <div className="mb-2 flex flex-col gap-1">
      <div className="flex justify-end">
        <button
          type="button"
          className={toggleClass}
          onClick={() => setHiddenPref(!hidden)}
          aria-pressed={hidden}
        >
          {hidden ? "Show graphs" : "Hide graphs"}
        </button>
      </div>

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
                      ? "w-full min-w-full shrink-0"
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
            <div
              className="mt-1.5 flex items-center justify-center gap-1.5"
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
          ) : null}

          {isNarrow && paused && items.length > 1 ? (
            <div className="mt-1 flex justify-center">
              <button
                type="button"
                className={toggleClass}
                onClick={() => setPaused(false)}
              >
                Resume graph rotation
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
