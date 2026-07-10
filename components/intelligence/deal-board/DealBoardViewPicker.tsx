"use client";

import {
  DEAL_BOARD_VIEW_LABELS,
  DEAL_BOARD_VIEW_VALUES,
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
  }
}

export default function DealBoardViewPicker({
  view,
  onChange,
}: {
  view: DealBoardView;
  onChange: (view: DealBoardView) => void;
}) {
  return (
    <div className="inline-flex items-center gap-1.5">
      <span className="font-mono text-[9px] tracking-[0.12em] uppercase text-slate">
        View
      </span>
      <div
        className="inline-flex rounded-md border border-charcoal/[0.08] bg-white p-0.5"
        role="group"
        aria-label="Board view"
      >
        {DEAL_BOARD_VIEW_VALUES.map((mode) => {
          const active = view === mode;
          const label = DEAL_BOARD_VIEW_LABELS[mode];
          return (
            <button
              key={mode}
              type="button"
              onClick={() => onChange(mode)}
              className={`inline-flex h-6 w-6 items-center justify-center rounded transition-colors ${
                active
                  ? "bg-navy text-white ring-1 ring-gold/40"
                  : "text-slate hover:bg-charcoal/[0.04] hover:text-navy"
              }`}
              aria-pressed={active}
              aria-label={label}
              title={label}
            >
              <DealBoardViewIcon mode={mode} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
