"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useOpenHouseTownOrder } from "@/hooks/useOpenHouseTownOrder";
import {
  formatTownList,
  listingInTmreCoverage,
  listingZipMatchesTown,
  normalizeTownName,
  TMRE_TOWNS,
  townForZip,
  type TmreTown,
} from "@/lib/tmre-towns";
import { countListingsByTown } from "@/lib/town-listing-counts";
import TownFilterPills from "@/components/TownFilterPills";
import {
  filterPillButtonClass,
  filterPillContainerClass,
  type FilterPillTheme,
} from "@/lib/filter-pill-styles";
import { listingDetailHref, listingPhotoProxyUrl } from "@/lib/listing-url";
import ListingThumbImage from "@/components/ListingThumbImage";
import { listingHoverHandlers } from "@/lib/warm-listing-cache";
import { isRentalListing } from "@/lib/listing-kind";
import { usePersistedFilter } from "@/hooks/usePersistedFilter";
import {
  etCalendarDate,
  formatOpenHouseHistory,
  formatOpenHouseWeekCount,
  formatOpenHouseWhen,
  formatOpenHouseWhenShort,
  OPEN_HOUSES_LOAD_ERROR_BODY,
  OPEN_HOUSES_LOAD_ERROR_TITLE,
  type OpenHouseEvent,
  type OpenHouseListing,
  type OpenHousesPageLoad,
} from "@/lib/open-houses";
import {
  groupOpenHousesByTownAndDay,
  openHouseListingTown,
  type OpenHouseTownGroup,
} from "@/lib/open-houses-groups";
import { placeTownNextTo } from "@/lib/open-houses-town-order";
import {
  compareOpenHousePastCountDesc,
  filterOpenHouseFocus,
  OPEN_HOUSE_SHOW_BY_VALUES,
  openHouseFocusEmptyCopy,
  showByToFocus,
  type OpenHouseShowBy,
} from "@/lib/open-houses-focus";
import { OpenHouseShowBySelect } from "@/components/OpenHouseShowBySelect";
import { OpenHouseTownSection } from "@/components/OpenHouseTownSection";
import DealBoardViewPicker from "@/components/intelligence/deal-board/DealBoardViewPicker";
import { readClientPref } from "@/lib/client-prefs";
import LatestSearchAlertForm from "@/components/latest/LatestSearchAlertForm";
import { fallbackCriteriaFromPage } from "@/lib/visitor-search-profile";
import {
  DEAL_BOARD_CARD_VIEW_VALUES,
  type DealBoardCardView,
} from "@/lib/deal-board-view";

const OH_TOWN_VALUES = ["All", ...TMRE_TOWNS] as const;
const OH_TX_VALUES = ["all", "sale", "rental"] as const;
const OH_VIEW_VALUES = DEAL_BOARD_CARD_VIEW_VALUES;
const OH_SORT_VALUES = ["date", "price-asc", "price-desc"] as const;
const OH_GROUP_VALUES = ["day", "town"] as const;

type ViewMode = DealBoardCardView;
type TxFilter = "all" | "sale" | "rental";
type SortMode = (typeof OH_SORT_VALUES)[number];
type GroupMode = (typeof OH_GROUP_VALUES)[number];
type TownName = TmreTown;
type TownFilter = "All" | TownName;

type ApiResponse = {
  listings: OpenHouseListing[];
  generatedAt: string;
  syncedAt?: string | null;
  window: { start: string; end: string };
  windowLabel: string;
};

type LoadState = "loading" | "ready" | "error";

async function fetchOpenHousesWeek(signal: AbortSignal): Promise<ApiResponse> {
  let last: unknown = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const r = await globalThis.fetch("/api/listings/open-houses", {
        cache: attempt === 0 ? "default" : "no-store",
        headers: { Accept: "application/json" },
        signal,
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return (await r.json()) as ApiResponse;
    } catch (err) {
      last = err;
      if (signal.aborted) throw err;
      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 350 * (attempt + 1)));
        if (signal.aborted) throw err;
      }
    }
  }
  throw last instanceof Error ? last : new Error("Failed to load open houses");
}

const TOWN_NAMES = TMRE_TOWNS;

const TX_FILTERS: { value: TxFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "sale", label: "For Sale" },
  { value: "rental", label: "Rental" },
];

function fmtMoney(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  return `$${n.toLocaleString()}`;
}

function isOhRental(l: OpenHouseListing): boolean {
  return isRentalListing({ propertyType: l.propertyType });
}

const PHOTO_PREVIEW_GRID = "h-[8.51rem]";
const PHOTO_PREVIEW_ROWS = "w-[10.5rem] min-h-[7.5rem]";
const PHOTO_PREVIEW_LINE = "h-[2.7rem] w-[3.6rem]";
const LINE_OH_COL = "shrink-0 w-[10.5rem] text-right";
const LINE_PRICE_COL = "shrink-0 w-[5.25rem] text-right";
const STICKY_TOP_CLASS = "top-20 lg:top-24";

function formatOhSyncAge(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return null;
  const hours = (Date.now() - then) / 3_600_000;
  if (hours < 2) return `History stored ${Math.max(1, Math.round(hours * 60))}m ago`;
  if (hours < 48) return `History last stored ${Math.round(hours)}h ago`;
  return `History last stored ${Math.round(hours / 24)} days ago`;
}

