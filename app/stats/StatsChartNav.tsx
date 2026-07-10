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
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => scrollTo(item.id)}
            className="font-mono text-[10px] tracking-[0.08em] uppercase text-navy hover:text-gold border border-charcoal/10 hover:border-gold/40 rounded-full px-3 py-1.5 transition-colors bg-cream/60 text-left"
          >
            {item.label}
          </button>
        ))}
      </div>
    </nav>
  );
}
