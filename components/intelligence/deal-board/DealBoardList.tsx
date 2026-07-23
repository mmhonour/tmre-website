"use client";

import DealBoardMiddleTierToggle from "@/components/intelligence/deal-board/DealBoardMiddleTierToggle";
import DealBoardSortBar from "@/components/intelligence/deal-board/DealBoardSortBar";
import {
  DealBoardPhotoLedGridCard,
  DealBoardPhotoLedLargeCard,
  DealBoardPhotoLedLineRow,
} from "@/components/intelligence/deal-board/DealBoardRows";
import DealBoardViewPicker from "@/components/intelligence/deal-board/DealBoardViewPicker";
import type {
  DealBoardListing,
  DealBoardStatusFilter,
} from "@/components/intelligence/deal-board/deal-board-types";
import type {
  DealBoardSortDir,
  DealBoardSortKey,
} from "@/components/intelligence/deal-board/deal-board-sort";
import type { DealBoardView } from "@/lib/deal-board-view";
import type { ReactNode } from "react";

export type DealBoardListProps = {
  topRows: DealBoardListing[];
  /** Middle rows always shown (kept visible to honor the min-visible floor). */
  middlePinnedRows?: DealBoardListing[];
  /** Middle rows the collapse toggle may hide. */
  middleRows: DealBoardListing[];
  bottomRows: DealBoardListing[];
  canTier: boolean;
  middleTierExpanded: boolean;
  hideMiddleTierToggle?: boolean;
  onMiddleTierToggle: () => void;
  resultCount: number;
  scoreRankByKey: Map<string, number>;
  rankTotal: number;
  isLive: boolean;
  showTown: boolean;
  /** Hide SFR/Rental/etc. in meta when Sale or Rental filter pill is active. */
  hideOwnershipType?: boolean;
  loading: boolean;
  loadingLabel: string;
  emptyLabel: string;
  onResetFilters: () => void;
  onScoreClick: (listing: DealBoardListing) => void;
  onStatusClick: (listing: DealBoardListing) => void;
  sortKey: DealBoardSortKey;
  sortDir: DealBoardSortDir;
  onSort: (key: DealBoardSortKey) => void;
  boardView: DealBoardView;
  onBoardViewChange: (view: DealBoardView) => void;
  boardStatusFilter?: DealBoardStatusFilter;
  onBoardStatusFilterChange?: (value: DealBoardStatusFilter) => void;
  scoreInfoButton: ReactNode;
  footer: ReactNode;
  resultsSummary: ReactNode;
};

