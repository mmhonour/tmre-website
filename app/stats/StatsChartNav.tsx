"use client";

import { useEffect, useRef, useState } from "react";
import { scrollToStatsAnchor } from "./stats-scroll";

export type StatsChartNavItem = {
  id: string;
  label: string;
};

/**
 * Collapsed “Jump to chart” control for the Stats hero — right-aligned with
 * the charts column; opens a compact pop-out list.
 */
export default function StatsChartNav({ items }: { items: StatsChartNavItem[] }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (items.length === 0) return null;

  const scrollTo = (id: string) => {
    setOpen(false);
    // Charts below the fold are mounted by an intersection observer, so a jump
    // to one that has never been on screen has nothing to aim at yet. Retry
    // briefly rather than dropping the click.
    let attempts = 0;
    const tryScroll = () => {
      const el = document.getElementById(id);
      if (el) {
        scrollToStatsAnchor(el);
        return;
      }
      attempts += 1;
      if (attempts < 12) window.setTimeout(tryScroll, 100);
    };
    tryScroll();
  };

  return (
    <div ref={rootRef} className="stats-chart-nav stats-print-screen-only relative z-30">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="stats-chart-jump-panel"
        className="bg-transparent p-0 m-0 border-0 cursor-pointer font-mono text-[11px] tracking-[0.12em] uppercase text-white/85 underline decoration-white/35 underline-offset-2 hover:text-gold hover:decoration-gold/55 transition-colors"
      >
        Jump to chart{open ? " · close" : ""}
      </button>

      {open ? (
        <nav
          id="stats-chart-jump-panel"
          aria-label="Chart sections"
          className="absolute right-0 top-full mt-1.5 w-[min(16.5rem,calc(100vw-2.5rem))] rounded-xl border border-white/15 bg-navy shadow-[0_12px_28px_rgba(0,0,0,0.35)]"
        >
          <ul className="max-h-[min(22rem,55vh)] overflow-y-auto py-1.5">
            {items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => scrollTo(item.id)}
                  className="w-full px-3 py-1.5 text-left font-mono text-[10px] tracking-[0.08em] uppercase text-white/85 transition-colors hover:bg-white/10 hover:text-gold"
                >
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
    </div>
  );
}
