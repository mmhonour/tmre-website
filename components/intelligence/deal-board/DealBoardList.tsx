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
import type { DealBoardCardView, DealBoardView } from "@/lib/deal-board-view";
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
  /** Lookey: expose Last looked in the sort drawer. */
  showLookedSort?: boolean;
  /** Hide SFR/Rental/etc. in meta when Sale or Rental filter pill is active. */
  hideOwnershipType?: boolean;
  loading: boolean;
  loadingLabel: string;
  emptyLabel: string;
  onResetFilters: () => void;
  onScoreClick: (listing: DealBoardListing) => void;
  onStatusClick: (listing: DealBoardListing) => void;
  /** Map view: highlight / center the pin for the hovered card. */
  onHoverListing?: (key: string | null) => void;
  sortKey: DealBoardSortKey;
  sortDir: DealBoardSortDir;
  onSort: (key: DealBoardSortKey) => void;
  boardView: DealBoardView;
  onBoardViewChange: (view: DealBoardCardView) => void;
  mapOn?: boolean;
  onMapToggle?: () => void;
  /** Restrict the view picker — boards with no map panel omit "map". */
  viewOptions?: readonly DealBoardView[];
  /**
   * Phone-only: drop the cards but keep the toolbar when the map owns the
   * screen. Desktop keeps Large / Grid / Line visible with the map.
   */
  rowsHiddenBelowMd?: boolean;
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
   * Mobile: field picker + bold ↑/↓ live on the results column header row —
   * toolbar hides the Sort chip. Desktop keeps the full field+dir chip.
   */
  sortFieldPickerInToolbar?: boolean;
  sortFieldDrawerOpen?: boolean;
  onSortFieldDrawerOpenChange?: (open: boolean) => void;
  /** When filters pin under the nav, sit this toolbar just below them. */
  toolbarStickyTopPx?: number;
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
  showLookedSort = false,
  hideOwnershipType = false,
  loading,
  loadingLabel,
  emptyLabel,
  onResetFilters,
  onScoreClick,
  onStatusClick,
  onHoverListing,
  sortKey,
  sortDir,
  onSort,
  boardView,
  onBoardViewChange,
  mapOn = false,
  onMapToggle,
  viewOptions,
  rowsHiddenBelowMd = false,
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
  toolbarStickyTopPx,
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

  const orderedKey = useMemo(
    () => orderedVisible.map((l) => l.key).join("|"),
    [orderedVisible],
  );
  const batching =
    progressivePhotoBatches && orderedVisible.length > DEAL_BOARD_PHOTO_BATCH;

  const [mountedForKey, setMountedForKey] = useState(orderedKey);
  // Reset the batch window in the same render as an order change. A useEffect
  // reset painted one frame with the old (often 100) limit after every sort,
  // which reordered a full page of photo cards and felt like a freeze.
  let effectiveMountedLimit = mountedLimit;
  if (progressivePhotoBatches && orderedKey !== mountedForKey) {
    setMountedForKey(orderedKey);
    setMountedLimit(DEAL_BOARD_PHOTO_BATCH);
    effectiveMountedLimit = DEAL_BOARD_PHOTO_BATCH;
  } else if (!progressivePhotoBatches && mountedForKey !== "") {
    setMountedForKey("");
    setMountedLimit(DEAL_BOARD_PHOTO_BATCH);
  }

  useEffect(() => {
    if (!batching || effectiveMountedLimit >= orderedVisible.length) return;
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
  }, [batching, effectiveMountedLimit, orderedVisible.length]);

  const mountedKeys = useMemo(() => {
    if (!batching) return null;
    return new Set(
      orderedVisible.slice(0, effectiveMountedLimit).map((l) => l.key),
    );
  }, [batching, orderedVisible, effectiveMountedLimit]);

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
    onHover: onHoverListing,
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
      case "map":
        return renderGrid(rows);
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
    ? Math.max(0, orderedVisible.length - effectiveMountedLimit)
    : 0;

  const sortControl = (
    <DealBoardSortBar
      sortKey={sortKey}
      sortDir={sortDir}
      onSort={onSort}
      showTown={showTown}
      showLookedSort={showLookedSort}
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
      compact={mapOn}
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
      <DealBoardViewPicker
        view={boardView}
        onChange={onBoardViewChange}
        mapOn={mapOn}
        onMapToggle={onMapToggle}
        options={viewOptions}
      />
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
      {/*
        Mobile: no Sort pill here when the header owns Sorted by / ↑↓
        (sortFieldPickerInToolbar=false). SortBar still mounts in the desktop
        grid below — display:none on small screens, but the field drawer
        portals to body and stays usable from the header control.
      */}
      <div className="flex flex-col gap-y-1.5 lg:hidden">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 shrink">
            {sortFieldPickerInToolbar ? sortControl : resultsSummary}
          </div>
          {mapOn ? viewAndReset : moreDataInsights}
        </div>
        <div
          className={`flex items-center gap-2 ${
            mapOn ? "" : "justify-between"
          }`}
        >
          <div
            className={
              mapOn ? "min-w-0 flex-1" : "min-w-0 overflow-x-auto"
            }
          >
            {statusPills}
          </div>
          {mapOn ? null : viewAndReset}
        </div>
      </div>

      {/* Desktop: summary (+ sort) | status pills | data/insights + views + reset */}
      <div className="hidden lg:grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-2 gap-y-1.5">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 justify-self-start">
          <div className="min-w-0">{resultsSummary}</div>
          {sortControl}
        </div>
        <div className="justify-self-center">{statusPills}</div>
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-x-2.5 gap-y-1 justify-self-end">
          {mapOn ? null : moreDataInsights}
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
            <div
              className="sticky z-30 rounded-t-2xl bg-white shadow-[0_4px_16px_-8px_rgba(26,35,50,0.18)]"
              style={{ top: toolbarStickyTopPx ?? 80 }}
            >
              {resultsToolbar}
            </div>
            <div className={rowsHiddenBelowMd ? "hidden md:block" : undefined}>
              {/*
                Render consecutive listings in one CSS grid. Splitting top /
                middle / bottom into separate grids restarted columns (e.g. 10
                results looked like 3–4 broken bands on desktop large/grid).
                Only split when the middle-tier collapse panel sits between.
              */}
              {tierBlock ? (
                <>
                  {renderRows([...topRows, ...middlePinnedRows])}
                  {tierBlock}
                  {renderRows(bottomRows)}
                </>
              ) : (
                <>
                  {renderRows([
                    ...topRows,
                    ...middlePinnedRows,
                    ...(middleTierExpanded ? middleRows : []),
                    ...bottomRows,
                  ])}
                  {hideMiddleControl}
                </>
              )}
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
        {hasResults && !mapOn ? footer : null}
        {hasResults && mapOn ? (
          <div className="hidden md:block">{footer}</div>
        ) : null}
      </div>
    </>
  );
}
