"use client";

import { useState } from "react";
import {
  filterPillButtonClass,
  filterPillContainerClass,
  filterPillIndependentButtonClass,
  filterPillIndependentContainerClass,
  filterPillSeparatorClass,
  filterPillPromotedContainerClass,
  filterPillPromotedLinksClass,
  filterPillZipButtonClass,
  filterPillZipContainerClass,
  filterPillZipLinkClass,
  filterPillZipLinkUnderlineClass,
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
  /** Grouped segmented bar vs separate bordered pills (Intelligence hero). */
  variant?: "grouped" | "independent";
  /** Match Intelligence zip filter row (mono, bordered, white All / gold selection). */
  appearance?: "default" | "zip";
  /**
   * Intelligence hero: selection as left pill; remaining options behind "... more towns".
   * All or a single town selected → active pill + "... more towns"; expanded → town links.
   */
  layout?: "default" | "promoted";
  /** Promoted layout: town links hidden until "... more towns" is clicked. */
  townLinksExpanded?: boolean;
  onTownLinksExpandedChange?: (expanded: boolean) => void;
  className?: string;
  onTownMouseEnter?: (town: T, el: HTMLElement) => void;
  onAllMouseEnter?: (el: HTMLElement) => void;
  onTownMouseLeave?: () => void;
  /** Promoted row beside zip pills — drop full-width stretch. */
  promotedInline?: boolean;
};

