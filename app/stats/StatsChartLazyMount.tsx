"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

export default function StatsChartLazyMount({
  children,
  minHeightClass = "min-h-[280px]",
  rootMargin = "240px 0px",
}: {
  children: ReactNode;
  minHeightClass?: string;
  rootMargin?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
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
  }, [rootMargin]);

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
