"use client";

import DealBoardMiddleTierToggle from "@/components/intelligence/deal-board/DealBoardMiddleTierToggle";
import DealBoardSortBar from "@/components/intelligence/deal-board/DealBoardSortBar";
import {
  DealBoardPhotoLedGridCard,
  DealBoardPhotoLedLargeCard,
  DealBoardPhotoLedLineRow,
} from "@/components/intelligence/deal-board/DealBoardRows";
import DealBoardViewPicker from "@/components/intelligence/deal-board/DealBoardViewPicker";
import type { DealBoardListing } from "@/components/intelligence/deal-board/deal-board-types";
import type {
  DealBoardSortDir,
  DealBoardSortKey,
} from "@/components/intelligence/deal-board/deal-board-sort";
import type { DealBoardView } from "@/lib/deal-board-view";
import type { ReactNode } from "react";

export type DealBoardListProps = {
  topRows: DealBoardListing[];
  middleRows: DealBoardListing[];
  bottomRows: DealBoardListing[];
  canTier: boolean;
  middleTierExpanded: boolean;
  onMiddleTierToggle: () => void;
  resultCount: number;
  scoreRankByKey: Map<string, number>;
  rankTotal: number;
  isLive: boolean;
  showTown: boolean;
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
  scoreInfoButton: ReactNode;
  footer: ReactNode;
  resultsSummary: ReactNode;
};

export default function DealBoardList({
  topRows,
  middleRows,
  bottomRows,
  canTier,
  middleTierExpanded,
  onMiddleTierToggle,
  resultCount,
  scoreRankByKey,
  rankTotal,
  isLive,
  showTown,
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

  const tierBlock =
    canTier && middleRows.length > 0 ? (
      <DealBoardMiddleTierToggle
        expanded={middleTierExpanded}
        middleCount={middleRows.length}
        resultCount={resultCount}
        onToggle={onMiddleTierToggle}
      />
    ) : null;

  const hasResults = resultCount > 0;

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-charcoal/[0.08] bg-white px-4 py-2.5">
        {resultsSummary}
        <DealBoardViewPicker view={boardView} onChange={onBoardViewChange} />
      </div>

      <div className="overflow-hidden rounded-2xl border border-charcoal/[0.08] bg-white">
        {loading ? (
          loadingBlock
        ) : !hasResults ? (
          emptyBlock
        ) : (
          <>
            <DealBoardSortBar
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={onSort}
              showTown={showTown}
              scoreInfoButton={scoreInfoButton}
            />
            <div>
              {renderRows(topRows)}
              {tierBlock}
              {middleTierExpanded ? renderRows(middleRows) : null}
              {renderRows(bottomRows)}
            </div>
          </>
        )}
        {hasResults ? footer : null}
      </div>
    </>
  );
}
