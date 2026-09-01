"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

export default function StatsChartLazyMount({
  children,
  minHeightClass = "min-h-[280px]",
  rootMargin = "240px 0px",
  eager = false,
}: {
  children: ReactNode;
  minHeightClass?: string;
  rootMargin?: string;
  /**
   * Mount without waiting to be scrolled past. A deep link has to find its
   * chart's anchor in the DOM before it can scroll to it, and a chart that has
   * never been on screen has no anchor to find.
   */
  eager?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(eager);

  useEffect(() => {
    if (eager) return;
    const el = ref.current;
    if (!el) return;

    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [rootMargin, eager]);

  return (
    <div ref={ref} className={minHeightClass}>
      {visible ? (
        children
      ) : (
        <div className="h-72 flex items-center justify-center rounded-2xl border border-charcoal/[0.08] bg-white/60">
          <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-slate/50 animate-pulse">
            Loading chart…
          </span>
        </div>
      )}
    </div>
  );
}
