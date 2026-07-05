"use client";

import { useState } from "react";
import {
  filterPillButtonClass,
  filterPillContainerClass,
  filterPillSeparatorClass,
  type FilterPillSize,
  type FilterPillTheme,
} from "@/lib/filter-pill-styles";
import { isTmreTown, neighborTownsFor, type TmreTown } from "@/lib/tmre-towns";

type TownFilterPillsProps<T extends string> = {
  towns: readonly T[];
  selected: T | "All";
  onSelect: (town: T | "All") => void;
  counts?: Partial<Record<T | "All", number>>;
  allLabel?: string;
  /** Visual divider after the “All Towns” pill (Intelligence layout). */
  showSeparatorAfterAll?: boolean;
  /** Tighter pills for dense hero toolbars (Intelligence). */
  size?: "default" | "compact";
  /** Dark hero vs light content surfaces. */
  theme?: FilterPillTheme;
  /** Keep towns on one row with horizontal scroll instead of wrapping. */
  scrollable?: boolean;
  className?: string;
  onTownMouseEnter?: (town: T, el: HTMLElement) => void;
  onTownMouseLeave?: () => void;
};

function TownCountBadge({
  count,
  active,
  compact,
  theme = "dark",
}: {
  count: number;
  active: boolean;
  compact?: boolean;
  theme?: FilterPillTheme;
}) {
  const inactiveTone = theme === "light" ? "text-slate/45" : "text-white/40";
  return (
    <span
      className={`font-mono tabular-nums ${
        compact ? "ml-1 text-[9px]" : "ml-1.5 text-[11px]"
      } ${active ? "text-navy/55" : inactiveTone}`}
      aria-label={`${count.toLocaleString()} homes`}
    >
      {count.toLocaleString()}
    </span>
  );
}

export default function TownFilterPills<T extends string>({
  towns,
  selected,
  onSelect,
  counts,
  allLabel = "All Towns",
  showSeparatorAfterAll = false,
  size = "default",
  theme = "dark",
  scrollable = false,
  className = "",
  onTownMouseEnter,
  onTownMouseLeave,
}: TownFilterPillsProps<T>) {
  const pillSize: FilterPillSize = size;
  const compact = pillSize === "compact";
  const pillClass = (active: boolean) => filterPillButtonClass(active, pillSize, theme);
  const [hoveredTown, setHoveredTown] = useState<T | null>(null);
  const borderingHint =
    !onTownMouseEnter && hoveredTown && isTmreTown(hoveredTown)
      ? neighborTownsFor(hoveredTown as TmreTown)
      : [];

  const inner = (
    <>
      <button
        type="button"
        onClick={() => onSelect("All")}
        aria-pressed={selected === "All"}
        className={pillClass(selected === "All")}
      >
        {allLabel}
        {counts?.All != null ? (
          <TownCountBadge count={counts.All} active={selected === "All"} compact={compact} theme={theme} />
        ) : null}
      </button>

      {showSeparatorAfterAll ? (
        <span className={filterPillSeparatorClass(pillSize, theme)} aria-hidden />
      ) : null}

      <div
        className={`inline-flex items-center ${compact ? "gap-0.5" : "gap-1"}`}
        onMouseLeave={() => {
          setHoveredTown(null);
          onTownMouseLeave?.();
        }}
      >
      {towns.map((town) => {
        const active = selected === town;
        const count = counts?.[town];
        return (
          <button
            key={town}
            type="button"
            onClick={() => onSelect(town)}
            onMouseEnter={(e) => {
              setHoveredTown(town);
              onTownMouseEnter?.(town, e.currentTarget);
            }}
            aria-pressed={active}
            className={pillClass(active)}
          >
            {town}
            {count != null ? (
              <TownCountBadge count={count} active={active} compact={compact} theme={theme} />
            ) : null}
          </button>
        );
      })}
      </div>
    </>
  );

  const hint = borderingHint.length > 0 ? (
    <p className={`font-mono text-[8px] leading-snug tracking-[0.06em] mt-1.5 ${
      theme === "light" ? "text-slate/55" : "text-white/45"
    }`}>
      {borderingHint.join(" · ")}
    </p>
  ) : null;

  const containerClass = filterPillContainerClass(pillSize, { theme });

  if (scrollable) {
    return (
      <div className={className}>
        <div
          className="max-w-full min-w-0 overflow-x-auto scroll-pr-2"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          <div className={`${containerClass} w-max`}>
            {inner}
          </div>
        </div>
        {hint}
      </div>
    );
  }

  return (
    <div className={className}>
      <div className={containerClass}>
        {inner}
      </div>
      {hint}
    </div>
  );
}