function creamChipClass(active: boolean): string {
  return `inline-flex items-center gap-1 rounded-full border px-3 py-1.5 font-mono text-[10px] tracking-[0.12em] uppercase transition-colors ${
    active
      ? "border-gold/50 bg-gold/10 text-navy"
      : "border-charcoal/[0.08] bg-white text-navy hover:border-gold/40"
  }`;
}

function OhPlaceFilters({
  theme,
  className = "",
  txFilter,
  setTxFilter,
  townFilter,
  setTownFilter,
  orderedTowns,
  townCounts,
  loadState,
}: {
  theme: FilterPillTheme;
  className?: string;
  txFilter: TxFilter;
  setTxFilter: (value: TxFilter) => void;
  townFilter: TownFilter;
  setTownFilter: (value: TownFilter) => void;
  orderedTowns: readonly TownName[];
  townCounts: Partial<Record<TownFilter | TownName, number>>;
  loadState: LoadState;
}) {
  return (
    <div className={`flex flex-wrap items-center gap-3 ${className}`}>
      <div className={filterPillContainerClass("compact", { wrap: false, theme })}>
        {TX_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setTxFilter(f.value)}
            aria-pressed={txFilter === f.value}
            className={filterPillButtonClass(txFilter === f.value, "compact", theme)}
          >
            {f.label}
          </button>
        ))}
      </div>
      <TownFilterPills
        towns={orderedTowns}
        selected={townFilter}
        onSelect={setTownFilter}
        counts={loadState === "ready" ? townCounts : undefined}
        allLabel="All Towns"
        showSeparatorAfterAll
        size="compact"
        scrollable
        theme={theme}
        className="min-w-0 flex-1"
      />
    </div>
  );
}

