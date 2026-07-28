"use client";

import { useEffect, useRef, useState } from "react";

export type StatsChartNavItem = {
  id: string;
  label: string;
};

/**
 * Collapsed “Jump to chart” control — opens a compact pop-out over the sidebar
 * so the first town card stays top-aligned with the first graph.
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
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setOpen(false);
  };

  return (
    <div
      ref={rootRef}
      className="stats-chart-nav stats-print-screen-only absolute top-2.5 right-2.5 z-30"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="stats-chart-jump-panel"
        className="rounded-md border border-charcoal/15 bg-white/95 px-2.5 py-1 font-mono text-[10px] tracking-[0.12em] uppercase text-navy shadow-sm backdrop-blur-sm transition-colors hover:border-gold/40 hover:text-gold"
      >
        Jump to chart{open ? " · close" : ""}
      </button>

      {open ? (
        <nav
          id="stats-chart-jump-panel"
          aria-label="Chart sections"
          className="absolute right-0 top-full mt-1.5 w-[min(16.5rem,calc(100vw-2.5rem))] rounded-xl border border-charcoal/15 bg-cream shadow-[0_12px_28px_rgba(28,42,58,0.16)]"
        >
          <ul className="max-h-[min(22rem,55vh)] overflow-y-auto py-1.5">
            {items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => scrollTo(item.id)}
                  className="w-full px-3 py-1.5 text-left font-mono text-[10px] tracking-[0.08em] uppercase text-navy transition-colors hover:bg-white hover:text-gold"
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
