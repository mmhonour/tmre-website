"use client";

export type StatsChartNavItem = {
  id: string;
  label: string;
};

export default function StatsChartNav({ items }: { items: StatsChartNavItem[] }) {
  if (items.length === 0) return null;

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <nav
      aria-label="Chart sections"
      className="stats-chart-nav stats-print-screen-only sticky top-20 z-20 mb-8 rounded-2xl border border-charcoal/[0.08] bg-white/95 px-4 py-3 shadow-sm backdrop-blur-sm"
    >
      <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-slate mb-2.5">
        Jump to chart
      </p>
      <div className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:gap-2">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => scrollTo(item.id)}
            className={
              "font-mono text-[10px] tracking-[0.08em] uppercase text-navy hover:text-gold text-left transition-colors " +
              // Mobile: plain links. Desktop/tablet: pill chips.
              "underline underline-offset-2 decoration-navy/25 hover:decoration-gold " +
              "sm:no-underline sm:border sm:border-charcoal/10 sm:hover:border-gold/40 sm:rounded-full sm:px-3 sm:py-1.5 sm:bg-cream/60"
            }
          >
            {item.label}
          </button>
        ))}
      </div>
    </nav>
  );
}