function OhStickyFilters({
  showPlaceFilters,
  txFilter,
  setTxFilter,
  townFilter,
  setTownFilter,
  orderedTowns,
  townCounts,
  loadState,
  showBy,
  setShowBy,
  sortMode,
  setSortMode,
  groupMode,
  setGroupMode,
  viewMode,
  setViewMode,
  allTownsCollapsed,
  allTownsExpanded,
  onCloseAllTowns,
  onExpandAllTowns,
  customOrder,
  onResetOrder,
  showTownChrome,
  alertFallback,
}: {
  showPlaceFilters: boolean;
  txFilter: TxFilter;
  setTxFilter: (value: TxFilter) => void;
  townFilter: TownFilter;
  setTownFilter: (value: TownFilter) => void;
  orderedTowns: readonly TownName[];
  townCounts: Partial<Record<TownFilter | TownName, number>>;
  loadState: LoadState;
  showBy: OpenHouseShowBy;
  setShowBy: (value: OpenHouseShowBy) => void;
  sortMode: SortMode;
  setSortMode: (value: SortMode) => void;
  groupMode: GroupMode;
  setGroupMode: (value: GroupMode) => void;
  viewMode: ViewMode;
  setViewMode: (value: ViewMode) => void;
  allTownsCollapsed: boolean;
  allTownsExpanded: boolean;
  onCloseAllTowns: () => void;
  onExpandAllTowns: () => void;
  customOrder: boolean;
  onResetOrder: () => void;
  showTownChrome: boolean;
  alertFallback: ReturnType<typeof fallbackCriteriaFromPage>;
}) {
  const theme: FilterPillTheme = "light";
  return (
    <div className="flex flex-col gap-3">
      {showPlaceFilters ? (
        <OhPlaceFilters
          theme={theme}
          txFilter={txFilter}
          setTxFilter={setTxFilter}
          townFilter={townFilter}
          setTownFilter={setTownFilter}
          orderedTowns={orderedTowns}
          townCounts={townCounts}
          loadState={loadState}
        />
      ) : null}

      <div className="grid min-h-8 grid-cols-1 items-center gap-2 min-[860px]:grid-cols-[1fr_auto_1fr]">
        <div className="flex flex-wrap items-center justify-start gap-2">
          <button
            type="button"
            onClick={() => setSortMode("date")}
            aria-pressed={sortMode === "date"}
            className={creamChipClass(sortMode === "date")}
          >
            Date
          </button>
          <button
            type="button"
            onClick={() => setGroupMode(groupMode === "day" ? "town" : "day")}
            aria-pressed={groupMode === "day"}
            className={creamChipClass(groupMode === "day")}
          >
            {groupMode === "day" ? "By day" : "By town"}
          </button>
          <button
            type="button"
            onClick={() =>
              setSortMode(sortMode === "price-asc" ? "price-desc" : "price-asc")
            }
            aria-pressed={sortMode !== "date"}
            className={creamChipClass(sortMode !== "date")}
          >
            Price
            {sortMode === "price-desc" ? (
              <span className="text-[9px] tabular-nums" aria-hidden>
                ↓
              </span>
            ) : sortMode === "price-asc" ? (
              <span className="text-[9px] tabular-nums" aria-hidden>
                ↑
              </span>
            ) : null}
          </button>
        </div>
        <div className="justify-self-center">
          <LatestSearchAlertForm
            variant="open-houses"
            fallbackCriteria={alertFallback}
            triggerId="open-house-alerts"
            panelAlign="center"
          />
        </div>
        <div className="flex flex-wrap items-center justify-start gap-1.5 min-[860px]:justify-end">
          <OpenHouseShowBySelect value={showBy} onChange={setShowBy} />
          <DealBoardViewPicker view={viewMode} onChange={setViewMode} />
          {showTownChrome ? (
            <TownFoldGlyphs
              allTownsCollapsed={allTownsCollapsed}
              allTownsExpanded={allTownsExpanded}
              onCloseAllTowns={onCloseAllTowns}
              onExpandAllTowns={onExpandAllTowns}
              customOrder={customOrder}
              onResetOrder={onResetOrder}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function useMaybePersistedFilter<T extends string>(
  isolate: boolean,
  key: string,
  defaultValue: T,
  validValues: readonly T[],
  resolveDefault?: () => T,
): [T, (value: T) => void] {
  const persisted = usePersistedFilter(
    key,
    defaultValue,
    validValues,
    false,
    resolveDefault,
  );
  const [local, setLocal] = useState<T>(defaultValue);
  return isolate ? [local, setLocal] : persisted;
}

export default function OpenHousesClient({
  initial,
  defaultOpenTowns,
  previewBanner,
  isolatePrefs = false,
  initialView,
}: {
  initial?: OpenHousesPageLoad | null;
  defaultOpenTowns?: readonly string[];
  previewBanner?: string;
  /** Preview pages: ignore saved OH cookies so Grid is not stuck on. */
  isolatePrefs?: boolean;
  initialView?: ViewMode;
} = {}) {
  const [allListings, setAllListings] = useState<OpenHouseListing[]>(
    () => (initial?.ok ? initial.data.listings : []),
  );
  const [windowLabel, setWindowLabel] = useState(
    () => (initial?.ok ? initial.data.windowLabel : ""),
  );
  const [syncedAt, setSyncedAt] = useState<string | null>(
    () => (initial?.ok ? initial.data.syncedAt : null),
  );
  const [loadState, setLoadState] = useState<LoadState>(() =>
    initial?.ok ? "ready" : initial && !initial.ok ? "error" : "loading",
  );
  const [reloadToken, setReloadToken] = useState(0);
  const [townFilter, setTownFilter] = useMaybePersistedFilter<TownFilter>(
    isolatePrefs,
    "tmre_oh_town",
    "All",
    OH_TOWN_VALUES,
  );
  const [txFilter, setTxFilter] = useMaybePersistedFilter<TxFilter>(
    isolatePrefs,
    "tmre_oh_tx",
    "all",
    OH_TX_VALUES,
  );
  const [sortMode, setSortMode] = useMaybePersistedFilter<SortMode>(
    isolatePrefs,
    "tmre_oh_sort",
    "date",
    OH_SORT_VALUES,
  );
  const [viewMode, setViewMode] = useMaybePersistedFilter<ViewMode>(
    isolatePrefs,
    "tmre_oh_view",
    initialView ?? "grid",
    OH_VIEW_VALUES,
    () => (readClientPref("tmre_oh_view") === "rows" ? "large" : "grid"),
  );
  const [groupMode, setGroupMode] = useMaybePersistedFilter<GroupMode>(
    isolatePrefs,
    "tmre_oh_group",
    "day",
    OH_GROUP_VALUES,
  );
  const [showBy, setShowBy] = useMaybePersistedFilter<OpenHouseShowBy>(
    isolatePrefs,
    "tmre_oh_show_by",
    "off",
    OPEN_HOUSE_SHOW_BY_VALUES,
    () => {
      if (readClientPref("tmre_oh_first") === "on") return "first";
      if (readClientPref("tmre_oh_most") === "on") return "most";
      return "off";
    },
  );
  const focus = useMemo(() => showByToFocus(showBy), [showBy]);
  const { orderedTowns, customOrder, setPreferredOrder, resetOrder } =
    useOpenHouseTownOrder(TOWN_NAMES);
  const [openTowns, setOpenTowns] = useState<Set<string>>(
    () => new Set(defaultOpenTowns ?? []),
  );
  const [dragTown, setDragTown] = useState<string | null>(null);
  const [dragOverTown, setDragOverTown] = useState<string | null>(null);
  const [placeFiltersDocked, setPlaceFiltersDocked] = useState(false);
  const placeFiltersSentinelRef = useRef<HTMLDivElement>(null);
  const today = useMemo(() => etCalendarDate(), []);

  useEffect(() => {
    const el = placeFiltersSentinelRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => setPlaceFiltersDocked(!entry.isIntersecting),
      { rootMargin: "-96px 0px 0px 0px", threshold: 0 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (reloadToken === 0 && initial?.ok) return;
    if (reloadToken === 0 && allListings.length > 0) return;
    const controller = new AbortController();
    setLoadState("loading");
    fetchOpenHousesWeek(controller.signal)
      .then((d) => {
        if (controller.signal.aborted) return;
        setAllListings(d.listings);
        setWindowLabel(d.windowLabel);
        setSyncedAt(d.syncedAt ?? null);
        setLoadState("ready");
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setLoadState((state) => (state === "ready" ? state : "error"));
      });
    return () => {
      controller.abort();
    };
  }, [initial, reloadToken]);

  const listings = useMemo(() => {
    let result = allListings.filter((l) =>
      listingInTmreCoverage(l.address.postalCode, l.address.city),
    );
    if (txFilter === "sale") result = result.filter((l) => !isOhRental(l));
    if (txFilter === "rental") result = result.filter(isOhRental);
    if (townFilter !== "All") {
      result = result.filter((l) => {
        const zipTown = townForZip(l.address.postalCode);
        if (zipTown) return zipTown === townFilter;
        return (
          listingZipMatchesTown(l.address.postalCode, townFilter) &&
          normalizeTownName(l.address.city)?.toLowerCase() === townFilter.toLowerCase()
        );
      });
    }
    return filterOpenHouseFocus(result, focus, openHouseListingTown);
  }, [allListings, townFilter, txFilter, focus]);

  const displayListings = useMemo(() => {
    const sorted = [...listings];
    if (sortMode === "date") {
      sorted.sort((a, b) => {
        if (focus.most) {
          const byCount = compareOpenHousePastCountDesc(a, b);
          if (byCount !== 0) return byCount;
        }
        const dateCmp = a.nextOpenHouse.date.localeCompare(b.nextOpenHouse.date);
        if (dateCmp !== 0) return dateCmp;
        return (a.nextOpenHouse.startDateTime ?? "").localeCompare(
          b.nextOpenHouse.startDateTime ?? "",
        );
      });
      return sorted;
    }
    const mult = sortMode === "price-asc" ? 1 : -1;
    sorted.sort((a, b) => {
      if (focus.most) {
        const byCount = compareOpenHousePastCountDesc(a, b);
        if (byCount !== 0) return byCount;
      }
      const pa = a.price ?? (sortMode === "price-asc" ? Infinity : -Infinity);
      const pb = b.price ?? (sortMode === "price-asc" ? Infinity : -Infinity);
      return mult * (pa - pb);
    });
    return sorted;
  }, [listings, sortMode, focus]);

  const groupedListings = useMemo(
    () =>
      groupOpenHousesByTownAndDay(displayListings, {
        today,
        byDay: groupMode === "day",
        townOrder: orderedTowns,
      }),
    [displayListings, today, groupMode, orderedTowns],
  );

  const townSections = useMemo(() => {
    if (townFilter !== "All") return groupedListings;
    const byTown = new Map(groupedListings.map((group) => [group.town, group]));
    return orderedTowns.map(
      (town): OpenHouseTownGroup =>
        byTown.get(town) ?? { town, propertyCount: 0, days: [] },
    );
  }, [groupedListings, orderedTowns, townFilter]);

  const allTownsCollapsed =
    townSections.length > 0 && townSections.every((group) => !openTowns.has(group.town));

  const toggleTownOpen = (town: string, next: boolean) => {
    setOpenTowns((current) => {
      const copy = new Set(current);
      if (next) copy.add(town);
      else copy.delete(town);
      return copy;
    });
  };

  const collapseAllTowns = () => setOpenTowns(new Set());
  const expandAllTowns = () =>
    setOpenTowns(new Set(townSections.map((group) => group.town)));

  const townCounts = useMemo(() => {
    let pool = allListings.filter((l) =>
      listingInTmreCoverage(l.address.postalCode, l.address.city),
    );
    if (txFilter === "sale") pool = pool.filter((l) => !isOhRental(l));
    if (txFilter === "rental") pool = pool.filter(isOhRental);
    pool = filterOpenHouseFocus(pool, focus, openHouseListingTown);
    return countListingsByTown(pool, { requireCoverage: true });
  }, [allListings, txFilter, focus]);

  const alertFallback = useMemo(
    () =>
      fallbackCriteriaFromPage({
        town: townFilter === "All" ? null : townFilter,
        tx: txFilter,
      }),
    [townFilter, txFilter],
  );

  return (
    <>
      <section className="navy-gradient text-white pt-20 pb-8 lg:pt-28 lg:pb-12 relative overflow-hidden">
        <div className="absolute inset-0 hero-grid opacity-40" aria-hidden />
        <div className="relative mx-auto max-w-7xl px-6 lg:px-10">
          {previewBanner ? (
            <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.16em] text-gold/80">
              {previewBanner}
            </p>
          ) : null}
          <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold mb-3 animate-fade-up">
            Open Houses
          </p>
          <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl text-white leading-[1.05] max-w-3xl animate-fade-up">
            Walk through the door{" "}
            <span className="italic gold-shimmer">this week.</span>
          </h1>
          <p className="mt-3 text-sm lg:text-base text-white/70 max-w-xl leading-relaxed animate-fade-up-delay-1">
            Public open houses across {formatTownList(TOWN_NAMES)} this week.
            Town counts are unique homes still hosting. Past counts document
            earlier showings on those same homes — we do not list a series
            that already ended.
          </p>

          <OhPlaceFilters
            theme="dark"
            className="mt-5 animate-fade-up-delay-2"
            txFilter={txFilter}
            setTxFilter={setTxFilter}
            townFilter={townFilter}
            setTownFilter={setTownFilter}
            orderedTowns={orderedTowns}
            townCounts={townCounts}
            loadState={loadState}
          />
          <div ref={placeFiltersSentinelRef} className="h-px w-full" aria-hidden />

          <div className="mt-4 flex items-center gap-2 font-mono text-xs">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                loadState === "loading"
                  ? "bg-gold animate-pulse-dot"
                  : loadState === "error"
                    ? "bg-red-400"
                    : "bg-sage animate-pulse-dot"
              }`}
            />
            <span className="text-white/50">
              {loadState === "loading"
                ? "Loading open houses…"
                : loadState === "error"
                  ? OPEN_HOUSES_LOAD_ERROR_TITLE
                  : `${allListings.length} homes · ${windowLabel || "Today through Sunday (ET)"}`}
              {loadState === "ready" && formatOhSyncAge(syncedAt)
                ? ` · ${formatOhSyncAge(syncedAt)}`
                : ""}
            </span>
          </div>

          {loadState === "ready" && (
            <div className="mt-8">
              <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold mb-2">
                Open Houses{townFilter !== "All" ? ` · ${townFilter}` : ""}
                {focus.most ? " · most historical" : ""}
                {focus.first ? " · first showing" : ""}
              </p>
              <h2 className="font-serif text-2xl sm:text-3xl text-white">
                {listings.length}{" "}
                <span className="italic">
                  {listings.length === 1 ? "home" : "homes"} with showings.
                </span>
              </h2>
            </div>
          )}
        </div>
      </section>

      <section className="bg-cream">
        <div
          className={`sticky ${STICKY_TOP_CLASS} z-30 border-b border-charcoal/[0.08] bg-cream/95 backdrop-blur-sm`}
        >
          <div className="mx-auto max-w-7xl px-6 lg:px-10 py-3">
            <OhStickyFilters
              showPlaceFilters={placeFiltersDocked}
              txFilter={txFilter}
              setTxFilter={setTxFilter}
              townFilter={townFilter}
              setTownFilter={setTownFilter}
              orderedTowns={orderedTowns}
              townCounts={townCounts}
              loadState={loadState}
              showBy={showBy}
              setShowBy={setShowBy}
              sortMode={sortMode}
              setSortMode={setSortMode}
              groupMode={groupMode}
              setGroupMode={setGroupMode}
              viewMode={viewMode}
              setViewMode={setViewMode}
              allTownsCollapsed={allTownsCollapsed}
              allTownsExpanded={
                !allTownsCollapsed && openTowns.size === townSections.length
              }
              onCloseAllTowns={collapseAllTowns}
              onExpandAllTowns={expandAllTowns}
              customOrder={customOrder}
              onResetOrder={resetOrder}
              showTownChrome={loadState === "ready" && listings.length > 0}
              alertFallback={alertFallback}
            />
          </div>
        </div>
        <div className="mx-auto max-w-7xl px-6 lg:px-10 pt-3 pb-10 lg:pt-4 lg:pb-12">
          {loadState === "loading" ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="rounded-xl bg-white border border-charcoal/[0.06] p-3 h-52 animate-pulse"
                />
              ))}
            </div>
          ) : loadState === "error" ? (
            <div className="text-center py-24">
              <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-slate mb-3">
                {OPEN_HOUSES_LOAD_ERROR_TITLE}
              </p>
              <p className="text-charcoal/70">{OPEN_HOUSES_LOAD_ERROR_BODY}</p>
              <button
                type="button"
                onClick={() => {
                  setAllListings([]);
                  setReloadToken((n) => n + 1);
                }}
                className="mt-5 rounded-full border border-charcoal/20 bg-white px-4 py-2 font-mono text-[10px] tracking-[0.12em] uppercase text-navy hover:border-navy"
              >
                Try again
              </button>
            </div>
          ) : listings.length === 0 ? (
            <div className="text-center py-24">
              <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-slate mb-3">
                No open houses found
              </p>
              <p className="text-charcoal/70">
                {openHouseFocusEmptyCopy({
                  focus,
                  town: townFilter === "All" ? null : townFilter,
                })}{" "}
                Try another town or turn a filter off.
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-3">
                {townSections.map((townGroup) => (
                  <OpenHouseTownSection
                    key={townGroup.town}
                    town={townGroup.town}
                    propertyCount={townGroup.propertyCount}
                    open={openTowns.has(townGroup.town)}
                    onOpenChange={(next) => toggleTownOpen(townGroup.town, next)}
                    organize={
                      townSections.length > 1
                        ? {
                            dragging: dragTown === townGroup.town,
                            dragOver:
                              dragOverTown === townGroup.town && dragTown !== townGroup.town,
                            onDragStart: () => setDragTown(townGroup.town),
                            onDragOver: () => setDragOverTown(townGroup.town),
                            onDragLeave: () =>
                              setDragOverTown((current) =>
                                current === townGroup.town ? null : current,
                              ),
                            onDrop: () => {
                              if (dragTown && dragTown !== townGroup.town) {
                                setPreferredOrder(
                                  placeTownNextTo(
                                    orderedTowns,
                                    dragTown,
                                    townGroup.town,
                                    "before",
                                  ),
                                );
                              }
                              setDragTown(null);
                              setDragOverTown(null);
                            },
                            onDragEnd: () => {
                              setDragTown(null);
                              setDragOverTown(null);
                            },
                          }
                        : undefined
                    }
                  >
                    {townGroup.propertyCount === 0 ? (
                      <p className="font-mono text-xs text-slate">
                        No open houses this week.
                      </p>
                    ) : (
                      <div className="space-y-6">
                        {townGroup.days.map((day) => (
                          <div key={day.date || townGroup.town}>
                            {day.label ? (
                              <h4 className="mb-3 font-mono text-[11px] tracking-[0.14em] uppercase text-slate">
                                {day.label}
                              </h4>
                            ) : null}
                            <ListingCollection listings={day.listings} view={viewMode} />
                          </div>
                        ))}
                      </div>
                    )}
                  </OpenHouseTownSection>
                ))}
              </div>
            </>
          )}
        </div>
      </section>
    </>
  );
}

function useOwnerLookup(city: string, street: string, retsOwner: string | null): string {
  const [owner, setOwner] = useState<string | null>(retsOwner);
  const [loading, setLoading] = useState(!retsOwner);

  useEffect(() => {
    if (retsOwner) {
      setOwner(retsOwner);
      return;
    }
    if (!city || !street) {
      setLoading(false);
      return;
    }
    setLoading(true);
    fetch(
      `/api/owner-lookup?city=${encodeURIComponent(city.toLowerCase())}&street=${encodeURIComponent(street)}`,
      { cache: "default" },
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { owner?: string | null } | null) => {
        setOwner(d?.owner ?? null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [city, street, retsOwner]);

  if (loading) return "Looking up…";
  return owner ?? "Not disclosed";
}

function listingMeta(l: OpenHouseListing) {
  const isRental = isOhRental(l);
  const type = l.propertyType.replace(/ For Sale$/i, "").replace(/ For Lease$/i, "");
  const specs = [
    l.beds ? `${l.beds}BR` : null,
    l.baths ? `${l.baths}BA` : null,
    l.sqft ? `${l.sqft.toLocaleString()} sqft` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const detailHref =
    l.mlsId && l.mlsId !== "—"
      ? listingDetailHref(l.mlsId, l.address.street || l.address.full)
      : null;
  const place = [l.address.city, l.address.state, l.address.postalCode].filter(Boolean).join(" ");
  const subtype = [type, l.style, l.yearBuilt ? `Built ${l.yearBuilt}` : null]
    .filter(Boolean)
    .join(" · ");
  const priceLabel = isRental ? "Rent" : "Price";
  const priceValue = `${fmtMoney(l.price)}${isRental && l.price != null ? "/mo" : ""}`;
  const ohLabel = formatOpenHouseWhen(l.nextOpenHouse);
  const ohShort = formatOpenHouseWhenShort(l.nextOpenHouse);
  const weekCount = l.weekOpenHouseCount;
  const weekLabel = formatOpenHouseWeekCount(weekCount);
  const historyLabel = formatOpenHouseHistory(l.pastCount ?? 0, l.upcomingCount ?? 0);

  return {
    isRental,
    specs,
    detailHref,
    place,
    subtype,
    priceLabel,
    priceValue,
    ohLabel,
    ohShort,
    weekCount,
    weekLabel,
    historyLabel,
  };
}

function useFirstPhoto(listing: {
  mlsId: string;
  listingKey?: string | null;
  photoCount?: number | null;
  primaryPhotoIndex?: number | null;
}): string | null {
  const id = listing.listingKey?.trim() || listing.mlsId;
  if (!id || id === "—" || (listing.photoCount != null && listing.photoCount <= 0)) {
    return null;
  }
  const index =
    listing.primaryPhotoIndex != null && listing.primaryPhotoIndex >= 0
      ? listing.primaryPhotoIndex
      : 0;
  return listingPhotoProxyUrl(id, index);
}

export function ListingCollection({
  listings,
  view,
}: {
  listings: OpenHouseListing[];
  view: ViewMode;
}) {
  if (view === "line") {
    return (
      <div className="flex flex-col rounded-xl border border-charcoal/[0.08] bg-white overflow-hidden">
        <div className="flex items-center gap-2.5 px-3 py-2 border-b border-charcoal/[0.08] bg-cream/60 font-mono text-[9px] tracking-[0.12em] uppercase text-slate">
          <div className={`${PHOTO_PREVIEW_LINE} shrink-0`} aria-hidden />
          <span className="min-w-0 flex-1">Property</span>
          <span className={LINE_OH_COL}>Next open</span>
          <span className={LINE_PRICE_COL}>Price</span>
        </div>
        <div className="flex flex-col divide-y divide-charcoal/[0.08]">
          {listings.map((l) => (
            <ListingCard key={l.mlsId + l.address.street} listing={l} view={view} />
          ))}
        </div>
      </div>
    );
  }
  return (
    <div
      className={
        view === "grid"
          ? "grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3"
          : "flex flex-col gap-3"
      }
    >
      {listings.map((l) => (
        <ListingCard key={l.mlsId + l.address.street} listing={l} view={view} />
      ))}
    </div>
  );
}

function ListingPhoto({
  listing: l,
  photo,
  className = "",
  iconClass = "w-8 h-8",
  alignTop = false,
}: {
  listing: OpenHouseListing;
  photo: string | null;
  className?: string;
  iconClass?: string;
  alignTop?: boolean;
}) {
  const { detailHref } = listingMeta(l);
  const placeholder = (
    <div className={`w-full h-full flex items-center justify-center bg-cream ${className}`}>
      <svg className={`${iconClass} text-navy/20`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1}
          d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
        />
      </svg>
    </div>
  );

  const image = photo ? (
    <ListingThumbImage
      src={photo}
      priority
      className={`relative block w-full h-full overflow-hidden ${className}`}
      imgClassName={`block w-full h-full object-cover${alignTop ? " object-top" : ""}`}
    />
  ) : (
    placeholder
  );

  if (detailHref) {
    return (
      <Link href={detailHref} className="block w-full h-full" aria-label={`View ${l.address.street}`}>
        {image}
      </Link>
    );
  }
  return image;
}

function OpenHouseBadge({
  label,
  compact = false,
}: {
  label: string;
  compact?: boolean;
}) {
  return (
    <span
      className={`inline-flex max-w-full items-center justify-end rounded-full border border-charcoal/20 bg-white font-mono font-medium tabular-nums leading-tight text-navy shadow-sm ${
        compact ? "px-1.5 py-0.5 text-[8px]" : "px-2 py-0.5 text-[9px]"
      }`}
    >
      {label}
    </span>
  );
}

function TownFoldGlyphs({
  allTownsCollapsed,
  allTownsExpanded,
  onCloseAllTowns,
  onExpandAllTowns,
  customOrder,
  onResetOrder,
}: {
  allTownsCollapsed: boolean;
  allTownsExpanded: boolean;
  onCloseAllTowns: () => void;
  onExpandAllTowns: () => void;
  customOrder: boolean;
  onResetOrder: () => void;
}) {
  const btn =
    "inline-flex h-8 w-8 items-center justify-center transition-colors";
  const active = "bg-navy text-white";
  const idle = "text-navy/55 hover:text-navy hover:bg-charcoal/[0.04]";

  return (
    <div
      className="inline-flex items-center rounded-full border border-charcoal/[0.08] bg-white p-0.5"
      role="group"
      aria-label="Town sections"
    >
      <button
        type="button"
        aria-label="Close all towns"
        aria-pressed={allTownsCollapsed}
        title="Close all towns"
        onClick={onCloseAllTowns}
        className={`${btn} rounded-full ${allTownsCollapsed ? active : idle}`}
      >
        <CloseTownsIcon />
      </button>
      <button
        type="button"
        aria-label="Expand all towns"
        aria-pressed={allTownsExpanded}
        title="Expand all towns"
        onClick={onExpandAllTowns}
        className={`${btn} rounded-full ${allTownsExpanded ? active : idle}`}
      >
        <ExpandTownsIcon />
      </button>
      {customOrder ? (
        <button
          type="button"
          aria-label="Reset town order"
          title="Reset town order"
          onClick={onResetOrder}
          className={`${btn} rounded-full ${idle}`}
        >
          <ResetTownOrderIcon />
        </button>
      ) : null}
    </div>
  );
}

function CloseTownsIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <rect x="2" y="3.5" width="12" height="1.4" rx="0.6" />
      <rect x="4" y="7.3" width="8" height="1.4" rx="0.6" />
      <rect x="6" y="11.1" width="4" height="1.4" rx="0.6" />
    </svg>
  );
}

function ExpandTownsIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <rect x="2" y="2.5" width="12" height="1.35" rx="0.6" />
      <rect x="2" y="7.3" width="12" height="1.35" rx="0.6" />
      <rect x="2" y="12.1" width="12" height="1.35" rx="0.6" />
    </svg>
  );
}

function ResetTownOrderIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M3.2 8a4.8 4.8 0 1 1 1.1 3"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path
        d="M3 4.6v3.2h3.2"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function OpenHouseSchedule({ events }: { events: OpenHouseEvent[] }) {
  if (events.length <= 1) return null;
  return (
    <ul className="mt-1 space-y-0.5">
      {events.map((e) => (
        <li key={e.id} className="font-mono text-[9px] text-slate/60">
          {formatOpenHouseWhen(e)}
        </li>
      ))}
    </ul>
  );
}

function ListingCard({ listing: l, view }: { listing: OpenHouseListing; view: ViewMode }) {
  const ownerDisplay = useOwnerLookup(l.address.city, l.address.street, l.ownerName);
  const meta = listingMeta(l);
  const photo = useFirstPhoto(l);

  if (view === "line") {
    return (
      <article
        {...listingHoverHandlers(l.mlsId)}
        className="flex items-center gap-2.5 px-3 py-2 hover:bg-gold/[0.04] transition-colors"
      >
        <div
          className={`relative ${PHOTO_PREVIEW_LINE} shrink-0 overflow-hidden rounded-md border border-charcoal/[0.08]`}
        >
          <ListingPhoto listing={l} photo={photo} iconClass="w-6 h-6" />
        </div>
        <div className="min-w-0 flex-1 flex flex-wrap items-center gap-x-2 gap-y-1">
          {meta.detailHref ? (
            <Link
              href={meta.detailHref}
              className="text-xs font-medium text-navy hover:text-gold truncate max-w-[12rem] sm:max-w-none"
            >
              {l.address.street || l.address.full}
            </Link>
          ) : (
            <span className="text-xs font-medium text-navy truncate max-w-[12rem] sm:max-w-none">
              {l.address.street || l.address.full}
            </span>
          )}
          <span className="font-mono text-[9px] text-slate/70">{meta.place}</span>
          <span className="font-mono text-[9px] tabular-nums text-navy">{meta.weekLabel}</span>
          <span className="font-mono text-[9px] text-slate/60">{meta.historyLabel}</span>
        </div>
        <span className={`${LINE_OH_COL}`}>
          <OpenHouseBadge label={meta.ohShort} compact />
        </span>
        <span className={`${LINE_PRICE_COL} font-mono text-[10px] font-medium tabular-nums text-navy`}>
          {meta.priceValue}
        </span>
      </article>
    );
  }

  if (view === "large") {
    return (
      <article
        {...listingHoverHandlers(l.mlsId)}
        className="flex items-stretch overflow-hidden rounded-xl bg-white border border-charcoal/[0.08] transition-all hover:border-gold/40 hover:shadow-md hover:shadow-navy/5"
      >
        <div
          className={`relative ${PHOTO_PREVIEW_ROWS} shrink-0 self-stretch overflow-hidden bg-cream`}
        >
          <ListingPhoto listing={l} photo={photo} alignTop />
        </div>
        <div className="relative min-w-0 flex-1 flex flex-col sm:flex-row sm:items-start gap-3 p-3">
          <div className="min-w-0 flex-1 sm:pr-2">
            {meta.detailHref ? (
              <Link
                href={meta.detailHref}
                className="text-sm font-medium text-navy leading-tight hover:text-gold transition-colors block truncate"
              >
                {l.address.street || l.address.full}
              </Link>
            ) : (
              <h3 className="text-sm font-medium text-navy leading-tight truncate">
                {l.address.street || l.address.full}
              </h3>
            )}
            <p className="text-xs text-slate mt-0.5 truncate">{meta.place}</p>
            <p className="font-mono text-[9px] tabular-nums text-navy">{meta.weekLabel}</p>
            <p className="font-mono text-[9px] text-slate/60">{meta.historyLabel}</p>
            <OpenHouseSchedule events={l.openHouses} />
          </div>
          <div className="shrink-0 flex flex-col items-end gap-2 sm:min-w-[8.5rem] sm:pt-0">
            <OpenHouseBadge label={meta.ohShort} />
            <div className="text-right">
              <p className="font-mono text-[9px] tracking-[0.12em] uppercase text-slate/60">
                {meta.priceLabel}
              </p>
              <p className="font-mono text-sm tabular-nums text-navy font-medium">{meta.priceValue}</p>
              <p className="font-mono text-[9px] text-slate/55 mt-1 truncate max-w-[10rem] sm:max-w-none">
                {ownerDisplay}
              </p>
            </div>
          </div>
        </div>
      </article>
    );
  }

  return (
    <article
      {...listingHoverHandlers(l.mlsId)}
      className="rounded-xl bg-white border border-charcoal/[0.08] overflow-hidden transition-all hover:border-gold/40 hover:shadow-lg hover:shadow-navy/5 hover:-translate-y-0.5 flex flex-col"
    >
      <div className={`relative ${PHOTO_PREVIEW_GRID} w-full bg-cream border-b border-charcoal/[0.06]`}>
        <ListingPhoto listing={l} photo={photo} alignTop />
        <span className="absolute top-2 right-2 z-10 max-w-[85%]">
          <OpenHouseBadge label={meta.ohShort} />
        </span>
      </div>

      <div className="p-3.5 flex flex-col flex-1">
        <div className="mb-3">
          {meta.detailHref ? (
            <Link
              href={meta.detailHref}
              className="font-medium text-navy text-sm leading-tight hover:text-gold transition-colors block line-clamp-2"
            >
              {l.address.street || l.address.full}
            </Link>
          ) : (
            <h3 className="font-medium text-navy text-sm leading-tight line-clamp-2">
              {l.address.street || l.address.full}
            </h3>
          )}
          <p className="text-xs text-slate mt-0.5 truncate">{meta.place}</p>
          <p className="font-mono text-[9px] tracking-[0.12em] uppercase text-slate/60 mt-1 line-clamp-1">
            {meta.subtype}
          </p>
        </div>

        <div className="mt-auto space-y-1.5 pt-3 border-t border-charcoal/[0.06]">
          <Row label="Next open" value={meta.ohLabel} compact />
          <Row label="This week" value={meta.weekLabel} compact />
          <OpenHouseSchedule events={l.openHouses} />
          <Row label="Showings" value={meta.historyLabel} compact />
          <Row label={meta.isRental ? "Monthly rent" : "List price"} value={meta.priceValue} compact />
          {meta.specs ? <Row label="Specs" value={meta.specs} compact /> : null}
        </div>
      </div>
    </article>
  );
}

function Row({
  label,
  value,
  accent,
  compact = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
  compact?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt
        className={`font-mono tracking-[0.12em] uppercase text-slate shrink-0 ${
          compact ? "text-[8px]" : "text-[10px]"
        }`}
      >
        {label}
      </dt>
      <dd
        className={`font-mono tabular-nums text-right truncate ${
          accent
            ? compact
              ? "text-gold-dark font-medium text-xs"
              : "text-gold-dark font-medium text-sm"
            : compact
              ? "text-charcoal text-xs"
              : "text-charcoal text-sm"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
