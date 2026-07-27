"use client";

import DealBoardMiddleTierToggle from "@/components/intelligence/deal-board/DealBoardMiddleTierToggle";
import DealBoardSortBar from "@/components/intelligence/deal-board/DealBoardSortBar";
import DealBoardStatusFilterPills from "@/components/intelligence/deal-board/DealBoardStatusFilterPills";
import {
  DealBoardPhotoLedGridCard,
  DealBoardPhotoLedLargeCard,
  DealBoardPhotoLedLineRow,
} from "@/components/intelligence/deal-board/DealBoardRows";
import DealBoardViewPicker from "@/components/intelligence/deal-board/DealBoardViewPicker";
import FilterResetButton from "@/components/FilterResetButton";
import type {
  DealBoardListing,
  DealBoardStatusFilter,
} from "@/components/intelligence/deal-board/deal-board-types";
import type {
  DealBoardSortDir,
  DealBoardSortKey,
} from "@/components/intelligence/deal-board/deal-board-sort";
import type { DealBoardView } from "@/lib/deal-board-view";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

/** When 100+ filtered results, mount/eager-load photos in batches of this size. */
export const DEAL_BOARD_PHOTO_BATCH = 20;

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
  /** Same handler as the Reset sliders control beside the filter sliders. */
  onResetSliders?: () => void;
  slidersCustomized?: boolean;
  scoreInfoButton: ReactNode;
  footer: ReactNode;
  resultsSummary: ReactNode;
  /**
   * When true (filtered result set > 100), mount rows in batches of 20 and
   * only eager-load photos for the first batch so images don't storm the network.
   */
  progressivePhotoBatches?: boolean;
  /**
   * Mobile: field picker + bold ↑/↓ live under Hide graphs — toolbar hides the
   * Sort chip. Desktop keeps the full field+dir chip.
   */
  sortFieldPickerInToolbar?: boolean;
  sortFieldDrawerOpen?: boolean;
  onSortFieldDrawerOpenChange?: (open: boolean) => void;
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
  onResetSliders,
  slidersCustomized = false,
  scoreInfoButton,
  footer,
  resultsSummary,
  progressivePhotoBatches = false,
  sortFieldPickerInToolbar = true,
  sortFieldDrawerOpen,
  onSortFieldDrawerOpenChange,
}: DealBoardListProps) {
  const [showGridMeta, setShowGridMeta] = useState(false);
  const [showGridInsights, setShowGridInsights] = useState(false);
  const [mountedLimit, setMountedLimit] = useState(DEAL_BOARD_PHOTO_BATCH);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const orderedVisible = useMemo(
    () => [
      ...topRows,
      ...middlePinnedRows,
      ...(middleTierExpanded ? middleRows : []),
      ...bottomRows,
    ],
    [topRows, middlePinnedRows, middleRows, bottomRows, middleTierExpanded],
  );

  const orderedKey = orderedVisible.map((l) => l.key).join("|");
  const batching =
    progressivePhotoBatches && orderedVisible.length > DEAL_BOARD_PHOTO_BATCH;

  useEffect(() => {
    setMountedLimit(DEAL_BOARD_PHOTO_BATCH);
  }, [orderedKey, progressivePhotoBatches]);

  useEffect(() => {
    if (!batching || mountedLimit >= orderedVisible.length) return;
    const el = loadMoreRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        setMountedLimit((n) =>
          Math.min(n + DEAL_BOARD_PHOTO_BATCH, orderedVisible.length),
        );
      },
      { rootMargin: "280px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [batching, mountedLimit, orderedVisible.length]);

  const mountedKeys = useMemo(() => {
    if (!batching) return null;
    return new Set(
      orderedVisible.slice(0, mountedLimit).map((l) => l.key),
    );
  }, [batching, orderedVisible, mountedLimit]);

  /** Eager-load only the first batch's photos (not the whole page of 100). */
  const eagerPhotoKeys = useMemo(() => {
    if (!progressivePhotoBatches) return null;
    return new Set(
      orderedVisible.slice(0, DEAL_BOARD_PHOTO_BATCH).map((l) => l.key),
    );
  }, [progressivePhotoBatches, orderedVisible]);

  const takeRows = (rows: DealBoardListing[]) =>
    mountedKeys ? rows.filter((l) => mountedKeys.has(l.key)) : rows;

  const rowProps = (l: DealBoardListing) => ({
    listing: l,
    scoreRank: scoreRankByKey.get(l.key) ?? 0,
    rankTotal,
    isLive,
    showTown,
    hideOwnershipType,
    showGridMeta,
    showGridInsights,
    photoPriority: eagerPhotoKeys ? eagerPhotoKeys.has(l.key) : undefined,
    onScoreClick,
    onStatusClick,
  });

  const renderLine = (rows: DealBoardListing[]) =>
    takeRows(rows).map((l) => (
      <DealBoardPhotoLedLineRow key={l.key} {...rowProps(l)} />
    ));

  const renderGrid = (rows: DealBoardListing[]) => {
    const visible = takeRows(rows);
    if (visible.length === 0) return null;
    return (
      <div className="grid grid-cols-2 gap-0 sm:grid-cols-[repeat(auto-fill,minmax(11.5rem,1fr))]">
        {visible.map((l) => (
          <DealBoardPhotoLedGridCard key={l.key} {...rowProps(l)} />
        ))}
      </div>
    );
  };

  const renderLarge = (rows: DealBoardListing[]) => {
    const visible = takeRows(rows);
    if (visible.length === 0) return null;
    return (
      <div className="grid grid-cols-1 gap-0 md:grid-cols-2">
        {visible.map((l) => (
          <DealBoardPhotoLedLargeCard key={l.key} {...rowProps(l)} />
        ))}
      </div>
    );
  };

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
  const remaining = batching
    ? Math.max(0, orderedVisible.length - mountedLimit)
    : 0;

  const sortControl = (
    <DealBoardSortBar
      sortKey={sortKey}
      sortDir={sortDir}
      onSort={onSort}
      showTown={showTown}
      scoreInfoButton={scoreInfoButton}
      embedded
      fieldPickerInToolbar={sortFieldPickerInToolbar}
      fieldDrawerOpen={sortFieldDrawerOpen}
      onFieldDrawerOpenChange={onSortFieldDrawerOpenChange}
    />
  );

  const statusPills = onBoardStatusFilterChange ? (
    <DealBoardStatusFilterPills
      value={boardStatusFilter}
      onChange={onBoardStatusFilterChange}
    />
  ) : null;

  const moreDataInsights = (
    <div className="flex shrink-0 flex-nowrap items-center gap-x-2.5">
      <button
        type="button"
        onClick={() => setShowGridMeta((v) => !v)}
        aria-pressed={showGridMeta}
        className="whitespace-nowrap font-mono text-[10px] tracking-[0.12em] uppercase text-navy underline underline-offset-2 decoration-navy/70 hover:text-navy/80 hover:decoration-navy transition-colors"
      >
        {showGridMeta ? "less data" : "more data"}
      </button>
      <button
        type="button"
        onClick={() => setShowGridInsights((v) => !v)}
        aria-pressed={showGridInsights}
        className="whitespace-nowrap font-mono text-[10px] tracking-[0.12em] uppercase text-navy underline underline-offset-2 decoration-navy/70 hover:text-navy/80 hover:decoration-navy transition-colors"
      >
        insights
      </button>
    </div>
  );

  const viewAndReset = (
    <div className="flex shrink-0 items-center gap-x-2.5">
      <DealBoardViewPicker view={boardView} onChange={onBoardViewChange} />
      {onResetSliders ? (
        <FilterResetButton
          onClick={onResetSliders}
          disabled={!slidersCustomized}
          label="Reset sliders"
          tone="onLight"
        />
      ) : null}
    </div>
  );

  const resultsToolbar = (
    <div className="border-b border-charcoal/[0.08] bg-cream/95 px-4 py-2.5 backdrop-blur-sm">
      {/* Mobile: Sort | More data/Insights; status pills below Sort; views+Reset bottom-right. */}
      <div className="flex flex-col gap-y-1.5 lg:hidden">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 shrink">{sortControl}</div>
          {moreDataInsights}
        </div>
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 overflow-x-auto">{statusPills}</div>
          {viewAndReset}
        </div>
        {resultsSummary ? (
          <div className="min-w-0">{resultsSummary}</div>
        ) : null}
      </div>

      {/* Desktop: sort+summary | status pills | data/insights + views + reset */}
      <div className="hidden lg:grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-2 gap-y-1.5">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 justify-self-start">
          {sortControl}
          <div className="min-w-0">{resultsSummary}</div>
        </div>
        <div className="justify-self-center">{statusPills}</div>
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-x-2.5 gap-y-1 justify-self-end">
          {moreDataInsights}
          {viewAndReset}
        </div>
      </div>
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
            </div>
            <div>
              {renderRows(topRows)}
              {renderRows(middlePinnedRows)}
              {tierBlock}
              {middleTierExpanded ? renderRows(middleRows) : null}
              {hideMiddleControl}
              {renderRows(bottomRows)}
              {batching && remaining > 0 ? (
                <div
                  ref={loadMoreRef}
                  className="flex items-center justify-center gap-2 border-t border-charcoal/[0.06] px-4 py-3"
                  aria-hidden
                >
                  <span className="inline-flex items-center gap-2 font-mono text-[10px] tracking-[0.12em] uppercase text-slate/55">
                    <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-gold/80" />
                    Loading next {Math.min(DEAL_BOARD_PHOTO_BATCH, remaining)}…
                  </span>
                </div>
              ) : null}
            </div>
          </>
        )}
        {hasResults ? footer : null}
      </div>
    </>
  );
}
