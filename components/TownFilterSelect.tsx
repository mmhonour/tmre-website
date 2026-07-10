"use client";

import { useMemo } from "react";
import type { FilterPillTheme } from "@/lib/filter-pill-styles";

type TownFilterSelectProps<T extends string> = {
  towns: readonly T[];
  selected: T | "All";
  onSelect: (town: T | "All") => void;
  counts?: Partial<Record<T | "All", number>>;
  allLabel?: string;
  theme?: FilterPillTheme;
  className?: string;
};

function formatOptionLabel(label: string, count?: number): string {
  if (count == null) return label;
  return `${label} (${count.toLocaleString()})`;
}

const THEME_STYLES: Record<
  FilterPillTheme,
  { select: string; option: string; chevron: string }
> = {
  dark: {
    select:
      "border-white/10 bg-white/5 text-white hover:border-white/20 focus:border-gold/50 focus:ring-1 focus:ring-gold/30",
    option: "bg-navy text-white",
    chevron: "text-white/50",
  },
  light: {
    select:
      "border-charcoal/[0.08] bg-white text-navy hover:border-charcoal/20 focus:border-gold/50 focus:ring-1 focus:ring-gold/30",
    option: "bg-white text-navy",
    chevron: "text-slate/50",
  },
};

export default function TownFilterSelect<T extends string>({
  towns,
  selected,
  onSelect,
  counts,
  allLabel = "All Towns",
  theme = "dark",
  className = "",
}: TownFilterSelectProps<T>) {
  const styles = THEME_STYLES[theme];
  const widestTownLabel = useMemo(() => {
    const labels = [allLabel, ...towns];
    return labels.reduce((widest, label) =>
      label.length > widest.length ? label : widest,
    );
  }, [allLabel, towns]);

  return (
    <div className={className}>
      <div className="relative inline-grid max-w-full [&>select]:col-start-1 [&>select]:row-start-1">
        <span
          className="invisible col-start-1 row-start-1 whitespace-nowrap px-3 py-1.5 pr-8 text-xs font-medium"
          aria-hidden
        >
          {widestTownLabel}
        </span>
        <select
          aria-label="Town"
          value={selected}
          onChange={(e) => onSelect(e.target.value as T | "All")}
          className={`w-full min-w-0 rounded-full border px-3 py-1.5 pr-8 text-xs font-medium appearance-none cursor-pointer transition-colors outline-none ${styles.select}`}
        >
          <option value="All" className={styles.option}>
            {formatOptionLabel(allLabel, counts?.All)}
          </option>
          {towns.map((town) => (
            <option key={town} value={town} className={styles.option}>
              {formatOptionLabel(town, counts?.[town])}
            </option>
          ))}
        </select>
        <span
          className={`pointer-events-none absolute inset-y-0 right-2.5 flex items-center ${styles.chevron}`}
          aria-hidden
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path
              d="M3 4.5L6 7.5L9 4.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </div>
    </div>
  );
}
