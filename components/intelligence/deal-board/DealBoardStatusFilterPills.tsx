"use client";

import type { DealBoardStatusFilter } from "@/components/intelligence/deal-board/deal-board-types";

const STATUS_PILL_CLASS: Record<Exclude<DealBoardStatusFilter, "all">, string> = {
  new: "bg-sage/10 text-sage border-sage/30",
  active: "bg-sky/10 text-sky border-sky/30",
  reduced: "bg-coral/10 text-coral border-coral/30",
};

const STATUS_OPTIONS: {
  value: Exclude<DealBoardStatusFilter, "all">;
  label: string;
}[] = [
  { value: "new", label: "New" },
  { value: "reduced", label: "Reduced!" },
  { value: "active", label: "Active" },
];

export default function DealBoardStatusFilterPills({
  value,
  onChange,
  compact = false,
}: {
  value: DealBoardStatusFilter;
  onChange: (value: DealBoardStatusFilter) => void;
  /** Map / narrow toolbars: smaller pills that share the row width. */
  compact?: boolean;
}) {
  const hasActiveFilter = value !== "all";

  return (
    <div
      className={`flex flex-nowrap items-center ${
        compact ? "w-full justify-stretch gap-0.5" : "justify-center gap-1"
      }`}
      role="group"
      aria-label="Filter by listing status"
    >
      {STATUS_OPTIONS.map((opt) => {
        const selected = value === opt.value;
        const label = compact && opt.value === "reduced" ? "Red." : opt.label;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(selected ? "all" : opt.value)}
            aria-pressed={selected}
            aria-label={opt.label}
            className={`inline-flex items-center justify-center font-mono uppercase border rounded-full transition-all cursor-pointer hover:opacity-90 ${
              compact
                ? "min-w-0 flex-1 px-1 py-px text-[8px] tracking-[0.08em]"
                : "px-2 py-0.5 text-[9px] tracking-[0.12em]"
            } ${STATUS_PILL_CLASS[opt.value]} ${
              selected
                ? compact
                  ? "ring-1 ring-navy/35"
                  : "ring-2 ring-navy/35 ring-offset-1 ring-offset-cream"
                : hasActiveFilter
                  ? "opacity-45"
                  : ""
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
