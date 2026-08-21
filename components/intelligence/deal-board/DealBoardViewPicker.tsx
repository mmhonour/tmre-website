"use client";

import {
  DEAL_BOARD_CARD_VIEW_VALUES,
  DEAL_BOARD_VIEW_LABELS,
  DEAL_BOARD_VIEW_VALUES,
  dealBoardCardView,
  type DealBoardCardView,
  type DealBoardView,
} from "@/lib/deal-board-view";

const iconClass = "h-3.5 w-3.5 shrink-0";

function DealBoardViewIcon({ mode }: { mode: DealBoardView }) {
  switch (mode) {
    case "large":
      return (
        <svg
          className={iconClass}
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden
        >
          <rect x="2.5" y="2.5" width="11" height="11" rx="1.5" />
        </svg>
      );
    case "grid":
      return (
        <svg
          className={iconClass}
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden
        >
          <rect x="2" y="2" width="5" height="5" rx="0.75" />
          <rect x="9" y="2" width="5" height="5" rx="0.75" />
          <rect x="2" y="9" width="5" height="5" rx="0.75" />
          <rect x="9" y="9" width="5" height="5" rx="0.75" />
        </svg>
      );
    case "line":
      return (
        <svg
          className={iconClass}
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden
        >
          <rect x="2" y="2.5" width="4" height="3" rx="0.5" />
          <line x1="7.5" y1="4" x2="14" y2="4" strokeLinecap="round" />
          <rect x="2" y="6.5" width="4" height="3" rx="0.5" />
          <line x1="7.5" y1="8" x2="14" y2="8" strokeLinecap="round" />
          <rect x="2" y="10.5" width="4" height="3" rx="0.5" />
          <line x1="7.5" y1="12" x2="14" y2="12" strokeLinecap="round" />
        </svg>
      );
    case "map":
      return (
        <svg
          className={iconClass}
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden
        >
          <path d="M8 14s4.2-4.1 4.2-7A4.2 4.2 0 0 0 3.8 7c0 2.9 4.2 7 4.2 7Z" />
          <circle cx="8" cy="6.8" r="1.4" />
        </svg>
      );
  }
}

/** Standalone map layer toggle — used on its own in the mobile Sorted-by row. */
export function DealBoardMapToggleButton({
  mapOn,
  onToggle,
  className = "",
}: {
  mapOn: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-charcoal/[0.08] transition-colors ${
        mapOn
          ? "bg-navy text-white ring-1 ring-gold/40"
          : "bg-white text-slate hover:bg-charcoal/[0.04] hover:text-navy"
      } ${className}`}
      aria-pressed={mapOn}
      aria-label={DEAL_BOARD_VIEW_LABELS.map}
      title={mapOn ? "Hide map" : "Show map"}
    >
      <DealBoardViewIcon mode="map" />
    </button>
  );
}

function viewButtonClass(active: boolean) {
  return `inline-flex h-6 w-6 items-center justify-center rounded transition-colors ${
    active
      ? "bg-navy text-white ring-1 ring-gold/40"
      : "text-slate hover:bg-charcoal/[0.04] hover:text-navy"
  }`;
}

export default function DealBoardViewPicker({
  view,
  onChange,
  mapOn = false,
  onMapToggle,
  options = DEAL_BOARD_VIEW_VALUES,
}: {
  view: DealBoardView;
  onChange: (view: DealBoardCardView) => void;
  /** Desktop: Map is a layer, not a replacement for Large / Grid / Line. */
  mapOn?: boolean;
  onMapToggle?: () => void;
  /** Boards without a map panel pass DEAL_BOARD_CARD_VIEW_VALUES. */
  options?: readonly DealBoardView[];
}) {
  const cardView = dealBoardCardView(view);
  const showMapToggle = options.includes("map") && onMapToggle != null;
  const cardOptions = options.filter((mode): mode is DealBoardCardView =>
    (DEAL_BOARD_CARD_VIEW_VALUES as readonly string[]).includes(mode),
  );

  return (
    <div className="inline-flex items-center gap-1">
      <div
        className="inline-flex rounded-md border border-charcoal/[0.08] bg-white p-0.5"
        role="group"
        aria-label="Board card view"
      >
        {cardOptions.map((mode) => {
          const active = cardView === mode;
          const label = DEAL_BOARD_VIEW_LABELS[mode];
          return (
            <button
              key={mode}
              type="button"
              onClick={() => onChange(mode)}
              className={viewButtonClass(active)}
              aria-pressed={active}
              aria-label={label}
              title={label}
            >
              <DealBoardViewIcon mode={mode} />
            </button>
          );
        })}
      </div>
      {showMapToggle && onMapToggle ? (
        <DealBoardMapToggleButton mapOn={mapOn} onToggle={onMapToggle} />
      ) : null}
    </div>
  );
}
