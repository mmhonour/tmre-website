"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import {
  DEAL_BOARD_SORT_COLUMNS,
  type DealBoardSortDir,
  type DealBoardSortKey,
} from "@/components/intelligence/deal-board/deal-board-sort";

function SortControl({
  label,
  sortKey,
  activeKey,
  direction,
  onSort,
  align = "left",
}: {
  label: string;
  sortKey: DealBoardSortKey;
  activeKey: DealBoardSortKey;
  direction: DealBoardSortDir;
  onSort: (key: DealBoardSortKey) => void;
  align?: "left" | "right";
}) {
  const active = activeKey === sortKey;
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : "none"}
      className={`inline-flex items-center gap-1 font-mono text-[9px] tracking-[0.16em] uppercase transition-colors whitespace-nowrap ${
        active ? "text-navy" : "text-slate hover:text-navy"
      } ${align === "right" ? "ml-auto" : ""}`}
    >
      {label}
      <span
        className={`text-[11px] leading-none tabular-nums ${active ? "text-gold" : "text-slate/35"}`}
        aria-hidden
      >
        {active ? (direction === "asc" ? "↑" : "↓") : "↕"}
      </span>
    </button>
  );
}

export default function DealBoardSortBar({
  sortKey,
  sortDir,
  onSort,
  showTown,
  scoreInfoButton,
}: {
  sortKey: DealBoardSortKey;
  sortDir: DealBoardSortDir;
  onSort: (key: DealBoardSortKey) => void;
  showTown: boolean;
  scoreInfoButton: ReactNode;
}) {
  const columns = DEAL_BOARD_SORT_COLUMNS.filter(
    (col) => !col.townOnly || showTown,
  );

  return (
    <div className="border-b border-charcoal/[0.12] bg-cream overflow-x-auto">
      <div
        className="flex min-w-max items-center gap-x-6 px-4 py-3"
        role="row"
        aria-label="Sort listings"
      >
        {columns.map((col) => (
          <div
            key={col.key}
            className={`shrink-0 ${col.align === "right" ? "text-right" : "text-left"}`}
            role="columnheader"
          >
            {col.key === "score" ? (
              <span className="inline-flex items-center gap-1">
                <SortControl
                  label={col.label}
                  sortKey={col.key}
                  activeKey={sortKey}
                  direction={sortDir}
                  onSort={onSort}
                  align={col.align}
                />
                {scoreInfoButton}
                <Link
                  href="/score"
                  className="font-mono text-[8px] text-slate/45 hover:text-gold normal-case tracking-normal"
                >
                  →
                </Link>
              </span>
            ) : (
              <SortControl
                label={col.label}
                sortKey={col.key}
                activeKey={sortKey}
                direction={sortDir}
                onSort={onSort}
                align={col.align}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
