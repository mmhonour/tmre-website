"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import IntelSortDrawer from "@/components/intelligence/IntelSortDrawer";
import {
  DEAL_BOARD_SORT_COLUMNS,
  DEAL_BOARD_SORT_DIRS,
  dealBoardSortLabel,
  type DealBoardSortDir,
  type DealBoardSortKey,
} from "@/components/intelligence/deal-board/deal-board-sort";

/**
 * Field row + its own ↑ / ↓. Tapping an arrow picks the field *and* the
 * direction in one go, so ascending / descending is never a second trip out to
 * the toolbar chip.
 */
function SortDrawerOption({
  label,
  sortKey,
  activeKey,
  direction,
  onSelect,
  onSelectDir,
}: {
  label: string;
  sortKey: DealBoardSortKey;
  activeKey: DealBoardSortKey;
  direction: DealBoardSortDir;
  onSelect: (key: DealBoardSortKey) => void;
  onSelectDir: (key: DealBoardSortKey, dir: DealBoardSortDir) => void;
}) {
  const active = activeKey === sortKey;
  return (
    <div
      className={`flex w-full items-stretch gap-1 rounded-xl border transition-colors ${
        active
          ? "border-navy/30 bg-navy text-white shadow-sm"
          : "border-charcoal/[0.08] bg-white text-navy hover:border-navy/25"
      }`}
    >
      <button
        type="button"
        onClick={() => onSelect(sortKey)}
        aria-pressed={active}
        className="flex min-w-0 flex-1 items-center rounded-l-xl px-3.5 py-3 text-left"
      >
        <span className="font-mono text-[11px] tracking-[0.14em] uppercase">
          {label}
        </span>
      </button>
      <span className="flex shrink-0 items-center gap-0.5 pr-2">
        {DEAL_BOARD_SORT_DIRS.map((dir) => {
          const on = active && direction === dir;
          const dirWord = dir === "asc" ? "ascending" : "descending";
          return (
            <button
              key={dir}
              type="button"
              onClick={() => onSelectDir(sortKey, dir)}
              aria-pressed={on}
              aria-label={`Sort by ${label}, ${dirWord}`}
              title={`${label} — ${dirWord}`}
              className={`inline-flex h-7 w-7 items-center justify-center rounded-lg font-mono text-[13px] leading-none tabular-nums transition-colors ${
                on
                  ? "bg-gold text-navy"
                  : active
                    ? "text-white/55 hover:bg-white/15 hover:text-white"
                    : "text-slate/45 hover:bg-navy/[0.06] hover:text-navy"
              }`}
            >
              {dir === "asc" ? "↑" : "↓"}
            </button>
          );
        })}
      </span>
    </div>
  );
}