function TownCountBadge({
  count,
  active,
  compact,
  theme = "dark",
  variant = "pill",
}: {
  count: number;
  active: boolean;
  compact?: boolean;
  theme?: FilterPillTheme;
  variant?: "pill" | "link";
}) {
  const inactiveTone =
    variant === "link"
      ? "text-white/35"
      : theme === "light"
        ? "text-slate/45"
        : "text-white/40";
  const activeTone =
    variant === "link" ? "text-gold/65" : "text-navy/55";
  return (
    <span
      className={`font-mono tabular-nums ${
        compact ? "ml-1 text-[9px]" : "ml-1.5 text-[11px]"
      } ${active ? activeTone : inactiveTone} ${
        variant === "link" ? "no-underline" : ""
      }`}
      aria-label={`${count.toLocaleString()} homes`}
    >
      {variant === "link" ? `(${count.toLocaleString()})` : count.toLocaleString()}
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
  variant = "grouped",
  appearance = "default",
  layout = "default",
  townLinksExpanded = false,
  onTownLinksExpandedChange,
  className = "",
  onTownMouseEnter,
  onAllMouseEnter,
  onTownMouseLeave,
  promotedInline = false,
}: TownFilterPillsProps<T>) {
  const pillSize: FilterPillSize = size;
  const compact = pillSize === "compact";
  const zipAppearance = appearance === "zip";
  const promotedLayout = layout === "promoted";
  const independent = variant === "independent" || zipAppearance;
  const pillClass = (active: boolean, isAllPill = false) => {
    if (zipAppearance) {
      return filterPillZipButtonClass(active, isAllPill);
    }
    return independent
      ? filterPillIndependentButtonClass(active, pillSize, theme)
      : filterPillButtonClass(active, pillSize, theme);
  };
  const [hoveredTown, setHoveredTown] = useState<T | null>(null);
  const borderingHint =
    !onTownMouseEnter && hoveredTown && isTmreTown(hoveredTown)
      ? neighborTownsFor(hoveredTown as TmreTown)
      : [];

  const clearTownHover = () => {
    setHoveredTown(null);
    onTownMouseLeave?.();
  };

  const handleAllMouseEnter = (el: HTMLElement) => {
    setHoveredTown(null);
    onAllMouseEnter?.(el);
  };

  const renderTownLink = (town: T, active: boolean) => {
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
        className={filterPillZipLinkClass(active)}
      >
        <span className={filterPillZipLinkUnderlineClass(active)}>{town}</span>
        {count != null ? (
          <TownCountBadge
            count={count}
            active={active}
            compact={compact || zipAppearance}
            theme={theme}
            variant="link"
          />
        ) : null}
      </button>
    );
  };

  if (promotedLayout) {
    const allActive = selected === "All";
    const selectedTown = allActive ? null : selected;
    const showPromotedLinks = townLinksExpanded;

    const moreTownsButton = !townLinksExpanded ? (
      <button
        type="button"
        aria-label="Show more towns"
        aria-expanded={false}
        onClick={() => onTownLinksExpandedChange?.(true)}
        className="font-mono text-xs leading-none text-white/55 hover:text-gold px-1 py-1.5 transition-colors whitespace-nowrap cursor-pointer"
      >
        ... more towns
      </button>
    ) : null;

    const promotedInner = (
      <>
        {allActive ? (
          <>
            <button
              type="button"
              onClick={() => onSelect("All")}
              onMouseEnter={(e) => handleAllMouseEnter(e.currentTarget)}
              aria-pressed
              className={filterPillZipButtonClass(true, true)}
            >
              {allLabel}
              {counts?.All != null ? (
                <TownCountBadge
                  count={counts.All}
                  active
                  compact={compact || zipAppearance}
                  theme={theme}
                />
              ) : null}
            </button>
            {moreTownsButton}
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => onSelect(selectedTown!)}
              onMouseEnter={(e) => {
                setHoveredTown(selectedTown!);
                onTownMouseEnter?.(selectedTown!, e.currentTarget);
              }}
              aria-pressed
              className={filterPillZipButtonClass(true, false)}
            >
              {selectedTown}
              {counts?.[selectedTown!] != null ? (
                <TownCountBadge
                  count={counts[selectedTown!]!}
                  active
                  compact={compact || zipAppearance}
                  theme={theme}
                />
              ) : null}
            </button>
            {moreTownsButton}
          </>
        )}
        {showPromotedLinks ? (
          <div className={filterPillPromotedLinksClass()} onMouseLeave={clearTownHover}>
            {!allActive ? (
              <button
                type="button"
                onClick={() => onSelect("All")}
                onMouseEnter={(e) => handleAllMouseEnter(e.currentTarget)}
                aria-pressed={false}
                className={filterPillZipLinkClass(false)}
              >
                <span className={filterPillZipLinkUnderlineClass(false)}>
                  {allLabel}
                </span>
                {counts?.All != null ? (
                  <TownCountBadge
                    count={counts.All}
                    active={false}
                    compact={compact || zipAppearance}
                    theme={theme}
                    variant="link"
                  />
                ) : null}
              </button>
            ) : null}
            {towns
              .filter((town) => allActive || town !== selectedTown)
              .map((town) => renderTownLink(town, false))}
          </div>
        ) : null}
      </>
    );

    const hint = borderingHint.length > 0 ? (
      <p className={`font-mono text-[8px] leading-snug tracking-[0.06em] mt-1.5 ${
        theme === "light" ? "text-slate/55" : "text-white/45"
      }`}>
        {borderingHint.join(" · ")}
      </p>
    ) : null;

    return (
      <div className={className}>
        <div
          className={filterPillPromotedContainerClass(promotedInline)}
          onMouseLeave={clearTownHover}
        >
          {promotedInner}
        </div>
        {hint}
      </div>
    );
  }

  const townButtons = towns.map((town) => {
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
        className={pillClass(active, false)}
      >
        {town}
        {count != null ? (
          <TownCountBadge count={count} active={active} compact={compact || zipAppearance} theme={theme} />
        ) : null}
      </button>
    );
  });

  const inner = (
    <>
      <button
        type="button"
        onClick={() => onSelect("All")}
        onMouseEnter={(e) => handleAllMouseEnter(e.currentTarget)}
        aria-pressed={selected === "All"}
        className={pillClass(selected === "All", true)}
      >
        {allLabel}
        {counts?.All != null ? (
          <TownCountBadge count={counts.All} active={selected === "All"} compact={compact || zipAppearance} theme={theme} />
        ) : null}
      </button>

      {showSeparatorAfterAll && !independent ? (
        <span className={filterPillSeparatorClass(pillSize, theme)} aria-hidden />
      ) : null}

      {scrollable ? (
        <div
          className={`inline-flex items-center ${compact ? "gap-0.5" : "gap-1"}`}
          onMouseLeave={clearTownHover}
        >
          {townButtons}
        </div>
      ) : (
        townButtons
      )}
    </>
  );

  const hint = borderingHint.length > 0 ? (
    <p className={`font-mono text-[8px] leading-snug tracking-[0.06em] mt-1.5 ${
      theme === "light" ? "text-slate/55" : "text-white/45"
    }`}>
      {borderingHint.join(" · ")}
    </p>
  ) : null;

  const containerClass = zipAppearance
    ? filterPillZipContainerClass()
    : independent
      ? filterPillIndependentContainerClass(pillSize)
      : filterPillContainerClass(pillSize, { theme });

  if (scrollable) {
    return (
      <div className={className}>
        <div
          className="max-w-full min-w-0 overflow-x-auto scroll-pr-2"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          <div
            className={`${containerClass} ${independent ? "" : "w-max"}`}
            onMouseLeave={independent ? clearTownHover : undefined}
          >
            {inner}
          </div>
        </div>
        {hint}
      </div>
    );
  }

  return (
    <div className={className}>
      <div
        className={containerClass}
        onMouseLeave={clearTownHover}
      >
        {inner}
      </div>
      {hint}
    </div>
  );
}