export default function DealBoardList({
  topRows,
  middlePinnedRows = [],
  middleRows,
  bottomRows,
  canTier,
  middleTierExpanded,
  hideMiddleTierToggle = false,
  onMiddleTierToggle,
  resultCount,
  scoreRankByKey,
  rankTotal,
  isLive,
  showTown,
  hideOwnershipType = false,
  loading,
  loadingLabel,
  emptyLabel,
  onResetFilters,
  onScoreClick,
  onStatusClick,
  sortKey,
  sortDir,
  onSort,
  boardView,
  onBoardViewChange,
  boardStatusFilter = "all",
  onBoardStatusFilterChange,
  scoreInfoButton,
  footer,
  resultsSummary,
}: DealBoardListProps) {
  const rowProps = (l: DealBoardListing) => ({
    listing: l,
    scoreRank: scoreRankByKey.get(l.key) ?? 0,
    rankTotal,
    isLive,
    showTown,
    hideOwnershipType,
    onScoreClick,
    onStatusClick,
  });

  const renderLine = (rows: DealBoardListing[]) =>
    rows.map((l) => <DealBoardPhotoLedLineRow key={l.key} {...rowProps(l)} />);

  const renderGrid = (rows: DealBoardListing[]) => (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,11.5rem),1fr))] gap-3 p-3 sm:gap-3.5 sm:p-4">
      {rows.map((l) => (
        <DealBoardPhotoLedGridCard key={l.key} {...rowProps(l)} />
      ))}
    </div>
  );

  const renderLarge = (rows: DealBoardListing[]) => (
    <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-2">
      {rows.map((l) => (
        <DealBoardPhotoLedLargeCard key={l.key} {...rowProps(l)} />
      ))}
    </div>
  );

  const renderRows = (rows: DealBoardListing[]) => {
    switch (boardView) {
      case "line":
        return renderLine(rows);
      case "grid":
        return renderGrid(rows);
      case "large":
        return renderLarge(rows);
    }
  };

  const loadingBlock = (
    <div className="px-5 py-16 text-center text-slate">
      <span className="inline-flex items-center gap-2 font-mono text-xs">
        <span className="w-1.5 h-1.5 rounded-full bg-gold animate-pulse-dot" />
        {loadingLabel}
      </span>
    </div>
  );

  const emptyBlock = (
    <div className="px-5 py-16 text-center">
      <p className="text-slate text-sm">{emptyLabel}</p>
      <button
        type="button"
        onClick={onResetFilters}
        className="mt-3 font-mono text-[11px] tracking-[0.15em] uppercase text-gold hover:text-navy transition-colors"
      >
        Reset filters →
      </button>
    </div>
  );

  const showMiddleTierControl =
    canTier && middleRows.length > 0 && !hideMiddleTierToggle;
  // Collapsed: big Middle tier panel. Expanded: panel disappears; listings show
  // with a compact control to collapse again.
  const tierBlock =
    showMiddleTierControl && !middleTierExpanded ? (
      <DealBoardMiddleTierToggle
        expanded={false}
        middleCount={middleRows.length}
        resultCount={resultCount}
        onToggle={onMiddleTierToggle}
      />
    ) : null;
  const hideMiddleControl =
    showMiddleTierControl && middleTierExpanded ? (
      <div className="flex justify-center border-y border-charcoal/[0.08] bg-cream/40 px-3 py-1.5">
        <button
          type="button"
          onClick={onMiddleTierToggle}
          aria-expanded
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-mono text-[9px] tracking-[0.14em] uppercase text-navy/55 hover:bg-navy/5 hover:text-navy transition-colors"
        >
          <span aria-hidden>↑</span>
          Hide middle tier
          <span className="tabular-nums text-navy/40">
            ({middleRows.length.toLocaleString()})
          </span>
        </button>
      </div>
    ) : null;

  const hasResults = resultCount > 0;

  const resultsToolbar = (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-charcoal/[0.08] bg-cream/95 px-4 py-2.5 backdrop-blur-sm">
      {resultsSummary}
      <DealBoardViewPicker view={boardView} onChange={onBoardViewChange} />
    </div>
  );

  return (
    <>
      <div className="rounded-2xl border border-charcoal/[0.08] bg-white">
        {loading ? (
          <>
            {resultsToolbar}
            {loadingBlock}
          </>
        ) : !hasResults ? (
          <>
            {resultsToolbar}
            {emptyBlock}
          </>
        ) : (
          <>
            <div className="sticky top-20 z-30 rounded-t-2xl bg-white shadow-[0_4px_16px_-8px_rgba(26,35,50,0.18)]">
              {resultsToolbar}
              <DealBoardSortBar
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={onSort}
                showTown={showTown}
                scoreInfoButton={scoreInfoButton}
                showStatusFilters={Boolean(onBoardStatusFilterChange)}
                statusFilter={boardStatusFilter}
                onStatusFilterChange={onBoardStatusFilterChange}
              />
            </div>
            <div>
              {renderRows(topRows)}
              {renderRows(middlePinnedRows)}
              {tierBlock}
              {middleTierExpanded ? renderRows(middleRows) : null}
              {hideMiddleControl}
              {renderRows(bottomRows)}
            </div>
          </>
        )}
        {hasResults ? footer : null}
      </div>
    </>
  );
}
