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
}: {
  value: DealBoardStatusFilter;
  onChange: (value: DealBoardStatusFilter) => void;
}) {
  const hasActiveFilter = value !== "all";

  return (
    <div
      className="flex flex-nowrap items-center justify-center gap-1"
      role="group"
      aria-label="Filter by listing status"
    >
      {STATUS_OPTIONS.map((opt) => {
        const selected = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(selected ? "all" : opt.value)}
            aria-pressed={selected}
            className={`inline-flex items-center font-mono text-[11px] tracking-[0.12em] uppercase border rounded-full px-2 py-0.5 transition-all cursor-pointer hover:opacity-90 ${
              STATUS_PILL_CLASS[opt.value]
            } ${
              selected
                ? "ring-2 ring-navy/35 ring-offset-1 ring-offset-cream"
                : hasActiveFilter
                  ? "opacity-45"
                  : ""
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
