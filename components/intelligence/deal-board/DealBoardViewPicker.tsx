"use client";

import {
  DEAL_BOARD_VIEW_LABELS,
  DEAL_BOARD_VIEW_VALUES,
  type DealBoardView,
} from "@/lib/deal-board-view";

export default function DealBoardViewPicker({
  view,
  onChange,
}: {
  view: DealBoardView;
  onChange: (view: DealBoardView) => void;
}) {
  return (
    <div className="inline-flex items-center gap-2">
      <span className="font-mono text-[10px] tracking-[0.12em] uppercase text-slate">
        View
      </span>
      <div
        className="inline-flex rounded-full border border-charcoal/[0.08] bg-white p-0.5"
        role="group"
        aria-label="Board view"
      >
        {DEAL_BOARD_VIEW_VALUES.map((mode) => {
          const active = view === mode;
          return (
            <button
              key={mode}
              type="button"
              onClick={() => onChange(mode)}
              className={`inline-flex items-center rounded-full px-3 py-1.5 font-mono text-[10px] tracking-[0.12em] uppercase transition-colors ${
                active
                  ? "bg-navy text-white"
                  : "text-slate hover:text-navy hover:bg-charcoal/[0.04]"
              }`}
              aria-pressed={active}
            >
              {DEAL_BOARD_VIEW_LABELS[mode]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
