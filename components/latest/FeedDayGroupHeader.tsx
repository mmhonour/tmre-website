import FeedCollapseSign from "@/components/latest/FeedCollapseSign";

/**
 * Day divider in the chronological /latest and /closed feeds. It used to be a
 * static rule, which left those views with no way to skip a day — so the whole
 * bar is now the collapse control for that day's rows.
 */
export default function FeedDayGroupHeader({
  label,
  count,
  collapsed,
  onToggle,
}: {
  label: string;
  count: number;
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={!collapsed}
      aria-label={
        collapsed ? `Expand ${label} listings` : `Collapse ${label} listings`
      }
      className="group flex w-full items-center gap-2 border-b border-charcoal/[0.08] bg-cream/60 px-3 py-1.5 text-left font-mono text-[11px] tracking-[0.14em] uppercase text-charcoal/55 transition-colors hover:text-navy sm:px-4"
    >
      <FeedCollapseSign collapsed={collapsed} />
      <span className="font-semibold text-navy/70">{label}</span>
      <span className="tabular-nums text-charcoal/45">{count}</span>
    </button>
  );
}
