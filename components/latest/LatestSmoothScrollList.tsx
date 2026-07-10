"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";

export const LATEST_TICKER_ROW_PX = 48;
/** Max rows visible in the grouped ticker viewport (smaller groups use their row count). */
export const LATEST_SCROLL_MAX_VISIBLE_ROWS = 7;
/** Base time for one row to scroll through the viewport (grouped feeds). */
export const LATEST_SCROLL_MS_PER_ROW = 3_200;
/** Slower scroll for ungrouped “by timestamp” view. */
export const LATEST_SCROLL_MS_PER_ROW_UNGROUPED = 5_400;

type LatestSmoothScrollListProps<T> = {
  enabled: boolean;
  rows: readonly T[];
  renderRow: (row: T, duplicate: "a" | "b") => ReactNode;
  /** Desyncs scroll phase and slightly varies speed between grouped lists. */
  phaseKey?: string;
  /** Override ms per row (defaults to grouped speed). */
  msPerRow?: number;
};

function hashPhaseKey(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) {
    h = (h * 31 + key.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function scrollDurationSec(
  rowCount: number,
  msPerRow: number,
  phaseKey?: string,
): number {
  const base = (rowCount * msPerRow) / 1000;
  if (!phaseKey) return base;
  const factor = 0.9 + (hashPhaseKey(phaseKey) % 21) / 100;
  return base * factor;
}

function scrollPhaseDelaySec(durationSec: number, phaseKey?: string): number {
  if (!phaseKey || durationSec <= 0) return 0;
  const frac = (hashPhaseKey(phaseKey) % 1000) / 1000;
  return -(frac * durationSec);
}

export default function LatestSmoothScrollList<T>({
  enabled,
  rows,
  renderRow,
  phaseKey,
  msPerRow = LATEST_SCROLL_MS_PER_ROW,
}: LatestSmoothScrollListProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    if (!enabled || rows.length < 2) {
      setInView(false);
      return;
    }

    const el = containerRef.current;
    if (!el) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const io = new IntersectionObserver(
      ([entry]) => setInView(entry?.isIntersecting ?? false),
      { threshold: 0.2 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [enabled, rows.length, phaseKey]);

  if (!enabled || rows.length < 2) {
    return <>{rows.map((row) => renderRow(row, "a"))}</>;
  }

  const durationSec = scrollDurationSec(rows.length, msPerRow, phaseKey);
  const delaySec = scrollPhaseDelaySec(durationSec, phaseKey);
  const visibleRows = Math.min(rows.length, LATEST_SCROLL_MAX_VISIBLE_ROWS);

  return (
    <div
      ref={containerRef}
      className={`latest-smooth-scroll overflow-hidden${inView ? " is-visible" : ""}`}
      style={
        {
          "--latest-visible-rows": String(visibleRows),
        } as React.CSSProperties
      }
    >
      <div
        className="latest-smooth-scroll-track"
        style={
          {
            "--latest-scroll-duration": `${durationSec}s`,
            "--latest-row-height": `${LATEST_TICKER_ROW_PX}px`,
            animationDelay: `${delaySec}s`,
          } as React.CSSProperties
        }
      >
        <div className="latest-smooth-scroll-set">
          {rows.map((row) => renderRow(row, "a"))}
        </div>
        <div className="latest-smooth-scroll-set" aria-hidden>
          {rows.map((row) => renderRow(row, "b"))}
        </div>
      </div>
    </div>
  );
}