export default function DealBoardSortBar({
  sortKey,
  sortDir,
  onSort,
  onSortDir,
  showTown,
  showLookedSort = false,
  scoreInfoButton,
  /** Inline trigger for the status-pills toolbar row (no full-width bar). */
  embedded = false,
  /**
   * When false, toolbar is Sort + asc/desc only; field drawer is opened via
   * `fieldDrawerOpen` / `onFieldDrawerOpenChange` (mobile: under Hide graphs).
   */
  fieldPickerInToolbar = true,
  fieldDrawerOpen: fieldDrawerOpenProp,
  onFieldDrawerOpenChange,
}: {
  sortKey: DealBoardSortKey;
  sortDir: DealBoardSortDir;
  onSort: (key: DealBoardSortKey) => void;
  /** Sets field and direction together, for the drawer's per-field ↑ / ↓. */
  onSortDir?: (key: DealBoardSortKey, dir: DealBoardSortDir) => void;
  showTown: boolean;
  /** Lookey: include Last looked (cookie / localStorage viewedAt). */
  showLookedSort?: boolean;
  scoreInfoButton: ReactNode;
  embedded?: boolean;
  fieldPickerInToolbar?: boolean;
  fieldDrawerOpen?: boolean;
  onFieldDrawerOpenChange?: (open: boolean) => void;
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const controlled = onFieldDrawerOpenChange != null;
  const drawerOpen = controlled
    ? Boolean(fieldDrawerOpenProp)
    : uncontrolledOpen;
  const setDrawerOpen = (open: boolean) => {
    if (controlled) onFieldDrawerOpenChange?.(open);
    else setUncontrolledOpen(open);
  };

  const columns = DEAL_BOARD_SORT_COLUMNS.filter(
    (col) =>
      (!col.townOnly || showTown) && (!col.lookeyOnly || showLookedSort),
  );
  const activeLabel = dealBoardSortLabel(sortKey);
  const dirMark = sortDir === "asc" ? "↑" : "↓";

  const handleDrawerSort = (key: DealBoardSortKey) => {
    // Unlock body scroll before the board re-sorts. Closing after onSort left
    // overflow:hidden on during the heavy update — page couldn't scroll.
    setDrawerOpen(false);
    window.requestAnimationFrame(() => {
      onSort(key);
    });
  };

  const handleDrawerSortDir = (
    key: DealBoardSortKey,
    dir: DealBoardSortDir,
  ) => {
    setDrawerOpen(false);
    window.requestAnimationFrame(() => {
      // Without an explicit-direction handler, fall back to a plain field
      // select (which applies that field's default direction).
      if (onSortDir) onSortDir(key, dir);
      else onSort(key);
    });
  };

  const flipDir = () => {
    // Same-key select already toggles asc/desc in IntelligenceClient.handleSort.
    onSort(sortKey);
  };
  const nextDirLabel = sortDir === "asc" ? "descending" : "ascending";

  const chipShell = embedded
    ? "inline-flex max-w-[12.5rem] min-w-0 items-stretch rounded-full border border-navy/20 bg-white shadow-[0_1px_0_0_rgba(28,42,58,0.1)] hover:border-navy/35 transition-[box-shadow,border-color]"
    : "inline-flex min-w-0 flex-1 items-stretch rounded-full border border-navy/20 bg-white shadow-[0_2px_0_0_rgba(28,42,58,0.12)] hover:border-navy/35 transition-[box-shadow,border-color] lg:max-w-xs";

  const padL = embedded
    ? "inline-flex min-w-0 flex-1 items-center gap-1.5 rounded-l-full px-2.5 py-1"
    : "inline-flex min-w-0 flex-1 items-center gap-2 rounded-l-full px-3.5 py-2";
  const padDir = embedded
    ? "inline-flex shrink-0 items-center justify-center rounded-r-full border-l border-navy/15 px-2 py-1 font-mono text-[11px] tabular-nums text-navy hover:bg-navy/[0.04] active:translate-y-px transition-[transform,background-color]"
    : "inline-flex shrink-0 items-center justify-center rounded-r-full border-l border-navy/15 px-2.5 py-2 font-mono text-[12px] tabular-nums text-navy hover:bg-navy/[0.04] active:translate-y-px transition-[transform,background-color]";

  // When fieldPickerInToolbar is false, Sorted by + ↑/↓ live in the page header
  // (mobile) — hide this chip below `lg` so it does not duplicate beside More data.
  const trigger = (
    <div
      className={
        fieldPickerInToolbar
          ? chipShell
          : `${chipShell.replace(/^inline-flex/, "hidden lg:inline-flex")}`
      }
      role="group"
      aria-label={`Sort by ${activeLabel}`}
    >
      <button
        type="button"
        onClick={() => setDrawerOpen(true)}
        className={`${padL} active:translate-y-px transition-transform`}
        aria-expanded={drawerOpen}
        aria-controls="intel-sort-drawer"
        aria-label={`Choose sort field — currently ${activeLabel}`}
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
        <span className="font-mono text-[10px] tracking-[0.12em] uppercase text-navy truncate">
          {activeLabel}
        </span>
      </button>
      {fieldPickerInToolbar ? (
        <span className={`${padL} lg:hidden`}>
          <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-navy/55 shrink-0">
            Sort
          </span>
        </span>
      ) : null}
      <button
        type="button"
        onClick={flipDir}
        className={padDir}
        title={`Flip to ${nextDirLabel}`}
        aria-label={`Flip sort order to ${nextDirLabel}`}
      >
        {dirMark}
      </button>
    </div>
  );

  const drawer = (
    <IntelSortDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)}>
      <div id="intel-sort-drawer" className="space-y-2">
        <p className="px-1 pb-1 text-xs text-slate leading-relaxed">
          Tap a field to sort, or tap its ↑ / ↓ to set ascending / descending at
          the same time.
        </p>
        {columns.map((col) => (
          <SortDrawerOption
            key={col.key}
            label={col.label}
            sortKey={col.key}
            activeKey={sortKey}
            direction={sortDir}
            onSelect={handleDrawerSort}
            onSelectDir={handleDrawerSortDir}
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
  );

  if (embedded) {
    return (
      <>
        <div
          className={
            fieldPickerInToolbar
              ? "inline-flex items-center justify-start gap-1.5 shrink-0"
              : "hidden lg:inline-flex items-center justify-start gap-1.5 shrink-0"
          }
        >
          {trigger}
          {scoreInfoButton}
        </div>
        {drawer}
      </>
    );
  }

  return (
    <>
      <div className="border-b border-charcoal/[0.12] bg-cream">
        <div className="flex items-center gap-2 px-4 py-2.5 lg:py-3">
          {trigger}
          {scoreInfoButton}
        </div>
      </div>
      {drawer}
    </>
  );
}
