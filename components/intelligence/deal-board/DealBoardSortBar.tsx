"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import IntelSortDrawer from "@/components/intelligence/IntelSortDrawer";
import {
  DEAL_BOARD_SORT_COLUMNS,
  dealBoardSortLabel,
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
      className={`inline-flex cursor-pointer items-center gap-1 font-mono text-[9px] tracking-[0.16em] uppercase transition-colors whitespace-nowrap ${
        active ? "text-navy" : "text-slate hover:text-navy"
      } ${align === "right" ? "ml-auto" : ""}`}
    >
      {label}
      <span
        className={`text-[11px] leading-none tabular-nums ${
          active ? "font-bold text-black" : "text-slate/35"
        }`}
        aria-hidden
      >
        {active ? (direction === "asc" ? "↑" : "↓") : "↕"}
      </span>
    </button>
  );
}

function SortDrawerOption({
  label,
  sortKey,
  activeKey,
  direction,
  onSelect,
}: {
  label: string;
  sortKey: DealBoardSortKey;
  activeKey: DealBoardSortKey;
  direction: DealBoardSortDir;
  onSelect: (key: DealBoardSortKey) => void;
}) {
  const active = activeKey === sortKey;
  return (
    <button
      type="button"
      onClick={() => onSelect(sortKey)}
      aria-pressed={active}
      className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors ${
        active
          ? "border-navy/30 bg-navy text-white shadow-sm"
          : "border-charcoal/[0.08] bg-white text-navy hover:border-navy/25"
      }`}
    >
      <span className="font-mono text-[11px] tracking-[0.14em] uppercase">
        {label}
      </span>
      <span
        className={`font-mono text-[13px] tabular-nums shrink-0 ${
          active ? "text-gold" : "text-slate/40"
        }`}
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
  const [drawerOpen, setDrawerOpen] = useState(false);
  const columns = DEAL_BOARD_SORT_COLUMNS.filter(
    (col) => !col.townOnly || showTown,
  );
  const activeLabel = dealBoardSortLabel(sortKey);
  const dirMark = sortDir === "asc" ? "↑" : "↓";

  const handleDrawerSort = (key: DealBoardSortKey) => {
    onSort(key);
    // Second tap on the same field flips direction via parent; keep drawer open
    // so the arrow update is visible, then close shortly after a change settles.
    if (key === sortKey) {
      // direction toggled — leave open briefly for feedback
      window.setTimeout(() => setDrawerOpen(false), 280);
    } else {
      window.setTimeout(() => setDrawerOpen(false), 220);
    }
  };

  return (
    <>
      {/* Mobile: Sort control on its own row */}
      <div className="border-b border-charcoal/[0.12] bg-cream lg:hidden">
        <div className="flex items-center gap-2 px-4 py-2.5">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="inline-flex min-w-0 flex-1 items-center gap-2 rounded-full border border-navy/20 bg-white px-3.5 py-2 shadow-[0_2px_0_0_rgba(28,42,58,0.12)] active:translate-y-px active:shadow-none transition-[transform,box-shadow]"
            aria-expanded={drawerOpen}
            aria-controls="intel-sort-drawer"
          >
            <svg
              viewBox="0 0 12 12"
              className="h-2.5 w-2.5 shrink-0 text-navy/70"
              fill="currentColor"
              aria-hidden
            >
              <path d="M8.5 1.2 L2.8 6 L8.5 10.8 Z" />
            </svg>
            <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-navy/55 shrink-0">
              Sort
            </span>
            <span className="font-mono text-[11px] tracking-[0.12em] uppercase text-navy truncate">
              {activeLabel}
            </span>
            <span className="ml-auto font-mono text-[12px] text-navy tabular-nums shrink-0">
              {dirMark}
            </span>
          </button>
          {scoreInfoButton}
        </div>
      </div>

      {/* Desktop: full horizontal sort fields */}
      <div className="hidden lg:block border-b border-charcoal/[0.12] bg-cream">
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1 overflow-x-auto">
            <div
              className="flex min-w-max items-center gap-x-6"
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
        </div>
      </div>

      <IntelSortDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)}>
        <div id="intel-sort-drawer" className="space-y-2">
          <p className="px-1 pb-1 text-xs text-slate leading-relaxed">
            Tap a field to sort. Tap again to flip ascending / descending.
          </p>
          {columns.map((col) => (
            <SortDrawerOption
              key={col.key}
              label={col.label}
              sortKey={col.key}
              activeKey={sortKey}
              direction={sortDir}
              onSelect={handleDrawerSort}
            />
          ))}
          <Link
            href="/score"
            className="mt-2 block px-1 font-mono text-[10px] tracking-[0.08em] text-slate/55 hover:text-gold transition-colors"
          >
            How scoring works →
          </Link>
        </div>
      </IntelSortDrawer>
    </>
  );
}
