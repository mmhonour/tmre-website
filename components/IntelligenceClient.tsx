"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import ZipBoundaryPopover, {
  prefetchAllTownBoundaries,
  prefetchTownBoundaries,
  prefetchZipBoundaries,
} from "./ZipBoundaryPopover";
import { usePersonalizedTowns } from "@/hooks/usePersonalizedTowns";
import AllTownsDescriptor from "@/components/AllTownsDescriptor";
import FilterResetButton from "@/components/FilterResetButton";
import IntelligenceVintageStats from "@/components/IntelligenceVintageStats";
import IntelligenceVintageMedianMiniChart from "@/components/IntelligenceVintageMedianMiniChart";
import IntelTownStatsDrawer from "@/components/intelligence/IntelTownStatsDrawer";
import SnapshotCollapseToggle from "@/components/SnapshotCollapseToggle";
import type { VintageListingRow } from "@/lib/intelligence-vintage-stats";
import type { VintageBucketId } from "@/lib/vintage-buckets";
import DealOfTheDayFrame from "./DealOfTheDayFrame";
import DealBoardList from "@/components/intelligence/deal-board/DealBoardList";
import type { DealBoardStatusFilter } from "@/components/intelligence/deal-board/deal-board-types";
import {
  DEAL_BOARD_VIEW_DEFAULT,
  DEAL_BOARD_VIEW_PREF_KEY,
  DEAL_BOARD_VIEW_VALUES,
  dealBoardViewDefaultForViewport,
  type DealBoardView,
} from "@/lib/deal-board-view";
import {
  clearDealBoardFocus,
  dealBoardRowDomId,
  matchListingKeyFromFocusId,
  parseDealBoardFocusHash,
  peekDealBoardFocus,
  rememberDealBoardFocus,
  stampDealBoardHash,
} from "@/lib/deal-board-focus";
import type { TownDescriptorStats } from "@/lib/intelligence-all-towns-descriptor";
import {
  LISTING_FURNISHED_VALUES,
  type ListingFurnished,
} from "@/lib/listing-furnished";
import { monthsSupplyColorStyle } from "@/lib/months-supply-color";
import ListingScoreBreakdownModal from "./ListingScoreBreakdownModal";
import ListingHistoryModal from "./ListingHistoryModal";
import ModalPortal, { MODAL_PANEL_CLASS } from "./ModalPortal";
import TownFilterPills from "./TownFilterPills";
import ZipFilterPills from "./ZipFilterPills";
import {
  filterPillButtonClass,
  filterPillContainerClass,
  filterPillSeparatorClass,
} from "@/lib/filter-pill-styles";
import { formatTownZipPlace, normalizeTownName, TMRE_TOWNS, listingZipMatchesTown, zipAreaNickname, type TmreTown, zipsForTown } from "@/lib/tmre-towns";
import { TOWN_MARKET_TAGLINES } from "@/lib/intelligence-town-taglines";
import { listingDetailHrefForListing } from "@/lib/listing-url";
import { underContractStatusLabel } from "@/lib/listing-status";
import { prefetchMlsPhotoThumbsOrdered } from "@/lib/prefetch-listing-images";
import { parseIntelligenceSearchParams } from "@/lib/intelligence-search-url";
import {
  bumpIntelligenceSnapshotGeneration,
  getOrSetIntelligenceSnapshotCache,
  intelligenceSnapshotBenchmarksKey,
  intelligenceSnapshotTownKey,
  type IntelligenceSnapshotFilters,
} from "@/lib/intelligence-snapshot-cache";
import { intelligenceListingsHref } from "@/lib/intelligence-url";
import { matchesNewConstruction } from "@/lib/new-construction";
import { statsMedianListingsHref } from "@/lib/stats-url";
import type { ScoreBreakdown } from "@/lib/goldilocks-score-info";
import type { TownCountMap } from "@/lib/town-listing-counts";
import {
  usePersistedFilter,
  usePersistedNullableFilter,
} from "@/hooks/usePersistedFilter";
import { recordVisitorSearch } from "@/lib/visitor-search-profile";
import {
  adjustIntelPriceByWheel,
  INTEL_PRICE_MAX_INDEX,
  boardPriceMaxIndex,
  defaultPriceIndicesFromBoard,
  formatIntelPriceRangeLabelFromSteps,
  formatIntelPriceStep,
  intelPriceFilterActiveOnBoard,
  intelPriceStepsForBoard,
  listingMatchesIntelPriceRange,
  maxPriceToStepIndex,
  minPriceToStepIndex,
  parseIntelPriceInput,
  resolveIntelPriceRangeFromSteps,
} from "@/lib/intel-price-filter";
import {
  adjustIntelSqftByWheel,
  boardSqftMaxIndex,
  defaultSqftIndicesFromBoard,
  formatIntelSqftRangeLabelFromSteps,
  formatIntelSqftStep,
  INTEL_SQFT_MAX_INDEX,
  intelSqftFilterActiveOnBoard,
  intelSqftStepsForBoard,
  listingMatchesIntelSqftRange,
  maxSqftToStepIndex,
  minSqftToStepIndex,
  parseIntelSqftInput,
  resolveIntelSqftRangeFromSteps,
} from "@/lib/intel-sqft-filter";
import {
  formatVintageRangeLabel,
  listingMatchesVintageFilter,
  VINTAGE_FILTER_MAX,
  VINTAGE_INDEX_VALUES,
  vintageBucketFilterIndex,
  vintageFilterActive,
  vintageFilterIndexToBucketId,
  type VintageIndexFilter,
} from "@/lib/intelligence-vintage-filter";
import { readClientPref, writeClientPref } from "@/lib/client-prefs";

type TxFilter = "all" | "sale" | "rental";
type ClsFilter = "all" | "residential" | "commercial";
type SalePropertyFilter = "all" | "homes" | "multi" | "condos";
type BoardStatusFilter = DealBoardStatusFilter;
type FurnishedFilter = "all" | ListingFurnished;

const BOARD_STATUS_VALUES = ["all", "new", "reduced", "active"] as const satisfies readonly BoardStatusFilter[];

const TX_VALUES = ["all", "sale", "rental"] as const;
const CLS_VALUES = ["all", "residential", "commercial"] as const;
const MIN_BED_VALUES = ["0", "1", "2", "3", "4", "5", "6"] as const;
const MIN_BATH_VALUES = ["0", "1", "2", "3", "4", "5", "6"] as const;
const SALE_PROPERTY_VALUES = ["all", "homes", "multi", "condos"] as const;
const NEW_CONSTRUCTION_VALUES = ["all", "new"] as const;
const FURNISHED_FILTER_VALUES = ["all", ...LISTING_FURNISHED_VALUES] as const;
const FURNISHED_SLIDER_MAX = FURNISHED_FILTER_VALUES.length - 1;

function furnishedFilterIndex(value: FurnishedFilter): number {
  const index = FURNISHED_FILTER_VALUES.indexOf(value);
  return index >= 0 ? index : 0;
}

function furnishedFilterFromIndex(index: number): FurnishedFilter {
  return (
    FURNISHED_FILTER_VALUES[
      Math.max(0, Math.min(FURNISHED_SLIDER_MAX, Math.round(index)))
    ] ?? "all"
  );
}

function formatFurnishedFilterLabel(value: FurnishedFilter): string {
  return value === "all" ? "Any furnish" : value;
}
const STATS_EXPANDED_PREF = "tmre_intel_stats_expanded_towns";
const FILTERS_EXPANDED_VALUES = ["true", "false"] as const;
type FiltersExpandedPref = (typeof FILTERS_EXPANDED_VALUES)[number];
type MinBedFilter = (typeof MIN_BED_VALUES)[number];
type MinBathFilter = (typeof MIN_BATH_VALUES)[number];
type NewConstructionFilter = (typeof NEW_CONSTRUCTION_VALUES)[number];
const INTEL_CITIES = ["All", ...TMRE_TOWNS] as const;
type IntelCity = (typeof INTEL_CITIES)[number];

/** Market positioning copy — separate from offline mock data. */
const TOWN_TAGLINES = TOWN_MARKET_TAGLINES;

type IntelDescriptorPartKind = "town" | "tx" | "plain";

type IntelDescriptorPart = {
  kind: IntelDescriptorPartKind;
  label: string;
};

function intelFilterDescriptorParts({
  active,
  zip,
  tx,
  cls,
  saleProperty,
  newConstructionOnly,
  boardStatusFilter,
  furnishedFilter,
}: {
  active: IntelCity;
  zip: string | null;
  tx: TxFilter;
  cls: ClsFilter;
  saleProperty: SalePropertyFilter;
  newConstructionOnly: boolean;
  boardStatusFilter: BoardStatusFilter;
  furnishedFilter: FurnishedFilter;
}): IntelDescriptorPart[] {
  const parts: IntelDescriptorPart[] = [];

  parts.push({
    kind: "town",
    label: active === "All" ? "All towns" : active,
  });

  if (zip && active !== "All") {
    const area = zipAreaNickname(zip);
    parts.push({ kind: "plain", label: area ? `${zip} · ${area}` : zip });
  }

  if (tx === "sale") parts.push({ kind: "tx", label: "For Sale" });
  else if (tx === "rental") parts.push({ kind: "tx", label: "Rentals" });

  if (cls === "residential") parts.push({ kind: "plain", label: "Residential" });
  else if (cls === "commercial") parts.push({ kind: "plain", label: "Commercial" });

  if (tx !== "rental" && cls !== "commercial") {
    if (saleProperty === "homes") parts.push({ kind: "tx", label: "Homes" });
    else if (saleProperty === "multi") parts.push({ kind: "tx", label: "Multi-family" });
    else if (saleProperty === "condos") parts.push({ kind: "tx", label: "Condos" });
  }

  if (furnishedFilter !== "all") {
    parts.push({ kind: "plain", label: furnishedFilter });
  }

  if (newConstructionOnly) parts.push({ kind: "plain", label: "New construction" });

  if (boardStatusFilter === "new") parts.push({ kind: "plain", label: "New listings" });
  else if (boardStatusFilter === "reduced") {
    parts.push({ kind: "plain", label: "Price reduced" });
  } else if (boardStatusFilter === "active") {
    parts.push({ kind: "plain", label: "Active only" });
  }

  return parts;
}

function IntelDescriptorContext({
  parts,
  onTownClick,
  onTxClick,
}: {
  parts: IntelDescriptorPart[];
  onTownClick?: () => void;
  onTxClick?: () => void;
}) {
  return (
    <>
      {parts.map((part, index) => {
        const interactive =
          (part.kind === "town" && onTownClick != null) ||
          (part.kind === "tx" && onTxClick != null);
        const onClick =
          part.kind === "town"
            ? onTownClick
            : part.kind === "tx"
              ? onTxClick
              : undefined;
        return (
          <span key={`${part.kind}-${part.label}-${index}`} className="contents">
            {interactive && onClick ? (
              <button
                type="button"
                onClick={onClick}
                className="text-white/45 hover:text-gold underline underline-offset-2 decoration-white/25 hover:decoration-gold/50 transition-colors"
              >
                {part.label}
              </button>
            ) : (
              <span className="text-white/45">{part.label}</span>
            )}
            <span className="text-white/25" aria-hidden>
              ·
            </span>
          </span>
        );
      })}
    </>
  );
}

function computeMonthsSupply(
  listingCount: number,
  avgMonthlySales: number | null | undefined,
): number | null {
  if (!avgMonthlySales || avgMonthlySales <= 0) return null;
  return listingCount / avgMonthlySales;
}

/** Red (low) → green (high) gradient — see `lib/months-supply-color.ts`. */
function monthsSupplyMetricStyle(
  monthsSupply: number | null,
): { color: string } | undefined {
  return monthsSupplyColorStyle(monthsSupply);
}

function IntelMonthsSupplyInline({
  monthsSupply,
  monthlySalesLoaded,
  label = "Months supply",
}: {
  monthsSupply: number | null;
  monthlySalesLoaded: boolean;
  label?: string;
}) {
  return (
    <span
      className={monthsSupply == null ? "text-white/40" : undefined}
      style={monthsSupplyMetricStyle(monthsSupply)}
      aria-label={
        !monthlySalesLoaded
          ? "Months supply loading"
          : monthsSupply != null
            ? `${monthsSupply.toFixed(1)} ${label.toLowerCase()}`
            : "Months supply unavailable"
      }
    >
      {label}{" "}
      <span className="tabular-nums font-medium">
        {!monthlySalesLoaded
          ? "…"
          : monthsSupply != null
            ? monthsSupply.toFixed(1)
            : "—"}
      </span>
    </span>
  );
}

type RowStatus = "Active" | "Pending" | "New" | "Reduced";

type SortKey = "score" | "town" | "beds" | "baths" | "price" | "ppsf" | "sqft" | "dom" | "year" | "status";
type SortDir = "asc" | "desc";

const SORT_KEY_VALUES = [
  "score",
  "town",
  "beds",
  "baths",
  "price",
  "ppsf",
  "sqft",
  "dom",
  "year",
  "status",
] as const satisfies readonly SortKey[];
const SORT_DIR_VALUES = ["asc", "desc"] as const satisfies readonly SortDir[];

const STATUS_SORT_ORDER: Record<RowStatus, number> = {
  New: 0,
  Reduced: 1,
  Active: 2,
  Pending: 3,
};

const BOARD_LISTING_LIMIT = 100;
/** Primary photos for listings at or above this score rank load eagerly (0 = best). */
const PHOTO_PRIORITY_RANK_COUNT = 12;
const BED_BATH_MAX = 6;
const INTEL_SLIDER_WIDTH_CLASS = "w-[7.5rem]";
/** Keep slider descriptors enlarged this long after thumb release or descriptor click. */
const DESCRIPTOR_ENLARGE_HOLD_MS = 10_000;
type IntelSliderKind = "price" | "bed" | "bath" | "vintage" | "sqft" | "furnished";

type SetHeldSliderActive = (
  active: boolean,
  opts?: { immediate?: boolean },
) => void;

/** Enlarge on drag; after release, stay enlarged briefly before shrinking. */
function useHeldSliderActive(): [boolean, SetHeldSliderActive] {
  const [active, setActive] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = () => {
    if (timerRef.current != null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(() => () => clearTimer(), []);

  const setHeldActive: SetHeldSliderActive = (next, opts) => {
    clearTimer();
    if (next) {
      setActive(true);
      return;
    }
    if (opts?.immediate) {
      setActive(false);
      return;
    }
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setActive(false);
    }, DESCRIPTOR_ENLARGE_HOLD_MS);
  };

  return [active, setHeldActive];
}

function descriptorLabelClass(active: boolean, interactive: boolean): string {
  return `font-mono tabular-nums text-gold leading-none origin-left transition-all duration-300 ease-out shrink-0 ${
    active ? "text-lg font-medium scale-110" : "text-[9px] scale-100"
  }${
    interactive
      ? " cursor-pointer hover:text-gold-light underline-offset-2 hover:underline decoration-gold/30"
      : ""
  }`;
}

function formatBedBathRangeLabel(min: number, max: number, unit: "Bed" | "Bath"): string {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  if (lo <= 0 && hi >= BED_BATH_MAX) {
    return unit === "Bed" ? "Any Bed" : "Any Bath";
  }
  const suffix = (n: number) => (n === 1 ? unit : `${unit}s`);
  if (lo <= 0 && hi < BED_BATH_MAX) {
    return `Up to ${hi} ${suffix(hi)}`;
  }
  if (lo > 0 && hi >= BED_BATH_MAX) {
    return `${lo}+ ${suffix(lo)}`;
  }
  if (lo === hi) {
    return `${lo} ${suffix(lo)}`;
  }
  return `${lo}–${hi} ${unit === "Bed" ? "Beds" : "Baths"}`;
}

function bedBathFilterActive(min: number, max: number): boolean {
  return min > 0 || max < BED_BATH_MAX;
}

function listingMatchesBedBathCount(
  value: number | null | undefined,
  min: number,
  max: number,
): boolean {
  if (!bedBathFilterActive(min, max)) return true;
  if (value == null) return false;
  if (min > 0 && value < min) return false;
  if (max < BED_BATH_MAX && value > max) return false;
  return true;
}

function rankListingsByScore(listings: DisplayListing[]): DisplayListing[] {
  return [...listings].sort((a, b) => b.score - a.score);
}

function compareNullable(a: number | null, b: number | null, dir: SortDir): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return dir === "asc" ? a - b : b - a;
}

function sortListings(
  rows: DisplayListing[],
  sortKey: SortKey,
  sortDir: SortDir,
): DisplayListing[] {
  const sorted = [...rows];
  sorted.sort((a, b) => {
    let cmp = 0;
    switch (sortKey) {
      case "score":
        cmp = a.score - b.score;
        break;
      case "town": {
        const townName = (l: DisplayListing) =>
          (l.city ? normalizeTownName(l.city) : "") ?? "";
        cmp = townName(a).localeCompare(townName(b), undefined, { sensitivity: "base" });
        break;
      }
      case "beds":
        return compareNullable(a.beds ?? null, b.beds ?? null, sortDir);
      case "baths":
        return compareNullable(a.baths ?? null, b.baths ?? null, sortDir);
      case "price":
        cmp = a.price - b.price;
        break;
      case "ppsf":
        return compareNullable(a.pricePerSqft, b.pricePerSqft, sortDir);
      case "sqft":
        return compareNullable(a.sqft, b.sqft, sortDir);
      case "dom":
        return compareNullable(a.dom, b.dom, sortDir);
      case "year":
        return compareNullable(a.yearBuilt ?? null, b.yearBuilt ?? null, sortDir);
      case "status":
        cmp = STATUS_SORT_ORDER[a.status] - STATUS_SORT_ORDER[b.status];
        break;
    }
    return sortDir === "asc" ? cmp : -cmp;
  });
  return sorted;
}

type BoardScoreTiers = {
  top: DisplayListing[];
  middle: DisplayListing[];
  bottom: DisplayListing[];
  canTier: boolean;
};

/** Split listings into top 20%, middle 60%, and bottom 20% by Goldilocks score. */
function splitBoardByScoreTier(listings: DisplayListing[]): BoardScoreTiers {
  const n = listings.length;
  if (n === 0) return { top: [], middle: [], bottom: [], canTier: false };

  const byScore = [...listings].sort((a, b) => b.score - a.score);
  const topCount = Math.max(1, Math.round(n * 0.2));
  const bottomCount = Math.max(1, Math.round(n * 0.2));
  const topEnd = topCount;
  const bottomStart = n - bottomCount;

  if (bottomStart <= topEnd) {
    return { top: byScore, middle: [], bottom: [], canTier: false };
  }

  return {
    top: byScore.slice(0, topEnd),
    middle: byScore.slice(topEnd, bottomStart),
    bottom: byScore.slice(bottomStart),
    canTier: true,
  };
}

/** Always keep at least this many rows visible when the middle tier is collapsed. */
const BOARD_MIN_VISIBLE = 10;

type BoardMiddleCollapsePlan = {
  top: DisplayListing[];
  /** Middle rows that stay visible even when collapsed (to hit the min). */
  middlePinned: DisplayListing[];
  /** Middle rows the toggle may hide. */
  middleCollapsible: DisplayListing[];
  bottom: DisplayListing[];
  canCollapse: boolean;
  hideableCount: number;
};

/**
 * Middle tier may hide at most `total − BOARD_MIN_VISIBLE` listings so the
 * collapsed board never dips below 10 (or the full set when smaller).
 */
function planMiddleTierCollapse(tiers: BoardScoreTiers): BoardMiddleCollapsePlan {
  const { top, middle, bottom, canTier } = tiers;
  const total = top.length + middle.length + bottom.length;
  const maxHide = Math.max(0, total - BOARD_MIN_VISIBLE);
  const hideableCount = canTier ? Math.min(middle.length, maxHide) : 0;
  const pinCount = middle.length - hideableCount;
  return {
    top,
    middlePinned: middle.slice(0, pinCount),
    middleCollapsible: middle.slice(pinCount),
    bottom,
    canCollapse: hideableCount > 0,
    hideableCount,
  };
}

function buildScoreRankMap(listings: DisplayListing[]): Map<string, number> {
  const sorted = [...listings].sort((a, b) => b.score - a.score);
  const map = new Map<string, number>();
  sorted.forEach((l, i) => map.set(l.key, i));
  return map;
}

type DisplayListing = {
  key: string;
  listingKey?: string | null;
  score: number;
  scoreBreakdown?: ScoreBreakdown | null;
  address: string;
  city?: string | null;
  type: string;
  price: number;
  pricePerSqft: number | null;
  sqft: number | null;
  lotAcres?: number | null;
  dom: number | null;
  status: RowStatus;
  contractStatus?: string | null;
  isRental: boolean;
  isCommercial: boolean;
  propertyType?: string;
  furnished?: ListingFurnished | null;
  yearBuilt?: number | null;
  beds?: number | null;
  baths?: number | null;
  headline: string;
  zip: string | null;
  photoCount?: number | null;
  primaryPhotoIndex?: number | null;
};

type MetricTone = "up" | "down" | "flat";

/** Snapshot stat color: navy = normal, coral = tight/expensive, sage = cheap/plenty of supply. */
type SnapshotValueSignal = "normal" | "good" | "bad";

type SnapshotMetric = {
  label: string;
  value: string;
  trend: string;
  tone: MetricTone;
  valueSignal?: SnapshotValueSignal;
  action?: "new" | "reduced" | "closed";
  linkMedian?: boolean;
};

function snapshotValueColorClass(signal: SnapshotValueSignal | undefined): string {
  if (signal === "good") return "text-sage";
  if (signal === "bad") return "text-coral";
  return "text-navy";
}

function supplyValueSignal(monthsSupply: number | null): SnapshotValueSignal {
  if (monthsSupply == null) return "normal";
  if (monthsSupply <= 2) return "bad";
  if (monthsSupply > 4) return "good";
  return "normal";
}

function domValueSignal(medDom: number | null): SnapshotValueSignal {
  if (medDom == null) return "normal";
  if (medDom <= 10) return "bad";
  if (medDom >= 25) return "good";
  return "normal";
}

function priceValueSignal(
  value: number | null,
  benchmark: number | null,
): SnapshotValueSignal {
  if (value == null || benchmark == null || benchmark <= 0) return "normal";
  const ratio = value / benchmark;
  if (ratio >= 1.12) return "bad";
  if (ratio <= 0.88) return "good";
  return "normal";
}

type SnapshotBenchmarks = {
  medianPrice: number | null;
  avgPpsf: number | null;
  medianSqft: number | null;
};

function snapshotBenchmarks(rows: DisplayListing[]): SnapshotBenchmarks {
  const prices = rows.map((l) => l.price).filter((p): p is number => p > 0);
  const ppsfs = rows
    .filter((l) => !l.isRental)
    .map((l) => l.pricePerSqft)
    .filter((p): p is number => p != null && p > 0);
  const sqfts = rows
    .filter((l) => !l.isCommercial && l.sqft != null && l.sqft > 0)
    .map((l) => l.sqft as number);
  return {
    medianPrice: median(prices),
    avgPpsf: average(ppsfs),
    medianSqft: median(sqfts),
  };
}

function isNewThisWeek(l: DisplayListing): boolean {
  return l.dom != null && l.dom <= 7;
}

function closedThisWeekLabel(tx: TxFilter): string {
  return tx === "rental" ? "Leased(s) this week" : "Closed(s) this week";
}

function closedThisWeekForTown(
  town: string,
  zip: string | null | undefined,
  closedByTown: Record<string, number>,
  closedByTownZip: Record<string, Record<string, number>>,
): number {
  if (zip) return closedByTownZip[town]?.[zip] ?? 0;
  return closedByTown[town] ?? 0;
}

function salesByMonthKinds(tx: TxFilter): ("sale" | "rental")[] {
  if (tx === "rental") return ["rental"];
  if (tx === "sale") return ["sale"];
  return ["sale", "rental"];
}

type TownSnapshot = {
  town: string;
  zip?: string | null;
  metrics: SnapshotMetric[];
  stats: TownDescriptorStats;
};

function median(nums: number[]): number | null {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m];
}

function average(nums: number[]): number | null {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
}

function formatSnapshotPrice(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
}

function formatAvgBedrooms(avg: number | null): string {
  if (avg == null || !Number.isFinite(avg) || avg <= 0) return "—";
  const low = Math.floor(avg);
  const high = Math.ceil(avg);
  if (low === high || Math.abs(avg - low) < 0.05) {
    return low === 1 ? "1 bedroom" : `${low} bedrooms`;
  }
  return `${low}-${high} bedrooms`;
}

function filterCountLabel(count: number, unit: "Bed" | "Bath", exact = false): string {
  const suffix = count === 1 ? unit : `${unit}(s)`;
  return exact ? `${count} ${suffix}` : `${count}+ ${suffix}`;
}

function listingTown(l: DisplayListing): string | null {
  return l.city ? normalizeTownName(l.city) : null;
}

function listingPropertyType(l: DisplayListing): string {
  if (l.propertyType?.trim()) return l.propertyType;
  if (/condo/i.test(l.type)) return "Condo";
  if (/multi/i.test(l.type)) return "Multi-family";
  return "Single Family";
}

function filterBoardListings(
  rows: DisplayListing[],
  tx: TxFilter,
  cls: ClsFilter,
  zip: string | null,
  statusFilter: BoardStatusFilter = "all",
  saleProperty: SalePropertyFilter = "all",
  minBeds = 0,
  maxBeds = BED_BATH_MAX,
  minBaths = 0,
  maxBaths = BED_BATH_MAX,
  newConstructionOnly = false,
  furnishedFilter: FurnishedFilter = "all",
  exactBeds = false,
  minPrice = 0,
  maxPrice: number | null = null,
  minVintage = 0,
  maxVintage = VINTAGE_FILTER_MAX,
  minSqft = 0,
  maxSqft: number | null = null,
): DisplayListing[] {
  return rows.filter((l) => {
    if (tx === "sale" && l.isRental) return false;
    if (tx === "rental" && !l.isRental) return false;
    if (cls === "residential" && l.isCommercial) return false;
    if (cls === "commercial" && !l.isCommercial) return false;
    if (saleProperty !== "all" && !l.isRental && !l.isCommercial) {
      const propertyType = listingPropertyType(l);
      if (saleProperty === "homes" && !isHomePropertyType(propertyType)) return false;
      if (saleProperty === "multi" && !isMultiFamilyPropertyType(propertyType)) return false;
      if (saleProperty === "condos" && !isCondoPropertyType(propertyType)) return false;
    }
    if (
      furnishedFilter !== "all" &&
      l.isRental &&
      l.furnished !== furnishedFilter
    ) {
      return false;
    }
    if (exactBeds && minBeds > 0) {
      if (l.beds == null || l.beds !== minBeds) return false;
    } else if (!listingMatchesBedBathCount(l.beds, minBeds, maxBeds)) {
      return false;
    }
    if (!listingMatchesBedBathCount(l.baths, minBaths, maxBaths)) return false;
    if (!listingMatchesVintageFilter(l.yearBuilt, minVintage, maxVintage)) {
      return false;
    }
    if (
      (minSqft > 0 || maxSqft != null) &&
      !l.isCommercial &&
      !listingMatchesIntelSqftRange(l.sqft, minSqft, maxSqft)
    ) {
      return false;
    }
    if (
      (minPrice > 0 || maxPrice != null) &&
      !(tx === "all" && l.isRental) &&
      !listingMatchesIntelPriceRange(l.price, minPrice, maxPrice)
    ) {
      return false;
    }
    if (newConstructionOnly && !matchesNewConstruction(l.yearBuilt, l.propertyType)) return false;
    if (zip && l.zip !== zip) return false;
    if (statusFilter === "new" && !isNewThisWeek(l)) return false;
    if (statusFilter === "reduced" && l.status !== "Reduced") return false;
    if (statusFilter === "active" && l.status !== "Active") return false;
    return true;
  });
}

function formatSnapshotSqft(n: number | null): string {
  if (n == null) return "—";
  return Math.round(n).toLocaleString();
}

function buildTownSnapshot(
  townListings: DisplayListing[],
  town: string,
  monthlySales: Record<string, number>,
  zip?: string | null,
  benchmarks: SnapshotBenchmarks = { medianPrice: null, avgPpsf: null, medianSqft: null },
  closedThisWeekCount = 0,
  tx: TxFilter = "sale",
): TownSnapshot {
  const prices = townListings.map((l) => l.price).filter((p): p is number => p > 0);
  const doms = townListings.map((l) => l.dom).filter((d): d is number => d != null && d >= 0);
  const ppsfs = townListings
    .filter((l) => !l.isRental)
    .map((l) => l.pricePerSqft)
    .filter((p): p is number => p != null && p > 0);
  const sqfts = townListings
    .filter((l) => !l.isCommercial && l.sqft != null && l.sqft > 0)
    .map((l) => l.sqft as number);
  const bedCounts = townListings
    .filter((l) => !l.isCommercial && l.beds != null && l.beds > 0)
    .map((l) => l.beds as number);
  const newListings = townListings.filter(isNewThisWeek).length;
  const reduced = townListings.filter((l) => l.status === "Reduced").length;

  const medPrice = median(prices);
  const medDom = median(doms);
  const medSqft = median(sqfts);
  const avgPpsf = average(ppsfs);
  const avgBeds = average(bedCounts);

  const avgMonthlySales = monthlySales[town] ? monthlySales[town] : null;
  const monthsSupply = computeMonthsSupply(townListings.length, avgMonthlySales);
  const supplyTone: MetricTone = monthsSupply == null ? "flat"
    : monthsSupply <= 2 ? "down"
    : monthsSupply <= 4 ? "flat"
    : "up";
  const supplyTrend = monthsSupply == null ? "No sales data yet"
    : monthsSupply <= 2 ? "Seller's market"
    : monthsSupply <= 4 ? "Balanced market"
    : "Buyer's market";
  const supplySignal = supplyValueSignal(monthsSupply);
  const domSignal = domValueSignal(medDom);
  const priceSignal = priceValueSignal(medPrice, benchmarks.medianPrice);
  const ppsfSignal = priceValueSignal(avgPpsf, benchmarks.avgPpsf);

  const metrics: SnapshotMetric[] = [
    {
      label: "Listings",
      value: String(townListings.length),
      trend: `${newListings} new this week`,
      tone: newListings > 0 ? "up" : "flat",
      valueSignal: supplySignal,
      action: newListings > 0 ? "new" : undefined,
    },
    {
      label: "Reduced!",
      value: String(reduced),
      trend: reduced > 0 ? "Price cut active" : "No reductions",
      tone: reduced > 0 ? "down" : "flat",
      valueSignal: reduced > 0 ? "good" : "normal",
      action: reduced > 0 ? "reduced" : undefined,
    },
    {
      label: closedThisWeekLabel(tx),
      value: String(closedThisWeekCount),
      trend: closedThisWeekCount > 0 ? "Past 7 days" : "None this week",
      tone: closedThisWeekCount > 0 ? "up" : "flat",
      action: closedThisWeekCount > 0 ? "closed" : undefined,
    },
    {
      label: "Median price",
      value: formatSnapshotPrice(medPrice),
      trend: medPrice ? `${formatSnapshotPrice(medPrice)} median` : "—",
      tone: "flat",
      valueSignal: priceSignal,
      linkMedian: medPrice != null && townListings.length > 0,
    },
    {
      label: "Median sqft",
      value: formatSnapshotSqft(medSqft),
      trend:
        medSqft != null && benchmarks.medianSqft != null
          ? medSqft >= benchmarks.medianSqft
            ? "Above market median"
            : "Below market median"
          : medSqft != null
            ? `${formatSnapshotSqft(medSqft)} sqft`
            : "No sqft data",
      tone: "flat",
    },
    {
      label: "Median DOM",
      value: medDom != null ? `${Math.round(medDom)}d` : "—",
      trend: medDom != null && medDom <= 10 ? "Moving fast" : medDom != null && medDom <= 20 ? "Steady pace" : townListings.length ? "Slower market" : "—",
      tone: medDom != null && medDom <= 10 ? "up" : medDom != null && medDom <= 20 ? "flat" : "down",
      valueSignal: domSignal,
    },
    {
      label: "Avg bedrooms",
      value: formatAvgBedrooms(avgBeds),
      trend: avgBeds != null ? `${avgBeds.toFixed(1)} avg` : "No bed data",
      tone: "flat",
    },
    {
      label: "Months supply",
      value: monthsSupply != null ? monthsSupply.toFixed(1) : "—",
      trend: supplyTrend,
      tone: supplyTone,
      valueSignal: supplySignal,
    },
    {
      label: "Avg $/sqft",
      value: avgPpsf ? `$${Math.round(avgPpsf)}` : "—",
      trend: "Non-rental only",
      tone: "flat",
      valueSignal: ppsfSignal,
    },
  ];

  return {
    town,
    zip: zip ?? null,
    metrics,
    stats: {
      town,
      listingCount: townListings.length,
      medianPrice: medPrice,
      medianDom: medDom,
      monthsSupply,
      newThisWeek: newListings,
      reduced,
      closedThisWeek: closedThisWeekCount,
      medianSqft: medSqft,
    },
  };
}

function snapshotHeading(snapshot: TownSnapshot): string {
  return formatTownZipPlace(snapshot.town, snapshot.zip);
}

function snapshotPanelKey(snapshot: TownSnapshot): string {
  return `${snapshot.town}|${snapshot.zip ?? "all"}`;
}

function toVintageListingRows(listings: DisplayListing[]): VintageListingRow[] {
  return listings.map((listing) => ({
    price: listing.price,
    dom: listing.dom,
    pricePerSqft: listing.pricePerSqft,
    sqft: listing.sqft,
    beds: listing.beds ?? null,
    status: listing.status,
    isRental: listing.isRental,
    isCommercial: listing.isCommercial,
    yearBuilt: listing.yearBuilt,
    score: listing.score,
  }));
}

function readExpandedSnapshotKeys(): Set<string> {
  const raw = readClientPref(STATS_EXPANDED_PREF);
  if (!raw) return new Set();
  return new Set(
    raw
      .split(",")
      .map((key) => key.trim())
      .filter(Boolean),
  );
}

function writeExpandedSnapshotKeys(keys: Set<string>): void {
  writeClientPref(STATS_EXPANDED_PREF, [...keys].join(","));
}

function snapshotCardTitle(snapshot: TownSnapshot, tx: TxFilter): string {
  const place = snapshotHeading(snapshot);
  if (tx === "rental") return `${place} Rental`;
  if (tx === "sale") return `${place} Sales`;
  return place;
}

function snapshotSummaryParts(snapshot: TownSnapshot): {
  listings: string;
  medianPrice: string;
  monthsSupply: string;
  medianDom: string;
  monthsSupplyStyle: { color: string } | undefined;
} {
  const { stats } = snapshot;
  return {
    listings: String(stats.listingCount),
    medianPrice: formatSnapshotPrice(stats.medianPrice),
    monthsSupply:
      stats.monthsSupply != null ? `${stats.monthsSupply.toFixed(1)} mo` : "—",
    medianDom:
      stats.medianDom != null ? `${Math.round(stats.medianDom)}d DOM` : "— DOM",
    monthsSupplyStyle: monthsSupplyMetricStyle(stats.monthsSupply),
  };
}

type CitySnapshot = {
  city: TmreTown;
  tagline: string;
  metrics: { label: string; value: string; trend: string; tone: "up" | "down" | "flat" }[];
  listings: DisplayListing[];
};

const MOCK_FALLBACK: CitySnapshot[] = [
  {
    city: "Norwalk",
    tagline: "Premium-velocity market",
    metrics: [
      { label: "Median price", value: "$711K", trend: "+4.2% YoY", tone: "up" },
      { label: "Days on market", value: "12", trend: "−3 vs Q1", tone: "up" },
      { label: "Sale-to-list", value: "102.8%", trend: "Above ask", tone: "up" },
      { label: "Months supply", value: "1.7", trend: "Tight", tone: "down" },
      { label: "Active listings", value: "184", trend: "+12 WoW", tone: "up" },
      { label: "Closed (30d)", value: "97", trend: "Steady", tone: "flat" },
      { label: "Avg yield", value: "5.8%", trend: "+30 bps", tone: "up" },
    ],
    listings: [
      { key: "m1", score: 92, address: "27 Rowayton Woods Dr", type: "SFR", beds: 4, yearBuilt: 2024, price: 695000, pricePerSqft: 378, sqft: 1840, dom: 4, status: "New", isRental: false, isCommercial: false, headline: "Top-block Rowayton — rarely available", zip: "06853" },
      { key: "m2", score: 86, address: "14 Devil's Garden Rd", type: "SFR", beds: 5, price: 769000, pricePerSqft: 364, sqft: 2110, dom: 9, status: "Active", isRental: false, isCommercial: false, headline: "Contemporary design, recently updated", zip: "06851" },
      { key: "m3", score: 81, address: "62 Camp St", type: "Multi-2", beds: 3, price: 815000, pricePerSqft: 312, sqft: 2615, dom: 6, status: "Active", isRental: false, isCommercial: false, headline: "Multi-family with income-producing units", zip: "06854" },
      { key: "m4", score: 74, address: "118 Newtown Ave", type: "SFR", beds: 3, price: 599000, pricePerSqft: 401, sqft: 1495, dom: 18, status: "Reduced", isRental: false, isCommercial: false, headline: "Generous layout on established street", zip: "06851" },
      { key: "m5", score: 68, address: "9 Cedar Crest Pl", type: "Condo", beds: 2, price: 449000, pricePerSqft: 396, sqft: 1135, dom: 22, status: "Active", isRental: false, isCommercial: false, headline: "Low-maintenance living in prime location", zip: "06850" },
    ],
  },
  {
    city: "New Canaan",
    tagline: "Premier Fairfield County address",
    metrics: [
      { label: "Median price", value: "$1.65M", trend: "+5.1% YoY", tone: "up" },
      { label: "Days on market", value: "11", trend: "Moving fast", tone: "up" },
      { label: "Sale-to-list", value: "101.1%", trend: "Above ask", tone: "up" },
      { label: "Months supply", value: "2.2", trend: "Lean", tone: "down" },
      { label: "Active listings", value: "78", trend: "+6 WoW", tone: "up" },
      { label: "Closed (30d)", value: "38", trend: "Steady", tone: "flat" },
      { label: "Avg yield", value: "4.5%", trend: "+15 bps", tone: "up" },
    ],
    listings: [
      { key: "mnc1", score: 90, address: "14 Oenoke Ridge", type: "SFR", beds: 5, yearBuilt: 2025, price: 1795000, pricePerSqft: 512, sqft: 3506, dom: 4, status: "New", isRental: false, isCommercial: false, headline: "Trophy New Canaan location — rarely available", zip: "06840" },
      { key: "mnc2", score: 83, address: "72 Park St", type: "SFR", beds: 5, price: 1495000, pricePerSqft: 488, sqft: 3063, dom: 8, status: "Active", isRental: false, isCommercial: false, headline: "Grand scale with exceptional living space", zip: "06840" },
      { key: "mnc3", score: 76, address: "31 Jelliff Mill Rd", type: "SFR", beds: 4, price: 1195000, pricePerSqft: 452, sqft: 2644, dom: 14, status: "Active", isRental: false, isCommercial: false, headline: "Generously proportioned throughout", zip: "06840" },
      { key: "mnc4", score: 70, address: "8 Brushy Ridge Rd", type: "SFR", beds: 4, price: 985000, pricePerSqft: 415, sqft: 2374, dom: 22, status: "Reduced", isRental: false, isCommercial: false, headline: "Generous layout on established street", zip: "06840" },
    ],
  },
  {
    city: "Westport",
    tagline: "Trophy-tier inventory",
    metrics: [
      { label: "Median price", value: "$1.94M", trend: "+6.1% YoY", tone: "up" },
      { label: "Days on market", value: "8", trend: "−2 vs Q1", tone: "up" },
      { label: "Sale-to-list", value: "101.9%", trend: "Above ask", tone: "up" },
      { label: "Months supply", value: "2.1", trend: "Lean", tone: "down" },
      { label: "Active listings", value: "112", trend: "+5 WoW", tone: "up" },
      { label: "Closed (30d)", value: "54", trend: "+8 vs prior", tone: "up" },
      { label: "Avg yield", value: "4.1%", trend: "Cap-tier", tone: "flat" },
    ],
    listings: [
      { key: "m6", score: 90, address: "42 Cross Hwy", type: "SFR", price: 1690000, pricePerSqft: 532, sqft: 3178, dom: 5, status: "New", isRental: false, isCommercial: false, beds: 5, yearBuilt: 2024, headline: "Trophy Westport location — rarely available", zip: "06880" },
      { key: "m7", score: 84, address: "311 Hillspoint Rd", type: "SFR", price: 2150000, pricePerSqft: 504, sqft: 4270, dom: 7, status: "Active", isRental: false, isCommercial: false, beds: 6, headline: "Grand scale with exceptional living space", zip: "06880" },
      { key: "m8", score: 79, address: "8 Compo Beach Rd", type: "SFR", price: 2895000, pricePerSqft: 568, sqft: 5095, dom: 11, status: "Active", isRental: false, isCommercial: false, beds: 5, headline: "Premium beach proximity — rare lot", zip: "06880" },
      { key: "m9", score: 72, address: "47 Sylvan Rd S", type: "SFR", price: 1395000, pricePerSqft: 462, sqft: 3020, dom: 14, status: "Reduced", isRental: false, isCommercial: false, beds: 4, headline: "Updated interiors on quiet established street", zip: "06838" },
    ],
  },
  {
    city: "Wilton",
    tagline: "Upscale residential enclave",
    metrics: [
      { label: "Median price", value: "$1.12M", trend: "+4.8% YoY", tone: "up" },
      { label: "Days on market", value: "14", trend: "−1 vs Q1", tone: "up" },
      { label: "Sale-to-list", value: "100.6%", trend: "At ask", tone: "flat" },
      { label: "Months supply", value: "2.4", trend: "Moderate", tone: "flat" },
      { label: "Active listings", value: "68", trend: "+4 WoW", tone: "up" },
      { label: "Closed (30d)", value: "31", trend: "Steady", tone: "flat" },
      { label: "Avg yield", value: "4.4%", trend: "+10 bps", tone: "up" },
    ],
    listings: [
      { key: "mw1", score: 91, address: "34 Olmstead Hill Rd", type: "SFR", price: 1195000, pricePerSqft: 448, sqft: 2670, dom: 4, status: "New", isRental: false, isCommercial: false, beds: 4, headline: "Just hit the market — fresh listing", zip: "06897" },
      { key: "mw2", score: 85, address: "11 Belden Hill Rd", type: "SFR", price: 1490000, pricePerSqft: 412, sqft: 3618, dom: 8, status: "Active", isRental: false, isCommercial: false, beds: 5, headline: "Grand scale with exceptional living space", zip: "06897" },
      { key: "mw3", score: 78, address: "77 River Rd", type: "SFR", price: 895000, pricePerSqft: 385, sqft: 2325, dom: 13, status: "Active", isRental: false, isCommercial: false, beds: 3, headline: "Classic character with thoughtful updates", zip: "06897" },
      { key: "mw4", score: 72, address: "203 Ridgefield Rd", type: "SFR", price: 1025000, pricePerSqft: 402, sqft: 2550, dom: 21, status: "Reduced", isRental: false, isCommercial: false, beds: 4, headline: "Generous layout on established street", zip: "06897" },
    ],
  },
  {
    city: "Weston",
    tagline: "Quiet luxury enclave",
    metrics: [
      { label: "Median price", value: "$1.05M", trend: "+3.9% YoY", tone: "up" },
      { label: "Days on market", value: "16", trend: "Steady", tone: "flat" },
      { label: "Sale-to-list", value: "99.8%", trend: "At ask", tone: "flat" },
      { label: "Months supply", value: "2.8", trend: "Moderate", tone: "flat" },
      { label: "Active listings", value: "42", trend: "+2 WoW", tone: "up" },
      { label: "Closed (30d)", value: "19", trend: "Steady", tone: "flat" },
      { label: "Avg yield", value: "4.3%", trend: "Stable", tone: "flat" },
    ],
    listings: [
      { key: "mwt1", score: 88, address: "12 Goodhill Rd", type: "SFR", beds: 4, price: 1095000, pricePerSqft: 432, sqft: 2535, dom: 5, status: "New", isRental: false, isCommercial: false, headline: "Just hit the market — fresh listing", zip: "06883" },
      { key: "mwt2", score: 81, address: "45 Newtown Tpke", type: "SFR", beds: 5, price: 1350000, pricePerSqft: 418, sqft: 3230, dom: 9, status: "Active", isRental: false, isCommercial: false, headline: "Generously proportioned throughout", zip: "06883" },
      { key: "mwt3", score: 74, address: "89 Scribner Hill Rd", type: "SFR", beds: 3, price: 875000, pricePerSqft: 388, sqft: 2255, dom: 18, status: "Active", isRental: false, isCommercial: false, headline: "Classic character with thoughtful updates", zip: "06883" },
    ],
  },
  {
    city: "Fairfield",
    tagline: "Balanced Fairfield County market",
    metrics: [
      { label: "Median price", value: "$875K", trend: "+5.3% YoY", tone: "up" },
      { label: "Days on market", value: "10", trend: "−2 vs Q1", tone: "up" },
      { label: "Sale-to-list", value: "101.5%", trend: "Above ask", tone: "up" },
      { label: "Months supply", value: "1.9", trend: "Lean", tone: "down" },
      { label: "Active listings", value: "143", trend: "+9 WoW", tone: "up" },
      { label: "Closed (30d)", value: "71", trend: "Steady", tone: "flat" },
      { label: "Avg yield", value: "5.2%", trend: "+20 bps", tone: "up" },
    ],
    listings: [
      { key: "m10", score: 88, address: "42 Oldfield Rd", type: "SFR", beds: 4, yearBuilt: 2024, price: 875000, pricePerSqft: 412, sqft: 2124, dom: 3, status: "New", isRental: false, isCommercial: false, headline: "Just hit the market — fresh listing", zip: "06824" },
      { key: "m11", score: 82, address: "155 Black Rock Tpke", type: "SFR", beds: 3, price: 699000, pricePerSqft: 368, sqft: 1900, dom: 8, status: "Active", isRental: false, isCommercial: false, headline: "Contemporary design, recently updated", zip: "06825" },
      { key: "m12", score: 78, address: "89 Reef Rd", type: "SFR", beds: 5, price: 1195000, pricePerSqft: 448, sqft: 2668, dom: 11, status: "Active", isRental: false, isCommercial: false, headline: "Oversized layout, rare for the street", zip: "06824" },
      { key: "m13", score: 71, address: "18 Hillside Rd", type: "SFR", beds: 3, price: 795000, pricePerSqft: 395, sqft: 2013, dom: 19, status: "Reduced", isRental: false, isCommercial: false, headline: "Generous layout on established street", zip: "06824" },
      { key: "m14", score: 69, address: "244 Southport Beach Rd", type: "SFR", beds: 5, price: 1495000, pricePerSqft: 522, sqft: 2864, dom: 16, status: "Active", isRental: false, isCommercial: false, headline: "Premium beach proximity — rare lot", zip: "06890" },
    ],
  },
  {
    city: "Ridgefield",
    tagline: "Historic charm, upscale inventory",
    metrics: [
      { label: "Median price", value: "$1.08M", trend: "+4.5% YoY", tone: "up" },
      { label: "Days on market", value: "15", trend: "Steady", tone: "flat" },
      { label: "Sale-to-list", value: "100.2%", trend: "At ask", tone: "flat" },
      { label: "Months supply", value: "2.5", trend: "Moderate", tone: "flat" },
      { label: "Active listings", value: "58", trend: "+3 WoW", tone: "up" },
      { label: "Closed (30d)", value: "27", trend: "Steady", tone: "flat" },
      { label: "Avg yield", value: "4.2%", trend: "Stable", tone: "flat" },
    ],
    listings: [
      { key: "mrf1", score: 89, address: "12 Main St", type: "SFR", beds: 4, price: 1295000, pricePerSqft: 428, sqft: 3026, dom: 5, status: "New", isRental: false, isCommercial: false, headline: "Village center location — rarely available", zip: "06877" },
      { key: "mrf2", score: 83, address: "45 Farmingville Rd", type: "SFR", beds: 4, price: 1095000, pricePerSqft: 402, sqft: 2724, dom: 9, status: "Active", isRental: false, isCommercial: false, headline: "Generously proportioned throughout", zip: "06877" },
      { key: "mrf3", score: 76, address: "78 Branchville Rd", type: "SFR", beds: 3, price: 925000, pricePerSqft: 385, sqft: 2403, dom: 14, status: "Active", isRental: false, isCommercial: false, headline: "Classic character with thoughtful updates", zip: "06879" },
      { key: "mrf4", score: 71, address: "3 Stony Ln", type: "SFR", beds: 3, price: 875000, pricePerSqft: 368, sqft: 2378, dom: 20, status: "Reduced", isRental: false, isCommercial: false, headline: "Generous layout on established street", zip: "06877" },
    ],
  },
];

type ApiListing = {
  mlsId: string;
  listingKey?: string;
  status: string;
  propertyType: string;
  address: { street: string; full: string; city: string; postalCode?: string | null };
  price: number | null;
  originalListPrice: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  yearBuilt: number | null;
  lotAcres?: number | null;
  calculated: {
    pricePerSqft: number | null;
    daysOnMarket: number | null;
    priceReductionPercent: number | null;
    goldilocksScore: number | null;
    goldilocksBreakdown: ScoreBreakdown | null;
  };
  photoCount?: number | null;
};

type ApiResponse = {
  city: string;
  status: string;
  count: number;
  listings: ApiListing[];
};

function isRentalType(propertyType: string): boolean {
  return /rental|for lease/i.test(propertyType);
}

function isCommercialType(propertyType: string): boolean {
  return /commercial|industrial|business/i.test(propertyType);
}

function isCondoPropertyType(propertyType: string): boolean {
  return /condo|co-op/i.test(propertyType);
}

function isMultiFamilyPropertyType(propertyType: string): boolean {
  return /multi|duplex|triplex|fourplex|2-family|3-family|4-family/i.test(propertyType);
}

function isHomePropertyType(propertyType: string): boolean {
  if (isCommercialType(propertyType)) return false;
  if (isCondoPropertyType(propertyType)) return false;
  if (isMultiFamilyPropertyType(propertyType)) return false;
  return true;
}

function shortType(propertyType: string): string {
  const t = propertyType.replace(/ For Sale$/i, "").replace(/ For Lease$/i, " (Lease)");
  if (/single family/i.test(t)) return "SFR";
  if (/condo|co-op/i.test(t)) return "Condo";
  if (/multi/i.test(t)) return "Multi";
  if (/lots|land/i.test(t)) return "Land";
  if (/rental/i.test(t)) return "Rental";
  return t;
}

function deriveStatus(l: ApiListing): RowStatus {
  const status = l.status.toLowerCase();
  if (status === "pending") return "Pending";
  if (status === "coming soon" || status === "cs") return "New";
  const reduced = (l.calculated.priceReductionPercent ?? 0) > 1;
  const isNew = (l.calculated.daysOnMarket ?? 99) <= 7;
  if (reduced) return "Reduced";
  if (isNew) return "New";
  return "Active";
}

function formatSqliteRefreshTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;

  const now = new Date();
  const time = d.toLocaleString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

  if (d.toDateString() === now.toDateString()) {
    return `today at ${time}`;
  }

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) {
    return `yesterday at ${time}`;
  }

  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function mapListings(api: ApiListing[], townName?: TmreTown): DisplayListing[] {
  const mapped = api
    .filter((l) => l.price != null && l.price > 0)
    .map((l) => {
      const rental = isRentalType(l.propertyType);
      const commercial = isCommercialType(l.propertyType);
      const status = deriveStatus(l);
      return {
        key: l.listingKey || l.mlsId,
        listingKey: l.listingKey ?? null,
        score: l.calculated.goldilocksScore ?? 0,
        scoreBreakdown: l.calculated.goldilocksBreakdown ?? null,
        address: l.address.street || l.address.full,
        city: townName ?? (l.address.city?.trim() || null),
        type: shortType(l.propertyType),
        price: l.price!,
        pricePerSqft: rental ? null : l.calculated.pricePerSqft,
        sqft: l.sqft,
        lotAcres: l.lotAcres ?? null,
        dom: l.calculated.daysOnMarket,
        status,
        contractStatus: underContractStatusLabel(l.status),
        isRental: rental,
        isCommercial: commercial,
        propertyType: l.propertyType,
        yearBuilt: l.yearBuilt,
        beds: l.beds,
        baths: l.baths,
        headline: "",
        zip: l.address.postalCode ?? null,
        photoCount: l.photoCount ?? null,
      };
    })
    .sort((a, b) => b.score - a.score);

  if (!townName) return mapped;
  return mapped.filter((l) => listingZipMatchesTown(l.zip, townName));
}

function applyDealBoardSalesMeta(
  board: {
    monthlySales: Record<string, number>;
    closedThisWeekByTown: Record<string, number>;
    closedThisWeekByTownZip: Record<string, Record<string, number>>;
  },
  setters: {
    setMonthlySales: (v: Record<string, number>) => void;
    setClosedThisWeekByTown: (v: Record<string, number>) => void;
    setClosedThisWeekByTownZip: (v: Record<string, Record<string, number>>) => void;
  },
) {
  setters.setMonthlySales(board.monthlySales);
  setters.setClosedThisWeekByTown(board.closedThisWeekByTown);
  setters.setClosedThisWeekByTownZip(board.closedThisWeekByTownZip);
}

type MonthsSupplyCacheEntry = {
  city: string;
  kind: "sale" | "rental";
  propertyClass: "all" | "homes" | "multi" | "condos";
  avgMonthlyClosings: number | null;
};

function monthsSupplyKind(tx: TxFilter): "sale" | "rental" {
  return tx === "rental" ? "rental" : "sale";
}

function monthsSupplyPropertyClass(
  tx: TxFilter,
  saleProperty: SalePropertyFilter,
): "all" | "homes" | "multi" | "condos" {
  // Rentals reset subtype in the UI; use the All-types rental cache slice.
  if (tx === "rental") return "all";
  return saleProperty;
}

/** Prefer precomputed months-supply avgs (town × occupancy × property class). */
function avgsFromMonthsSupplyEntries(
  entries: MonthsSupplyCacheEntry[],
  kind: "sale" | "rental",
  propertyClass: "all" | "homes" | "multi" | "condos",
): Record<string, number> | null {
  const out: Record<string, number> = {};
  for (const entry of entries) {
    if (entry.kind !== kind || entry.propertyClass !== propertyClass) continue;
    if (entry.avgMonthlyClosings != null && entry.avgMonthlyClosings > 0) {
      out[entry.city] = entry.avgMonthlyClosings;
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}

async function fetchMonthsSupplyIndexEntries(): Promise<MonthsSupplyCacheEntry[] | null> {
  try {
    const res = await fetch("/api/months-supply?index=1", { cache: "no-store" });
    if (!res.ok) return null;
    const body = (await res.json()) as { entries?: MonthsSupplyCacheEntry[] };
    return Array.isArray(body.entries) ? body.entries : null;
  } catch {
    return null;
  }
}

async function fetchCity(city: TmreTown): Promise<DisplayListing[]> {
  const res = await fetch(`/api/listings?city=${city}&status=Active&limit=2000`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = (await res.json()) as ApiResponse;
  return mapListings(body.listings, city);
}

type DealBoardApiTownMeta = {
  avgMonthlySalesSale?: number;
  avgMonthlySalesRental?: number;
  closedThisWeekSale?: number;
  closedThisWeekRental?: number;
  closedThisWeekByZipSale?: Record<string, number>;
  closedThisWeekByZipRental?: Record<string, number>;
};

type DealBoardApiListing = {
  key: string;
  listingKey?: string | null;
  score: number;
  scoreBreakdown?: ScoreBreakdown | null;
  address: string;
  city?: string | null;
  type: string;
  propertyType?: string;
  price: number;
  pricePerSqft: number | null;
  sqft: number | null;
  lotAcres?: number | null;
  dom: number | null;
  status: RowStatus;
  contractStatus?: string | null;
  isRental: boolean;
  isCommercial: boolean;
  yearBuilt?: number | null;
  beds?: number | null;
  baths?: number | null;
  furnished?: ListingFurnished | null;
  zip: string | null;
  headline?: string;
  photoCount?: number | null;
  primaryPhotoIndex?: number | null;
};

type DealBoardApiResponse = {
  towns: Partial<Record<TmreTown, DealBoardApiListing[]>>;
  meta?: Partial<Record<TmreTown, DealBoardApiTownMeta>>;
};

function mapBoardCacheListing(row: DealBoardApiListing, town: TmreTown): DisplayListing {
  return {
    key: row.key,
    listingKey: row.listingKey ?? null,
    score: row.score ?? 0,
    scoreBreakdown: row.scoreBreakdown ?? null,
    address: row.address,
    city: town,
    type: row.type,
    propertyType: row.propertyType,
    price: row.price,
    pricePerSqft: row.pricePerSqft,
    sqft: row.sqft,
    lotAcres: row.lotAcres ?? null,
    dom: row.dom,
    status: row.status,
    contractStatus: row.contractStatus ?? null,
    isRental: row.isRental,
    isCommercial: row.isCommercial,
    yearBuilt: row.yearBuilt ?? null,
    beds: row.beds ?? null,
    baths: row.baths ?? null,
    furnished: row.furnished ?? null,
    headline: row.headline ?? "",
    zip: row.zip,
    photoCount: row.photoCount ?? null,
    primaryPhotoIndex: row.primaryPhotoIndex ?? null,
  };
}

async function fetchIntelligenceDealBoard(
  transaction: TxFilter = "sale",
): Promise<{
  byCity: Record<TmreTown, DisplayListing[]>;
  monthlySales: Record<string, number>;
  closedThisWeekByTown: Record<string, number>;
  closedThisWeekByTownZip: Record<string, Record<string, number>>;
} | null> {
  const res = await fetch("/api/intelligence/deal-board", { cache: "no-store" });
  if (!res.ok) return null;
  const body = (await res.json()) as DealBoardApiResponse;
  if (!body?.towns) return null;

  const byCity = Object.fromEntries(
    TMRE_TOWNS.map((town) => [
      town,
      (body.towns[town] ?? []).map((row) => mapBoardCacheListing(row, town)),
    ]),
  ) as Record<TmreTown, DisplayListing[]>;

  const rental = transaction === "rental";
  const monthlySales: Record<string, number> = {};
  const closedThisWeekByTown: Record<string, number> = {};
  const closedThisWeekByTownZip: Record<string, Record<string, number>> = {};
  for (const town of TMRE_TOWNS) {
    const meta = body.meta?.[town];
    monthlySales[town] = rental
      ? (meta?.avgMonthlySalesRental ?? 0)
      : (meta?.avgMonthlySalesSale ?? 0);
    closedThisWeekByTown[town] = rental
      ? (meta?.closedThisWeekRental ?? 0)
      : (meta?.closedThisWeekSale ?? 0);
    closedThisWeekByTownZip[town] = rental
      ? (meta?.closedThisWeekByZipRental ?? {})
      : (meta?.closedThisWeekByZipSale ?? {});
  }

  return { byCity, monthlySales, closedThisWeekByTown, closedThisWeekByTownZip };
}

type LoadState = "loading" | "ready" | "fallback";

export default function IntelligenceClient() {
  const searchParams = useSearchParams();
  const urlSearch = useMemo(
    () => parseIntelligenceSearchParams(searchParams),
    [searchParams],
  );
  const urlSearchAppliedRef = useRef(false);

  const [active, setActive] = usePersistedFilter<IntelCity>(
    "tmre_intel_city",
    "All",
    INTEL_CITIES,
  );
  const [byCity, setByCity] = useState<Record<TmreTown, DisplayListing[] | null>>(
    Object.fromEntries(TMRE_TOWNS.map((town) => [town, null])) as Record<TmreTown, DisplayListing[] | null>,
  );
  const [state, setState] = useState<LoadState>("loading");
  const [tx, setTx] = usePersistedFilter<TxFilter>("tmre_tx", "sale", TX_VALUES);
  const [cls, setCls] = usePersistedFilter<ClsFilter>("tmre_cls", "residential", CLS_VALUES);
  const [saleProperty, setSaleProperty] = usePersistedFilter<SalePropertyFilter>(
    "tmre_sale_property",
    "all",
    SALE_PROPERTY_VALUES,
  );
  const [minBedsFilter, setMinBedsFilter] = usePersistedFilter<MinBedFilter>(
    "tmre_intel_min_beds",
    "0",
    MIN_BED_VALUES,
  );
  const [minBathsFilter, setMinBathsFilter] = usePersistedFilter<MinBathFilter>(
    "tmre_intel_min_baths",
    "0",
    MIN_BATH_VALUES,
  );
  const [maxBedsFilter, setMaxBedsFilter] = usePersistedFilter<MinBedFilter>(
    "tmre_intel_max_beds",
    "6",
    MIN_BED_VALUES,
  );
  const [maxBathsFilter, setMaxBathsFilter] = usePersistedFilter<MinBathFilter>(
    "tmre_intel_max_baths",
    "6",
    MIN_BATH_VALUES,
  );
  const [minVintageFilter, setMinVintageFilter] = usePersistedFilter<VintageIndexFilter>(
    "tmre_intel_min_vintage",
    "0",
    VINTAGE_INDEX_VALUES,
  );
  const [maxVintageFilter, setMaxVintageFilter] = usePersistedFilter<VintageIndexFilter>(
    "tmre_intel_max_vintage",
    "6",
    VINTAGE_INDEX_VALUES,
  );
  const minBedrooms = Number(minBedsFilter);
  const maxBedrooms = Number(maxBedsFilter);
  const minBathrooms = Number(minBathsFilter);
  const maxBathrooms = Number(maxBathsFilter);
  const minVintage = Number(minVintageFilter);
  const maxVintage = Number(maxVintageFilter);
  const showPriceFilter = cls !== "commercial";
  const [minPriceIndex, setMinPriceIndex] = useState(0);
  const [maxPriceIndex, setMaxPriceIndex] = useState(INTEL_PRICE_MAX_INDEX);
  const [priceSliderActive, setPriceSliderActive] = useHeldSliderActive();
  const [bedSliderActive, setBedSliderActive] = useHeldSliderActive();
  const [bathSliderActive, setBathSliderActive] = useHeldSliderActive();
  const [vintageSliderActive, setVintageSliderActive] = useHeldSliderActive();
  const [minSqftIndex, setMinSqftIndex] = useState(0);
  const [maxSqftIndex, setMaxSqftIndex] = useState(INTEL_SQFT_MAX_INDEX);
  const [sqftSliderActive, setSqftSliderActive] = useHeldSliderActive();
  const [furnishedSliderActive, setFurnishedSliderActive] = useHeldSliderActive();
  const sqftRangeCustomizedRef = useRef(false);
  const [collapsedSlidersOpen, setCollapsedSlidersOpen] = useState(false);
  const priceRangeCustomizedRef = useRef(false);
  const priceFilterContextRef = useRef("");
  const [newConstructionFilter, setNewConstructionFilter] =
    usePersistedFilter<NewConstructionFilter>(
      "tmre_intel_new_construction",
      "all",
      NEW_CONSTRUCTION_VALUES,
    );
  const newConstructionOnly = newConstructionFilter === "new";
  const [furnishedFilter, setFurnishedFilter] = usePersistedFilter<FurnishedFilter>(
    "tmre_intel_furnished",
    "all",
    FURNISHED_FILTER_VALUES,
  );
  const [zip, setZip] = usePersistedNullableFilter("tmre_intel_zip");
  const [boardStatusFilter, setBoardStatusFilter] = usePersistedFilter<BoardStatusFilter>(
    "tmre_intel_board_status",
    "all",
    BOARD_STATUS_VALUES,
  );
  const [filtersExpandedPref, setFiltersExpandedPref] = usePersistedFilter<FiltersExpandedPref>(
    "tmre_intel_filters_expanded",
    "true",
    FILTERS_EXPANDED_VALUES,
  );
  const filtersExpanded = filtersExpandedPref === "true";
  /**
   * Collapse town/tx pills + sliders/price boxes. Class pills (All/Residential/
   * Commercial) and the filter descriptor line always stay visible.
   */
  const [filterChromeCollapsed, setFilterChromeCollapsed] = useState(false);
  /** While collapsed, optionally peek one pill group via descriptor clicks. */
  const [filterChromePeek, setFilterChromePeek] = useState<"towns" | "tx" | null>(
    null,
  );
  /** Phone: slide-overs for town Stats / vintages (desktop keeps the sidebar). */
  const [townStatsOpen, setTownStatsOpen] = useState(false);
  const [vintageStatsOpen, setVintageStatsOpen] = useState(false);
  const [townLinksExpanded, setTownLinksExpanded] = useState(false);
  const [zipLinksExpanded, setZipLinksExpanded] = useState(false);
  const setFiltersExpanded = (expanded: boolean) =>
    setFiltersExpandedPref(expanded ? "true" : "false");
  const [hoveredZip, setHoveredZip] = useState<string | null>(null);
  const [hoveredZipEl, setHoveredZipEl] = useState<HTMLElement | null>(null);
  const [hoveredTown, setHoveredTown] = useState<TmreTown | "All" | null>(null);
  const [hoveredTownEl, setHoveredTownEl] = useState<HTMLElement | null>(null);
  const townHoverClearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const TOWN_MAP_FLASH_MS = 1_000;
  const [flashedTown, setFlashedTown] = useState<TmreTown | null>(null);
  const townFilterAnchorRef = useRef<HTMLDivElement>(null);
  const townMapFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTownMapFlashTimer = () => {
    if (townMapFlashTimerRef.current) {
      clearTimeout(townMapFlashTimerRef.current);
      townMapFlashTimerRef.current = null;
    }
  };

  const flashTownMapOnSelect = (city: TmreTown | "All") => {
    clearTownMapFlashTimer();
    if (city === "All") {
      setFlashedTown(null);
      return;
    }
    prefetchTownBoundaries(city);
    setFlashedTown(city);
    townMapFlashTimerRef.current = setTimeout(() => {
      setFlashedTown(null);
      townMapFlashTimerRef.current = null;
    }, TOWN_MAP_FLASH_MS);
  };
  const [scoreInfoOpen, setScoreInfoOpen] = useState(false);
  const [scoreBreakdownListing, setScoreBreakdownListing] = useState<DisplayListing | null>(null);
  const [historyModalListing, setHistoryModalListing] = useState<DisplayListing | null>(null);
  const [sortKey, setSortKey] = usePersistedFilter<SortKey>(
    "tmre_intel_sort_key",
    "score",
    SORT_KEY_VALUES,
  );
  const [sortDir, setSortDir] = usePersistedFilter<SortDir>(
    "tmre_intel_sort_dir",
    "desc",
    SORT_DIR_VALUES,
  );
  const [boardView, setBoardView] = usePersistedFilter<DealBoardView>(
    DEAL_BOARD_VIEW_PREF_KEY,
    DEAL_BOARD_VIEW_DEFAULT,
    DEAL_BOARD_VIEW_VALUES,
    false,
    dealBoardViewDefaultForViewport,
  );

  // Persist unique filter combinations into the visitor search-history cookie
  // so /latest can offer them as alert criteria.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      recordVisitorSearch({
        source: "intelligence",
        town: active === "All" ? null : active,
        tx,
        propertyClass: cls,
        saleProperty: saleProperty === "all" ? null : saleProperty,
        minBeds: minBedsFilter === "0" ? null : Number(minBedsFilter),
        maxBeds:
          maxBedsFilter === "0" || maxBedsFilter === "6"
            ? null
            : Number(maxBedsFilter),
        minBaths: minBathsFilter === "0" ? null : Number(minBathsFilter),
        maxBaths:
          maxBathsFilter === "0" || maxBathsFilter === "6"
            ? null
            : Number(maxBathsFilter),
        zip,
        newConstruction: newConstructionOnly ? true : null,
        boardStatus: boardStatusFilter === "all" ? null : boardStatusFilter,
      });
    }, 800);
    return () => window.clearTimeout(timer);
  }, [
    active,
    tx,
    cls,
    saleProperty,
    minBedsFilter,
    maxBedsFilter,
    minBathsFilter,
    maxBathsFilter,
    zip,
    newConstructionOnly,
    boardStatusFilter,
  ]);

  const [middleTierExpanded, setMiddleTierExpanded] = useState(false);
  const [boardPage, setBoardPage] = useState(1);
  const [expandedSnapshotKeys, setExpandedSnapshotKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const [expandedSnapshotsHydrated, setExpandedSnapshotsHydrated] = useState(false);
  const boardRef = useRef<HTMLDivElement>(null);
  const [heroIntroDismissed, setHeroIntroDismissed] = useState(false);
  const [sqliteRefresh, setSqliteRefresh] = useState<{
    refreshing: boolean;
    lastFinishedAt: string | null;
  }>({ refreshing: false, lastFinishedAt: null });
  const sqliteWasRefreshingRef = useRef(false);
  const listingsSoftReloadRef = useRef(false);
  const listingsSoftReloadTimerRef = useRef<number | null>(null);
  // Monthly sales counts per city for months-of-supply calculation
  const [monthlySales, setMonthlySales] = useState<Record<string, number>>({});
  const [closedThisWeekByTown, setClosedThisWeekByTown] = useState<Record<string, number>>({});
  const [closedThisWeekByTownZip, setClosedThisWeekByTownZip] = useState<
    Record<string, Record<string, number>>
  >({});
  const [monthlySalesLoaded, setMonthlySalesLoaded] = useState(false);
  /** Precomputed months-supply index (town × sale|rental × property class). */
  const [monthsSupplyEntries, setMonthsSupplyEntries] = useState<
    MonthsSupplyCacheEntry[] | null
  >(null);

  const orderedCities = usePersonalizedTowns(TMRE_TOWNS);

  useEffect(() => {
    setExpandedSnapshotKeys(readExpandedSnapshotKeys());
    setExpandedSnapshotsHydrated(true);
  }, []);

  // Warm Census ZCTA rings for every TMRE zip so town/zip map popovers paint immediately.
  useEffect(() => {
    prefetchAllTownBoundaries();
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setHeroIntroDismissed(true), 30_000);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    return () => {
      clearTownMapFlashTimer();
      if (townHoverClearTimer.current) clearTimeout(townHoverClearTimer.current);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const pollRefreshStatus = async () => {
      try {
        const res = await fetch("/api/intelligence/refresh-status", {
          cache: "no-store",
        });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as {
          refreshing: boolean;
          lastFinishedAt: string | null;
        };
        setSqliteRefresh(data);
        if (sqliteWasRefreshingRef.current && !data.refreshing) {
          if (listingsSoftReloadTimerRef.current != null) {
            window.clearTimeout(listingsSoftReloadTimerRef.current);
          }
          listingsSoftReloadTimerRef.current = window.setTimeout(() => {
            listingsSoftReloadTimerRef.current = null;
            if (listingsSoftReloadRef.current) return;
            listingsSoftReloadRef.current = true;
            void (async () => {
              try {
                const [board, msEntries] = await Promise.all([
                  fetchIntelligenceDealBoard(tx),
                  fetchMonthsSupplyIndexEntries(),
                ]);
                if (msEntries?.length) setMonthsSupplyEntries(msEntries);
                if (board) {
                  // Guard: don't replace a good byCity with a degraded one.
                  // If the new board has fewer total listings than what's already
                  // displayed, the cold Lambda that rebuilt it likely had a partial
                  // or failed restore — keep the current data instead.
                  const newTotal = Object.values(board.byCity).reduce(
                    (sum, listings) => sum + (listings?.length ?? 0),
                    0,
                  );
                  setByCity((prev) => {
                    const currentTotal = Object.values(prev).reduce(
                      (sum, listings) => sum + (listings?.length ?? 0),
                      0,
                    );
                    if (newTotal < currentTotal && currentTotal > 0) {
                      console.warn(
                        `[intelligence] soft reload returned ${newTotal} listings vs current ${currentTotal} — ignoring downgrade`,
                      );
                      return prev;
                    }
                    return board.byCity;
                  });
                  bumpIntelligenceSnapshotGeneration();
                  const fromCache =
                    msEntries &&
                    avgsFromMonthsSupplyEntries(
                      msEntries,
                      monthsSupplyKind(tx),
                      monthsSupplyPropertyClass(tx, saleProperty),
                    );
                  applyDealBoardSalesMeta(
                    {
                      ...board,
                      monthlySales: fromCache ?? board.monthlySales,
                    },
                    {
                      setMonthlySales,
                      setClosedThisWeekByTown,
                      setClosedThisWeekByTownZip,
                    },
                  );
                  setMonthlySalesLoaded(true);
                  return;
                }
                await Promise.all(
                  TMRE_TOWNS.map(async (city) => {
                    try {
                      const listings = await fetchCity(city);
                      setByCity((prev) => ({ ...prev, [city]: listings }));
                    } catch (err) {
                      console.warn(`[intelligence] ${city} soft reload failed`, err);
                    }
                  }),
                );
                bumpIntelligenceSnapshotGeneration();
              } finally {
                listingsSoftReloadRef.current = false;
              }
            })();
          }, 1_500);
        }
        sqliteWasRefreshingRef.current = data.refreshing;
      } catch {
        /* ignore polling errors */
      }
    };

    pollRefreshStatus();
    const id = window.setInterval(pollRefreshStatus, sqliteRefresh.refreshing ? 5_000 : 3_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      if (listingsSoftReloadTimerRef.current != null) {
        window.clearTimeout(listingsSoftReloadTimerRef.current);
      }
    };
  }, [sqliteRefresh.refreshing, tx]);

  useEffect(() => {
    if (!expandedSnapshotsHydrated) return;
    writeExpandedSnapshotKeys(expandedSnapshotKeys);
  }, [expandedSnapshotKeys, expandedSnapshotsHydrated]);

  const toggleSnapshotExpanded = (key: string) => {
    setExpandedSnapshotKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  useEffect(() => {
    if (!urlSearch || urlSearchAppliedRef.current) return;
    urlSearchAppliedRef.current = true;

    setActive(urlSearch.city);
    setZip(urlSearch.zip);
    if (urlSearch.beds) {
      setMinBedsFilter(urlSearch.beds as MinBedFilter);
      if (urlSearch.exactBeds) {
        setMaxBedsFilter(urlSearch.beds as MinBedFilter);
      }
    }
    if (urlSearch.baths) setMinBathsFilter(urlSearch.baths as MinBathFilter);
    if (urlSearch.tx) setTx(urlSearch.tx as TxFilter);
    if (urlSearch.cls) setCls(urlSearch.cls as ClsFilter);
    if (urlSearch.property) {
      setSaleProperty(urlSearch.property as SalePropertyFilter);
    } else if (urlSearch.tx === "rental" || urlSearch.cls === "commercial") {
      setSaleProperty("all");
    }
    setNewConstructionFilter(urlSearch.newConstruction ? "new" : "all");

    window.history.replaceState(null, "", "/intelligence");
  }, [
    urlSearch,
    setActive,
    setZip,
    setMinBedsFilter,
    setMaxBedsFilter,
    setMinBathsFilter,
    setTx,
    setCls,
    setSaleProperty,
    setNewConstructionFilter,
  ]);

  // Prefer cached months-supply avgs when property class / occupancy changes.
  useEffect(() => {
    if (!monthsSupplyEntries?.length) return;
    const fromCache = avgsFromMonthsSupplyEntries(
      monthsSupplyEntries,
      monthsSupplyKind(tx),
      monthsSupplyPropertyClass(tx, saleProperty),
    );
    if (fromCache) {
      setMonthlySales(fromCache);
      setMonthlySalesLoaded(true);
    }
  }, [monthsSupplyEntries, tx, saleProperty]);

  // Board listings + sales metadata come from one SQLite-backed cache when warm.
  useEffect(() => {
    let cancelled = false;
    setState("loading");
    setMonthlySalesLoaded(false);

    void (async () => {
      const [board, msEntries] = await Promise.all([
        fetchIntelligenceDealBoard(tx).catch(() => null),
        fetchMonthsSupplyIndexEntries(),
      ]);
      if (cancelled) return;

      if (msEntries?.length) setMonthsSupplyEntries(msEntries);

      if (board) {
        bumpIntelligenceSnapshotGeneration();
        setByCity(board.byCity);
        const fromCache =
          msEntries &&
          avgsFromMonthsSupplyEntries(
            msEntries,
            monthsSupplyKind(tx),
            monthsSupplyPropertyClass(tx, saleProperty),
          );
        applyDealBoardSalesMeta(
          {
            ...board,
            monthlySales: fromCache ?? board.monthlySales,
          },
          {
            setMonthlySales,
            setClosedThisWeekByTown,
            setClosedThisWeekByTownZip,
          },
        );
        setMonthlySalesLoaded(true);
        setState("ready");
        return;
      }

      // Cold fallback: parallel town listing fetches + sales-by-month.
      const kinds = salesByMonthKinds(tx);
      const [listingResults, salesResults] = await Promise.all([
        Promise.allSettled(TMRE_TOWNS.map((city) => fetchCity(city))),
        Promise.all(
          TMRE_TOWNS.flatMap((city) =>
            kinds.map((kind) =>
              fetch(
                `/api/sales-by-month?city=${encodeURIComponent(city)}&kind=${kind}`,
                { cache: "no-store" },
              )
                .then((r) => (r.ok ? r.json() : null))
                .catch(() => null)
                .then((d) => ({ city, d })),
            ),
          ),
        ),
      ]);
      if (cancelled) return;

      let anyLive = false;
      const next = Object.fromEntries(
        TMRE_TOWNS.map((town, i) => {
          const result = listingResults[i];
          if (result.status === "fulfilled") {
            anyLive = true;
            return [town, result.value];
          }
          console.warn(`[intelligence] ${town} fetch failed`, result.reason);
          const mock = MOCK_FALLBACK.find((d) => d.city === town);
          return [town, mock?.listings ?? []];
        }),
      ) as Record<TmreTown, DisplayListing[]>;

      const now = new Date();
      const sales: Record<string, number> = {};
      const closed: Record<string, number> = {};
      const closedByZip: Record<string, Record<string, number>> = {};
      for (const city of TMRE_TOWNS) {
        sales[city] = 0;
        closed[city] = 0;
        closedByZip[city] = {};
      }
      for (const { city, d } of salesResults) {
        if (!d?.data) continue;
        const recentMonths: number[] = [];
        for (let offset = 1; offset <= 3; offset++) {
          const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
          const yr = date.getFullYear();
          const mo = date.getMonth() + 1;
          const entry = d.data.find(
            (e: { year: number; month: number; count: number }) =>
              e.year === yr && e.month === mo,
          );
          if (entry) recentMonths.push(entry.count);
        }
        if (recentMonths.length) {
          sales[city] =
            (sales[city] ?? 0) +
            recentMonths.reduce((a: number, b: number) => a + b, 0) /
              recentMonths.length;
        }
        if (typeof d.closedThisWeek === "number") {
          closed[city] = (closed[city] ?? 0) + d.closedThisWeek;
        }
        if (d.closedThisWeekByZip && typeof d.closedThisWeekByZip === "object") {
          for (const [zipCode, count] of Object.entries(
            d.closedThisWeekByZip as Record<string, number>,
          )) {
            closedByZip[city][zipCode] = (closedByZip[city][zipCode] ?? 0) + count;
          }
        }
      }

      bumpIntelligenceSnapshotGeneration();
      setByCity(next);
      const fromCache =
        msEntries &&
        avgsFromMonthsSupplyEntries(
          msEntries,
          monthsSupplyKind(tx),
          monthsSupplyPropertyClass(tx, saleProperty),
        );
      setMonthlySales(fromCache ?? sales);
      setClosedThisWeekByTown(closed);
      setClosedThisWeekByTownZip(closedByZip);
      setMonthlySalesLoaded(true);
      setState(anyLive ? "ready" : "fallback");
    })();

    return () => {
      cancelled = true;
    };
    // saleProperty is applied via months-supply overlay effect; board fetch keys on tx.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [tx]);

  const snapshot = MOCK_FALLBACK.find((d) => d.city === active) ?? null;
  const liveListings: DisplayListing[] = active === "All"
    ? Object.values(byCity).flatMap((l) => l ?? [])
    : (byCity[active] ?? []);
  const allListings: DisplayListing[] = active === "All"
    ? (liveListings.length > 0
        ? liveListings
        : MOCK_FALLBACK.flatMap((d) => d.listings.map((l) => ({ ...l, city: d.city }))))
    : (liveListings.length > 0
        ? liveListings
        : (snapshot?.listings ?? []).map((l) => ({ ...l, city: active })));

  useEffect(() => {
    setSortKey("score");
    setSortDir("desc");
  }, [active]);

  const availableZips = useMemo(() => {
    const byZip = new Map<string, number[]>();
    const allowedZips =
      active !== "All" ? new Set<string>(zipsForTown(active)) : null;
    allListings.forEach((l) => {
      if (!l.zip || !l.price) return;
      if (allowedZips && !allowedZips.has(l.zip)) return;
      if (!byZip.has(l.zip)) byZip.set(l.zip, []);
      byZip.get(l.zip)!.push(l.price);
    });

    const medianOf = (prices: number[]) => {
      const s = [...prices].sort((a, b) => a - b);
      const m = Math.floor(s.length / 2);
      return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m];
    };

    const zipMedianPrice = new Map<string, number>();
    byZip.forEach((prices, z) => zipMedianPrice.set(z, medianOf(prices)));

    return Array.from(byZip.keys()).sort(
      (a, b) => (zipMedianPrice.get(b) ?? 0) - (zipMedianPrice.get(a) ?? 0),
    );
  }, [allListings, active]);

  useEffect(() => {
    if (filtersExpanded) setCollapsedSlidersOpen(false);
  }, [filtersExpanded]);

  useEffect(() => {
    if (!collapsedSlidersOpen || filtersExpanded) return;
    const dismissCollapsedSliders = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest("[data-intel-slider-panel]")) return;
      if (target.closest("[data-intel-collapsed-slider-label]")) return;
      setCollapsedSlidersOpen(false);
      setPriceSliderActive(false, { immediate: true });
      setBedSliderActive(false, { immediate: true });
      setBathSliderActive(false, { immediate: true });
      setVintageSliderActive(false, { immediate: true });
      setSqftSliderActive(false, { immediate: true });
    };
    window.addEventListener("pointerdown", dismissCollapsedSliders);
    return () => window.removeEventListener("pointerdown", dismissCollapsedSliders);
  }, [collapsedSlidersOpen, filtersExpanded]);

  useEffect(() => {
    if (active !== "All" && availableZips.length <= 1) setZip(null);
  }, [active, availableZips.length, setZip]);

  useEffect(() => {
    setZipLinksExpanded(false);
  }, [active]);

  useEffect(() => {
    if (active !== "All" && availableZips.length > 1) {
      prefetchZipBoundaries(availableZips);
    }
  }, [active, availableZips]);

  useEffect(() => {
    if (tx === "rental" && saleProperty !== "all") setSaleProperty("all");
  }, [tx, saleProperty, setSaleProperty]);

  useEffect(() => {
    if (tx === "sale" && furnishedFilter !== "all") setFurnishedFilter("all");
  }, [tx, furnishedFilter, setFurnishedFilter]);

  useEffect(() => {
    if (cls === "commercial") {
      if (minBedsFilter !== "0") setMinBedsFilter("0");
      if (maxBedsFilter !== "6") setMaxBedsFilter("6");
      if (minBathsFilter !== "0") setMinBathsFilter("0");
      if (maxBathsFilter !== "6") setMaxBathsFilter("6");
      if (minVintageFilter !== "0") setMinVintageFilter("0");
      if (maxVintageFilter !== "6") {
        setMaxVintageFilter("6");
      }
      sqftRangeCustomizedRef.current = false;
      setMinSqftIndex(0);
      setMaxSqftIndex(INTEL_SQFT_MAX_INDEX);
    }
  }, [cls, minBedsFilter, maxBedsFilter, minBathsFilter, maxBathsFilter, minVintageFilter, maxVintageFilter, setMinBedsFilter, setMaxBedsFilter, setMinBathsFilter, setMaxBathsFilter, setMinVintageFilter, setMaxVintageFilter]);

  useEffect(() => {
    if (minBedrooms > maxBedrooms) {
      setMaxBedsFilter(String(minBedrooms) as MinBedFilter);
    }
  }, [minBedrooms, maxBedrooms, setMaxBedsFilter]);

  useEffect(() => {
    if (minBathrooms > maxBathrooms) {
      setMaxBathsFilter(String(minBathrooms) as MinBathFilter);
    }
  }, [minBathrooms, maxBathrooms, setMaxBathsFilter]);

  useEffect(() => {
    if (minVintage > maxVintage) {
      setMaxVintageFilter(String(minVintage) as VintageIndexFilter);
    }
  }, [minVintage, maxVintage, setMaxVintageFilter]);

  const listingsBeforePrice = useMemo(
    () =>
      filterBoardListings(
        allListings,
        tx,
        cls,
        zip,
        boardStatusFilter,
        saleProperty,
        minBedrooms,
        maxBedrooms,
        minBathrooms,
        maxBathrooms,
        newConstructionOnly,
        furnishedFilter,
        false,
        0,
        null,
        minVintage,
        maxVintage,
      ),
    [allListings, tx, cls, zip, boardStatusFilter, saleProperty, minBedrooms, maxBedrooms, minBathrooms, maxBathrooms, newConstructionOnly, furnishedFilter, minVintage, maxVintage],
  );

  const boardPriceSteps = useMemo(
    () => intelPriceStepsForBoard(listingsBeforePrice),
    [listingsBeforePrice],
  );
  const boardPriceMaxIdx = boardPriceMaxIndex(boardPriceSteps);

  const defaultPriceIndices = useMemo(
    () => defaultPriceIndicesFromBoard(listingsBeforePrice),
    [listingsBeforePrice],
  );

  const priceFilterContextKey = useMemo(
    () =>
      [
        active,
        tx,
        cls,
        saleProperty,
        zip ?? "",
        boardStatusFilter,
        minBedrooms,
        maxBedrooms,
        minBathrooms,
        maxBathrooms,
        newConstructionOnly ? "1" : "0",
        furnishedFilter,
      ].join("|"),
    [
      active,
      tx,
      cls,
      saleProperty,
      zip,
      boardStatusFilter,
      minBedrooms,
      maxBedrooms,
      minBathrooms,
      maxBathrooms,
      newConstructionOnly,
      furnishedFilter,
    ],
  );

  useEffect(() => {
    if (priceFilterContextRef.current !== priceFilterContextKey) {
      priceFilterContextRef.current = priceFilterContextKey;
      priceRangeCustomizedRef.current = false;
    }
  }, [priceFilterContextKey]);

  useEffect(() => {
    if (!showPriceFilter) {
      setMinPriceIndex(0);
      setMaxPriceIndex(INTEL_PRICE_MAX_INDEX);
      priceRangeCustomizedRef.current = false;
      return;
    }
    if (priceRangeCustomizedRef.current) {
      setMinPriceIndex((i) => Math.min(i, boardPriceMaxIdx));
      setMaxPriceIndex((i) => Math.min(i, boardPriceMaxIdx));
      return;
    }
    setMinPriceIndex(0);
    setMaxPriceIndex(boardPriceMaxIdx);
  }, [
    showPriceFilter,
    priceFilterContextKey,
    boardPriceMaxIdx,
    defaultPriceIndices.minIndex,
    defaultPriceIndices.maxIndex,
  ]);

  const { minPrice, maxPrice } = resolveIntelPriceRangeFromSteps(
    boardPriceSteps,
    minPriceIndex,
    maxPriceIndex,
  );
  const priceFilterActive =
    showPriceFilter &&
    intelPriceFilterActiveOnBoard(minPriceIndex, maxPriceIndex, boardPriceSteps);

  const listingsBeforeSqft = useMemo(
    () =>
      filterBoardListings(
        allListings,
        tx,
        cls,
        zip,
        boardStatusFilter,
        saleProperty,
        minBedrooms,
        maxBedrooms,
        minBathrooms,
        maxBathrooms,
        newConstructionOnly,
        furnishedFilter,
        false,
        minPrice,
        maxPrice,
        minVintage,
        maxVintage,
      ),
    [
      allListings,
      tx,
      cls,
      zip,
      boardStatusFilter,
      saleProperty,
      minBedrooms,
      maxBedrooms,
      minBathrooms,
      maxBathrooms,
      newConstructionOnly,
      furnishedFilter,
      minPrice,
      maxPrice,
      minVintage,
      maxVintage,
    ],
  );

  const boardSqftSteps = useMemo(
    () => intelSqftStepsForBoard(listingsBeforeSqft),
    [listingsBeforeSqft],
  );
  const boardSqftMaxIdx = boardSqftMaxIndex(boardSqftSteps);

  const defaultSqftIndices = useMemo(
    () => defaultSqftIndicesFromBoard(listingsBeforeSqft),
    [listingsBeforeSqft],
  );

  const sqftFilterContextKey = useMemo(
    () =>
      [
        active,
        tx,
        cls,
        saleProperty,
        zip ?? "",
        boardStatusFilter,
        minBedrooms,
        maxBedrooms,
        minBathrooms,
        maxBathrooms,
        newConstructionOnly ? "1" : "0",
        furnishedFilter,
        minVintage,
        maxVintage,
        minPriceIndex,
        maxPriceIndex,
      ].join("|"),
    [
      active,
      tx,
      cls,
      saleProperty,
      zip,
      boardStatusFilter,
      minBedrooms,
      maxBedrooms,
      minBathrooms,
      maxBathrooms,
      newConstructionOnly,
      furnishedFilter,
      minVintage,
      maxVintage,
      minPriceIndex,
      maxPriceIndex,
    ],
  );

  const sqftFilterContextRef = useRef("");

  useEffect(() => {
    if (sqftFilterContextRef.current !== sqftFilterContextKey) {
      sqftFilterContextRef.current = sqftFilterContextKey;
      sqftRangeCustomizedRef.current = false;
    }
  }, [sqftFilterContextKey]);

  useEffect(() => {
    if (cls === "commercial") {
      setMinSqftIndex(0);
      setMaxSqftIndex(INTEL_SQFT_MAX_INDEX);
      sqftRangeCustomizedRef.current = false;
      return;
    }
    if (sqftRangeCustomizedRef.current) {
      setMinSqftIndex((i) => Math.min(i, boardSqftMaxIdx));
      setMaxSqftIndex((i) => Math.min(i, boardSqftMaxIdx));
      return;
    }
    setMinSqftIndex(0);
    setMaxSqftIndex(boardSqftMaxIdx);
  }, [
    cls,
    sqftFilterContextKey,
    boardSqftMaxIdx,
    defaultSqftIndices.minIndex,
    defaultSqftIndices.maxIndex,
  ]);

  const { minSqft, maxSqft } = resolveIntelSqftRangeFromSteps(
    boardSqftSteps,
    minSqftIndex,
    maxSqftIndex,
  );
  const sqftFilterActive =
    cls !== "commercial" &&
    intelSqftFilterActiveOnBoard(minSqftIndex, maxSqftIndex, boardSqftSteps);

  useEffect(() => {
    setMiddleTierExpanded(false);
    setBoardPage(1);
  }, [active, tx, cls, saleProperty, zip, boardStatusFilter, minBedrooms, maxBedrooms, minBathrooms, maxBathrooms, minVintage, maxVintage, newConstructionOnly, furnishedFilter, minPriceIndex, maxPriceIndex, minSqftIndex, maxSqftIndex, sortKey, sortDir]);

  const listings = useMemo(
    () =>
      filterBoardListings(
        allListings,
        tx,
        cls,
        zip,
        boardStatusFilter,
        saleProperty,
        minBedrooms,
        maxBedrooms,
        minBathrooms,
        maxBathrooms,
        newConstructionOnly,
        furnishedFilter,
        false,
        minPrice,
        maxPrice,
        minVintage,
        maxVintage,
        minSqft,
        maxSqft,
      ),
    [allListings, tx, cls, zip, boardStatusFilter, saleProperty, minBedrooms, maxBedrooms, minBathrooms, maxBathrooms, newConstructionOnly, furnishedFilter, minPrice, maxPrice, minVintage, maxVintage, minSqft, maxSqft],
  );

  const rankedListings = useMemo(() => rankListingsByScore(listings), [listings]);
  const boardSortedListings = useMemo(() => {
    if (sortKey === "score") return rankedListings;
    return sortListings(listings, sortKey, sortDir);
  }, [listings, rankedListings, sortKey, sortDir]);
  const boardListings = useMemo(() => {
    const start = (boardPage - 1) * BOARD_LISTING_LIMIT;
    return boardSortedListings.slice(start, start + BOARD_LISTING_LIMIT);
  }, [boardSortedListings, boardPage]);

  const boardPrefetchIds = useMemo(() => {
    const start = (boardPage - 1) * BOARD_LISTING_LIMIT;
    return rankedListings.slice(start, start + BOARD_LISTING_LIMIT).map((l) => l.key);
  }, [rankedListings, boardPage]);

  useEffect(() => {
    if (state !== "ready" || boardPrefetchIds.length === 0) return;
    // Grid/large cards load their own photos — skip stack prefetch to avoid RETS storms.
    if (boardView === "grid" || boardView === "large") return;
    return prefetchMlsPhotoThumbsOrdered(boardPrefetchIds, {
      stackPhotosForTop: PHOTO_PRIORITY_RANK_COUNT,
      stackPhotoCount: 1,
    });
  }, [boardPrefetchIds, state, boardView]);

  const boardTiers = useMemo(() => {
    const rows = boardListings;
    // Middle tier only makes sense in the default score ranking (high → low).
    // Any other sort (or score ascending) shows the flat list — no collapse band.
    if (
      sortKey !== "score" ||
      sortDir !== "desc" ||
      vintageFilterActive(minVintage, maxVintage)
    ) {
      return {
        top: rows,
        middle: [] as DisplayListing[],
        bottom: [] as DisplayListing[],
        canTier: false,
        middlePinned: [] as DisplayListing[],
        middleCollapsible: [] as DisplayListing[],
        canCollapse: false,
        hideableCount: 0,
      };
    }
    const tiers = splitBoardByScoreTier(rows);
    const planned = planMiddleTierCollapse(tiers);
    return {
      top: sortListings(planned.top, sortKey, sortDir),
      middle: sortListings(
        [...planned.middlePinned, ...planned.middleCollapsible],
        sortKey,
        sortDir,
      ),
      middlePinned: sortListings(planned.middlePinned, sortKey, sortDir),
      middleCollapsible: sortListings(planned.middleCollapsible, sortKey, sortDir),
      bottom: sortListings(planned.bottom, sortKey, sortDir),
      canTier: tiers.canTier,
      canCollapse: planned.canCollapse,
      hideableCount: planned.hideableCount,
    };
  }, [boardListings, sortKey, sortDir, minVintage, maxVintage]);

  const filteredCount = listings.length;
  const resultCount = boardListings.length;
  const totalBoardPages = Math.max(1, Math.ceil(filteredCount / BOARD_LISTING_LIMIT));
  const boardPageStart =
    filteredCount === 0 ? 0 : (boardPage - 1) * BOARD_LISTING_LIMIT + 1;
  const boardPageEnd = Math.min(boardPage * BOARD_LISTING_LIMIT, filteredCount);
  const showBoardPagination = filteredCount > BOARD_LISTING_LIMIT;

  const effectiveMiddleTierExpanded =
    middleTierExpanded || !boardTiers.canCollapse;
  const hideMiddleTierToggle = !boardTiers.canCollapse;

  useEffect(() => {
    if (boardPage > totalBoardPages) setBoardPage(totalBoardPages);
  }, [boardPage, totalBoardPages]);
  const middleHidden =
    boardTiers.canCollapse &&
    boardTiers.hideableCount > 0 &&
    !effectiveMiddleTierExpanded;
  const visibleCount = middleHidden
    ? resultCount - boardTiers.hideableCount
    : resultCount;
  const poolCount = allListings.length;

  // Leaving a listing from the board: stamp #deal-… so browser Back + “Back to
  // deal board” can restore the exact row (page + middle tier if needed).
  useEffect(() => {
    const root = boardRef.current;
    if (!root) return;
    const onClickCapture = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (!target) return;
      const anchor = target.closest("a[href*='/listings/']");
      if (!anchor) return;
      const row = target.closest("[data-deal-mls]");
      const mlsId = row?.getAttribute("data-deal-mls")?.trim();
      if (!mlsId) return;
      stampDealBoardHash(mlsId);
      rememberDealBoardFocus({
        mlsId,
        boardPage,
        middleExpanded: effectiveMiddleTierExpanded,
      });
    };
    root.addEventListener("click", onClickCapture, true);
    return () => root.removeEventListener("click", onClickCapture, true);
  }, [boardPage, effectiveMiddleTierExpanded]);

  const dealFocusRestoreKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (state !== "ready" && state !== "fallback") return;
    if (boardSortedListings.length === 0) return;

    const hashToken = parseDealBoardFocusHash(
      typeof window !== "undefined" ? window.location.hash : "",
    );
    const stored = peekDealBoardFocus();
    const navEntry = performance.getEntriesByType("navigation")[0] as
      | PerformanceNavigationTiming
      | undefined;
    const isBackForward = navEntry?.type === "back_forward";
    // Prefer #deal-… (Back link / stamped URL). Session focus alone only on browser Back.
    if (!hashToken && !(stored && isBackForward)) return;
    const rawToken = hashToken ?? stored?.mlsId ?? null;
    if (!rawToken) return;

    const keys = boardSortedListings.map((l) => l.key);
    const mlsId =
      matchListingKeyFromFocusId(rawToken, keys) ??
      (keys.includes(rawToken) ? rawToken : null) ??
      (stored && keys.includes(stored.mlsId) ? stored.mlsId : null);
    if (!mlsId) {
      clearDealBoardFocus();
      return;
    }

    const idx = boardSortedListings.findIndex((l) => l.key === mlsId);
    if (idx < 0) {
      clearDealBoardFocus();
      return;
    }

    const targetPage = Math.floor(idx / BOARD_LISTING_LIMIT) + 1;
    if (targetPage !== boardPage) {
      setBoardPage(targetPage);
      return;
    }

    const inMiddle = boardTiers.middle.some((l) => l.key === mlsId);
    if (inMiddle && !effectiveMiddleTierExpanded) {
      setMiddleTierExpanded(true);
      return;
    }

    const restoreKey = `${mlsId}:${boardPage}:${effectiveMiddleTierExpanded ? 1 : 0}`;
    if (dealFocusRestoreKeyRef.current === restoreKey) return;

    const el = document.getElementById(dealBoardRowDomId(mlsId));
    if (!el) return;

    dealFocusRestoreKeyRef.current = restoreKey;
    const timer = window.setTimeout(() => {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add(
        "ring-2",
        "ring-gold",
        "ring-offset-2",
        "ring-offset-cream",
      );
      window.setTimeout(() => {
        el.classList.remove(
          "ring-2",
          "ring-gold",
          "ring-offset-2",
          "ring-offset-cream",
        );
      }, 2400);
      clearDealBoardFocus();
    }, 60);

    return () => window.clearTimeout(timer);
  }, [
    state,
    boardSortedListings,
    boardPage,
    boardTiers.middle,
    effectiveMiddleTierExpanded,
  ]);

  const townCounts = useMemo((): TownCountMap => {
    if (state === "loading") return {};
    let all = 0;
    const counts = Object.fromEntries(TMRE_TOWNS.map((t) => [t, 0])) as Record<
      TmreTown,
      number
    >;
    for (const town of TMRE_TOWNS) {
      const n = filterBoardListings(
        byCity[town] ?? [],
        tx,
        cls,
        null,
        boardStatusFilter,
        saleProperty,
        minBedrooms,
        maxBedrooms,
        minBathrooms,
        maxBathrooms,
        newConstructionOnly,
        furnishedFilter,
        false,
        minPrice,
        maxPrice,
        minVintage,
        maxVintage,
        minSqft,
        maxSqft,
      ).length;
      counts[town] = n;
      all += n;
    }
    return { ...counts, All: all };
  }, [byCity, state, tx, cls, boardStatusFilter, saleProperty, minBedrooms, maxBedrooms, minBathrooms, maxBathrooms, newConstructionOnly, furnishedFilter, minPrice, maxPrice, minVintage, maxVintage, minSqft, maxSqft]);

  const { zipCounts, zipAllCount } = useMemo(() => {
    if (active === "All") {
      return { zipCounts: new Map<string, number>(), zipAllCount: 0 };
    }
    const allowedZips = new Set(zipsForTown(active));
    const filtered = filterBoardListings(
      allListings,
      tx,
      cls,
      null,
      boardStatusFilter,
      saleProperty,
      minBedrooms,
      maxBedrooms,
      minBathrooms,
      maxBathrooms,
      newConstructionOnly,
      furnishedFilter,
      false,
      minPrice,
      maxPrice,
      minVintage,
      maxVintage,
      minSqft,
      maxSqft,
    );
    const zipCounts = new Map<string, number>();
    filtered.forEach((l) => {
      if (!l.zip || !allowedZips.has(l.zip)) return;
      zipCounts.set(l.zip, (zipCounts.get(l.zip) ?? 0) + 1);
    });
    return { zipCounts, zipAllCount: filtered.length };
  }, [allListings, active, tx, cls, boardStatusFilter, saleProperty, minBedrooms, maxBedrooms, minBathrooms, maxBathrooms, newConstructionOnly, furnishedFilter, minPrice, maxPrice, minVintage, maxVintage, minSqft, maxSqft]);

  const scoreRankByKey = useMemo(() => buildScoreRankMap(rankedListings), [rankedListings]);
  const filtersActive =
    tx !== "all" ||
    cls !== "all" ||
    saleProperty !== "all" ||
    minBedrooms > 0 ||
    maxBedrooms < BED_BATH_MAX ||
    minBathrooms > 0 ||
    maxBathrooms < BED_BATH_MAX ||
    vintageFilterActive(minVintage, maxVintage) ||
    sqftFilterActive ||
    newConstructionOnly ||
    furnishedFilter !== "all" ||
    zip != null ||
    boardStatusFilter !== "all" ||
    priceFilterActive;
  const showZipFilters = active !== "All" && availableZips.length > 1;
  const inlineTownZip =
    showZipFilters && !townLinksExpanded && !zipLinksExpanded;

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
      return;
    }
    setSortKey(key);
    setSortDir(
      key === "status" || key === "town" || key === "price"
        ? "asc"
        : "desc",
    );
  }

  const slidersCustomized =
    bedBathFilterActive(minBedrooms, maxBedrooms) ||
    bedBathFilterActive(minBathrooms, maxBathrooms) ||
    vintageFilterActive(minVintage, maxVintage) ||
    sqftFilterActive ||
    priceFilterActive;

  function resetSliders() {
    setMinBedsFilter("0");
    setMaxBedsFilter("6");
    setMinBathsFilter("0");
    setMaxBathsFilter("6");
    setMinVintageFilter("0");
    setMaxVintageFilter("6");
    sqftRangeCustomizedRef.current = false;
    setMinSqftIndex(0);
    setMaxSqftIndex(cls === "commercial" ? INTEL_SQFT_MAX_INDEX : boardSqftMaxIdx);
    priceRangeCustomizedRef.current = false;
    setMinPriceIndex(0);
    setMaxPriceIndex(showPriceFilter ? boardPriceMaxIdx : INTEL_PRICE_MAX_INDEX);
    setBoardStatusFilter("all");
    setFurnishedFilter("all");
    setBoardPage(1);
  }

  /** Enlarge every slider descriptor, then hold the same scale used while dragging. */
  function pulseAllSliderDescriptors() {
    setPriceSliderActive(true);
    setBedSliderActive(true);
    setBathSliderActive(true);
    setVintageSliderActive(true);
    setSqftSliderActive(true);
    setFurnishedSliderActive(true);
    // Release without `immediate` so each label stays enlarged for DESCRIPTOR_ENLARGE_HOLD_MS.
    setPriceSliderActive(false);
    setBedSliderActive(false);
    setBathSliderActive(false);
    setVintageSliderActive(false);
    setSqftSliderActive(false);
    setFurnishedSliderActive(false);
  }

  function handleDescriptorSliderClick(_kind: IntelSliderKind) {
    if (!filtersExpanded) {
      setCollapsedSlidersOpen(true);
    }
    pulseAllSliderDescriptors();
  }

  function hideCollapsedSliders() {
    setCollapsedSlidersOpen(false);
    setPriceSliderActive(false, { immediate: true });
    setBedSliderActive(false, { immediate: true });
    setBathSliderActive(false, { immediate: true });
    setVintageSliderActive(false, { immediate: true });
    setSqftSliderActive(false, { immediate: true });
    setFurnishedSliderActive(false, { immediate: true });
  }

  const showFurnishedSlider = tx !== "sale";

  const activeTownMonthsSupply = useMemo(() => {
    if (active === "All") return null;
    const count = filterBoardListings(
      byCity[active] ?? [],
      tx,
      cls,
      zip,
      boardStatusFilter,
      saleProperty,
      minBedrooms,
      maxBedrooms,
      minBathrooms,
      maxBathrooms,
      newConstructionOnly,
      furnishedFilter,
      false,
      minPrice,
      maxPrice,
      minVintage,
      maxVintage,
      minSqft,
      maxSqft,
    ).length;
    return computeMonthsSupply(count, monthlySales[active]);
  }, [active, byCity, tx, cls, zip, boardStatusFilter, saleProperty, minBedrooms, maxBedrooms, minBathrooms, maxBathrooms, newConstructionOnly, furnishedFilter, minPrice, maxPrice, minVintage, maxVintage, minSqft, maxSqft, monthlySales]);

  const showVintageStats = listings.length > 0;
  const vintageStatsTitle =
    active === "All" ? "All towns" : formatTownZipPlace(active, zip);
  const vintageListingRows = useMemo(
    () => toVintageListingRows(listings),
    [listings],
  );
  // Chart keeps every vintage band visible (ignore current vintage slider) so
  // clicking a dot can still switch bands — same metrics otherwise as the panel.
  const vintageChartListingRows = useMemo(
    () =>
      toVintageListingRows(
        filterBoardListings(
          allListings,
          tx,
          cls,
          zip,
          boardStatusFilter,
          saleProperty,
          minBedrooms,
          maxBedrooms,
          minBathrooms,
          maxBathrooms,
          newConstructionOnly,
          furnishedFilter,
          false,
          minPrice,
          maxPrice,
          0,
          VINTAGE_FILTER_MAX,
          minSqft,
          maxSqft,
        ),
      ),
    [
      allListings,
      tx,
      cls,
      zip,
      boardStatusFilter,
      saleProperty,
      minBedrooms,
      maxBedrooms,
      minBathrooms,
      maxBathrooms,
      newConstructionOnly,
      furnishedFilter,
      minPrice,
      maxPrice,
      minSqft,
      maxSqft,
    ],
  );
  const activeVintageChartBucketId =
    vintageFilterActive(minVintage, maxVintage) && minVintage === maxVintage
      ? vintageFilterIndexToBucketId(minVintage)
      : null;

  const liveSnapshots = useMemo((): TownSnapshot[] => {
    const snapshotFilters: IntelligenceSnapshotFilters = {
      tx,
      cls,
      saleProperty,
      zip,
      boardStatusFilter,
      minBedrooms,
      maxBedrooms,
      minBathrooms,
      maxBathrooms,
      minVintage,
      maxVintage,
      exactBeds: false,
      newConstructionOnly,
      furnishedFilter,
      minPrice,
      maxPrice,
      minSqft,
      maxSqft,
    };

    const filterTown = (city: TmreTown) =>
      filterBoardListings(
        byCity[city] ?? [],
        tx,
        cls,
        zip,
        boardStatusFilter,
        saleProperty,
        minBedrooms,
        maxBedrooms,
        minBathrooms,
        maxBathrooms,
        newConstructionOnly,
        furnishedFilter,
        false,
        minPrice,
        maxPrice,
        minVintage,
        maxVintage,
        minSqft,
        maxSqft,
      );

    const benchmarks = getOrSetIntelligenceSnapshotCache(
      intelligenceSnapshotBenchmarksKey(snapshotFilters),
      () =>
        snapshotBenchmarks(orderedCities.flatMap((city) => filterTown(city))),
    );

    if (active === "All") {
      return orderedCities.map((city) =>
        getOrSetIntelligenceSnapshotCache(
          intelligenceSnapshotTownKey(city, snapshotFilters),
          () =>
            buildTownSnapshot(
              filterTown(city),
              city,
              monthlySales,
              zip,
              benchmarks,
              closedThisWeekForTown(
                city,
                zip,
                closedThisWeekByTown,
                closedThisWeekByTownZip,
              ),
              tx,
            ),
        ),
      );
    }

    if (!listings.length) return [];
    return [
      getOrSetIntelligenceSnapshotCache(
        intelligenceSnapshotTownKey(active, snapshotFilters),
        () =>
          buildTownSnapshot(
            listings,
            active,
            monthlySales,
            zip,
            benchmarks,
            closedThisWeekForTown(
              active,
              zip,
              closedThisWeekByTown,
              closedThisWeekByTownZip,
            ),
            tx,
          ),
      ),
    ];
  }, [
    listings,
    active,
    monthlySales,
    closedThisWeekByTown,
    closedThisWeekByTownZip,
    orderedCities,
    byCity,
    tx,
    cls,
    saleProperty,
    zip,
    boardStatusFilter,
    minBedrooms,
    maxBedrooms,
    minBathrooms,
    maxBathrooms,
    minVintage,
    maxVintage,
    newConstructionOnly,
    furnishedFilter,
    minPrice,
    maxPrice,
    minSqft,
    maxSqft,
  ]);

  const allTownsDescriptorStats = useMemo(
    () => liveSnapshots.map((snap) => snap.stats),
    [liveSnapshots],
  );

  const anySnapshotExpanded = useMemo(
    () =>
      active !== "All" ||
      liveSnapshots.some((snap) => expandedSnapshotKeys.has(snapshotPanelKey(snap))) ||
      [...expandedSnapshotKeys].some((key) => key.startsWith("vintage:")),
    [active, liveSnapshots, expandedSnapshotKeys],
  );

  useLayoutEffect(() => {
    if (active === "All") return;
    setExpandedSnapshotKeys((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (const snap of liveSnapshots) {
        const key = snapshotPanelKey(snap);
        if (!next.has(key)) {
          next.add(key);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [active, zip, liveSnapshots]);

  const aggregateAllTownsMonthsSupply = useMemo(() => {
    if (active !== "All" || !monthlySalesLoaded) return null;
    const totalMonthlySales = TMRE_TOWNS.reduce(
      (sum, town) => sum + (monthlySales[town] ?? 0),
      0,
    );
    if (totalMonthlySales <= 0) return null;
    return computeMonthsSupply(listings.length, totalMonthlySales);
  }, [active, listings.length, monthlySales, monthlySalesLoaded]);

  const allTownsFilterContext = useMemo(
    () => ({
      tx,
      cls,
      saleProperty,
      minBedrooms,
      maxBedrooms,
      minBathrooms,
      maxBathrooms,
      minVintage,
      maxVintage,
      exactBeds: false,
      newConstructionOnly,
      minPrice,
      maxPrice,
      minSqft,
      maxSqft,
    }),
    [
      tx,
      cls,
      saleProperty,
      minBedrooms,
      maxBedrooms,
      minBathrooms,
      maxBathrooms,
      minVintage,
      maxVintage,
      newConstructionOnly,
      minPrice,
      maxPrice,
      minSqft,
      maxSqft,
    ],
  );

  const filterDescriptorParts = useMemo(
    () =>
      intelFilterDescriptorParts({
        active,
        zip,
        tx,
        cls,
        saleProperty,
        newConstructionOnly,
        boardStatusFilter,
        furnishedFilter,
      }),
    [
      active,
      zip,
      tx,
      cls,
      saleProperty,
      newConstructionOnly,
      boardStatusFilter,
      furnishedFilter,
    ],
  );

  const showTownChrome =
    !filterChromeCollapsed || filterChromePeek === "towns";
  const showTxChrome = !filterChromeCollapsed || filterChromePeek === "tx";
  const showSliderChrome = !filterChromeCollapsed;

  const peekTownPills = () => {
    setFilterChromeCollapsed(true);
    setFilterChromePeek("towns");
  };
  const peekTxPills = () => {
    setFilterChromeCollapsed(true);
    setFilterChromePeek("tx");
  };
  const toggleFilterChrome = () => {
    if (filterChromeCollapsed) {
      setFilterChromeCollapsed(false);
      setFilterChromePeek(null);
    } else {
      setFilterChromeCollapsed(true);
      setFilterChromePeek(null);
    }
  };

  const filterDescriptorLeading = (
    <IntelDescriptorContext
      parts={filterDescriptorParts}
      onTownClick={peekTownPills}
      onTxClick={peekTxPills}
    />
  );

  const scrollToBoard = () => {
    requestAnimationFrame(() => {
      boardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const selectVintageListings = (bucketId: VintageBucketId) => {
    const index = vintageBucketFilterIndex(bucketId);
    if (index == null) return;
    setBoardStatusFilter("all");
    setMinVintageFilter(String(index) as VintageIndexFilter);
    setMaxVintageFilter(String(index) as VintageIndexFilter);
    setBoardPage(1);
    scrollToBoard();
  };

  const selectTownListings = (
    town: string,
    statusFilter: BoardStatusFilter = "all",
    zipFilter?: string | null,
  ) => {
    if (!(INTEL_CITIES as readonly string[]).includes(town)) return;
    setActive(town as IntelCity);
    setZip(zipFilter ?? null);
    setBoardStatusFilter(statusFilter);
    if (statusFilter === "new") {
      setSortKey("dom");
      setSortDir("asc");
    }
    scrollToBoard();
  };

  /** Range labels — always available (including when pill chrome is minimized). */
  const sliderDescriptorLabels = (
    <IntelSliderDescriptorLabels
      showPriceFilter={showPriceFilter}
      cls={cls}
      showFurnished={showFurnishedSlider}
      furnishedFilter={furnishedFilter}
      furnishedSliderActive={furnishedSliderActive}
      onDescriptorClick={handleDescriptorSliderClick}
      boardPriceSteps={boardPriceSteps}
      minPriceIndex={minPriceIndex}
      maxPriceIndex={maxPriceIndex}
      priceSliderActive={priceSliderActive}
      minBedrooms={minBedrooms}
      maxBedrooms={maxBedrooms}
      minBathrooms={minBathrooms}
      maxBathrooms={maxBathrooms}
      minVintage={minVintage}
      maxVintage={maxVintage}
      boardSqftSteps={boardSqftSteps}
      minSqftIndex={minSqftIndex}
      maxSqftIndex={maxSqftIndex}
      bedSliderActive={bedSliderActive}
      bathSliderActive={bathSliderActive}
      vintageSliderActive={vintageSliderActive}
      sqftSliderActive={sqftSliderActive}
    />
  );

  const descriptorSentinelRef = useRef<HTMLDivElement>(null);
  const [descriptorsPinned, setDescriptorsPinned] = useState(false);

  // Pin descriptors under the site nav once their in-flow row scrolls away.
  // (Hero `overflow-hidden` prevents CSS sticky from spanning the deal board.)
  useEffect(() => {
    const sentinel = descriptorSentinelRef.current;
    if (!sentinel) {
      setDescriptorsPinned(false);
      return;
    }
    const navOffsetPx = () =>
      window.matchMedia("(min-width: 1024px)").matches ? 96 : 80;
    const update = () => {
      const top = sentinel.getBoundingClientRect().top;
      setDescriptorsPinned(top < navOffsetPx());
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [
    showPriceFilter,
    cls,
    showFurnishedSlider,
    filtersExpanded,
    collapsedSlidersOpen,
    filterChromeCollapsed,
  ]);

  const closeTownStats = () => setTownStatsOpen(false);
  const closeVintageStats = () => setVintageStatsOpen(false);

  const liveStatusLabel =
    state === "ready"
      ? sqliteRefresh.refreshing
        ? "Live Refreshing"
        : (() => {
            const syncedAt = formatSqliteRefreshTime(
              sqliteRefresh.lastFinishedAt,
            );
            return syncedAt ? `Live · synced ${syncedAt}` : "Live";
          })()
      : state === "fallback"
        ? "Cached · feed offline"
        : "Loading…";

  const liveStatusDotClass =
    state === "ready" && sqliteRefresh.refreshing
      ? "bg-gold animate-pulse-dot"
      : state === "ready"
        ? "bg-sage animate-pulse-dot"
        : state === "fallback"
          ? "bg-coral"
          : "bg-gold animate-pulse-dot";

  const townSnapshotPanels = liveSnapshots.map((snap) => {
    const panelKey = snapshotPanelKey(snap);
    const collapsible = active === "All";
    const expanded = !collapsible || expandedSnapshotKeys.has(panelKey);
    return (
      <TownSnapshotPanel
        key={panelKey}
        snapshot={snap}
        tx={tx}
        expanded={expanded}
        collapsible={collapsible}
        onToggleExpanded={() => toggleSnapshotExpanded(panelKey)}
        onListingsClick={(town, zipFilter) => {
          closeTownStats();
          selectTownListings(town, "all", zipFilter);
        }}
        onSnapshotAction={(town, action, zipFilter) =>
          intelligenceListingsHref({
            city: town,
            status: action,
            zip: zipFilter,
            tx,
            cls,
            saleProperty,
          })
        }
        onMedianHref={(s) =>
          s.metrics.some((m) => m.label === "Median price" && m.linkMedian)
            ? statsMedianListingsHref({
                city: s.town,
                kind: tx === "rental" ? "rental" : "sale",
                pool: "active",
                zip: s.zip,
                tx,
                cls,
                saleProperty,
              })
            : null
        }
      />
    );
  });

  const vintageStatsPanel = showVintageStats ? (
    <IntelligenceVintageStats
      title={vintageStatsTitle}
      listings={vintageListingRows}
      tx={tx}
      city={active === "All" ? "All" : active}
      collapsible
      expandedKeys={expandedSnapshotKeys}
      onToggleExpanded={toggleSnapshotExpanded}
      onVintageListingsClick={(bucketId) => {
        closeTownStats();
        closeVintageStats();
        selectVintageListings(bucketId);
      }}
    />
  ) : null;

  /** Desktop sidebar: towns + vintages together. */
  const townStatsPanels = (
    <>
      {townSnapshotPanels}
      {vintageStatsPanel}
    </>
  );

  const pinnedDescriptorBar =
    descriptorsPinned && typeof document !== "undefined" ? (
      <div
        className="fixed top-20 lg:top-24 inset-x-0 z-40 border-b border-white/10 bg-[#1B2A4A]/95 shadow-[0_8px_24px_-12px_rgba(0,0,0,0.65)] backdrop-blur-md"
        data-intel-slider-context-blurb-pinned
      >
        <div className="mx-auto max-w-7xl px-6 lg:px-10 py-2">
          <p className="flex flex-wrap items-baseline gap-x-2 w-full min-w-0 font-mono text-xs tracking-wide">
            {filterDescriptorLeading}
            {sliderDescriptorLabels}
          </p>
        </div>
      </div>
    ) : null;

  return (
    <>
      {pinnedDescriptorBar}
      <section
        className={`navy-gradient text-white pt-20 lg:pt-24 relative overflow-hidden transition-[padding] duration-300 ease-out ${
          filtersExpanded ? "pb-1 lg:pb-1" : "pb-1"
        }`}
      >
        <div className="absolute inset-0 hero-grid opacity-40" aria-hidden />
        <div className="relative mx-auto max-w-7xl px-6 lg:px-10">
          <div
            className="flex flex-col lg:flex-row lg:items-start lg:gap-x-5 gap-y-2 transition-[gap] duration-300 ease-out"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-3 min-w-0">
                <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold animate-fade-up">
                  Market Intelligence
                </p>
              </div>
              <div
                className={`grid transition-[grid-template-rows] duration-700 ease-in-out ${
                  heroIntroDismissed ? "grid-rows-[0fr]" : "grid-rows-[1fr]"
                }`}
                aria-hidden={heroIntroDismissed}
              >
                <div
                  className={`overflow-hidden min-h-0 transition-opacity duration-700 ease-out ${
                    heroIntroDismissed ? "opacity-0" : "opacity-100"
                  }`}
                >
                  <div className="flex flex-col gap-y-1.5 pt-1.5 animate-fade-up">
                    <h1 className="font-serif text-lg sm:text-xl lg:text-2xl xl:text-3xl text-white leading-[1.08] max-w-4xl">
                      More than just Real Estate — delivering{" "}
                      <span className="italic gold-shimmer">Market Intelligence</span>
                    </h1>
                    <p className="text-sm lg:text-base text-white/70 leading-tight animate-fade-up-delay-1 lg:whitespace-nowrap">
                      Active listings scored against our{" "}
                      <Link
                        href="/deal-model"
                        className="text-gold hover:text-gold-light underline underline-offset-[3px] decoration-gold/50 transition-colors"
                      >
                        deal model
                      </Link>
                      {" — sourced live across the towns you've selected."}
                    </p>
                  </div>
                </div>
              </div>

              <div
                className={`flex flex-col gap-1.5 items-start min-w-0 w-full animate-fade-up-delay-2 transition-[margin-top] duration-700 ease-in-out ${
                  heroIntroDismissed ? "mt-0" : "mt-1"
                }`}
              >
                <div className="flex flex-wrap items-center gap-1.5 min-w-0 w-full self-start">
                  <FilterGroup
                    label=""
                    value={cls}
                    onChange={setCls}
                    options={[
                      { value: "all", label: "All" },
                      { value: "residential", label: "Residential" },
                      { value: "commercial", label: "Commercial" },
                    ]}
                  />
                  <button
                    type="button"
                    onClick={toggleFilterChrome}
                    className="inline-flex h-12 w-12 shrink-0 items-center justify-center text-white/70 hover:text-gold transition-colors"
                    aria-expanded={!filterChromeCollapsed}
                    aria-label={
                      filterChromeCollapsed
                        ? "Show town, sale, and slider filters"
                        : "Hide town, sale, and slider filters"
                    }
                    title={
                      filterChromeCollapsed
                        ? "Show filters"
                        : "Minimize filters"
                    }
                  >
                    <svg
                      viewBox="0 0 12 12"
                      className="h-12 w-12"
                      fill="currentColor"
                      aria-hidden
                    >
                      {filterChromeCollapsed ? (
                        <path d="M1.2 3.5 L6 9.2 L10.8 3.5 Z" />
                      ) : (
                        <path d="M1.2 8.5 L6 2.8 L10.8 8.5 Z" />
                      )}
                    </svg>
                  </button>
                </div>

                {showTownChrome ? (
                  <div className="flex flex-col gap-1.5 items-start min-w-0 w-full">
                    <div
                      className={
                        inlineTownZip
                          ? "flex flex-wrap items-center gap-x-3 gap-y-1 w-full min-w-0"
                          : "w-full min-w-0"
                      }
                    >
                      <div
                        ref={townFilterAnchorRef}
                        className={
                          inlineTownZip
                            ? "min-w-0 shrink-0"
                            : "flex flex-wrap gap-1 self-start w-full min-w-0"
                        }
                      >
                        <TownFilterPills
                          towns={orderedCities}
                          selected={active}
                          onSelect={(city) => {
                            setActive(city);
                            setZip(null);
                            setBoardStatusFilter("all");
                            setTownLinksExpanded(false);
                            setZipLinksExpanded(false);
                            if (city === "All") {
                              setExpandedSnapshotKeys(new Set());
                            }
                            flashTownMapOnSelect(city);
                          }}
                          onTownMouseEnter={(town, el) => {
                            if (townHoverClearTimer.current) {
                              clearTimeout(townHoverClearTimer.current);
                              townHoverClearTimer.current = null;
                            }
                            prefetchTownBoundaries(town);
                            setHoveredZip(null);
                            setHoveredZipEl(null);
                            setHoveredTown(town);
                            setHoveredTownEl(el);
                          }}
                          onAllMouseEnter={(el) => {
                            if (townHoverClearTimer.current) {
                              clearTimeout(townHoverClearTimer.current);
                              townHoverClearTimer.current = null;
                            }
                            prefetchAllTownBoundaries();
                            setHoveredZip(null);
                            setHoveredZipEl(null);
                            setHoveredTown("All");
                            setHoveredTownEl(el);
                          }}
                          onTownMouseLeave={() => {
                            if (townHoverClearTimer.current) {
                              clearTimeout(townHoverClearTimer.current);
                            }
                            townHoverClearTimer.current = setTimeout(() => {
                              setHoveredTown(null);
                              setHoveredTownEl(null);
                              townHoverClearTimer.current = null;
                            }, 120);
                          }}
                          counts={townCounts}
                          allLabel="All Towns"
                          appearance="zip"
                          layout="promoted"
                          townLinksExpanded={townLinksExpanded}
                          onTownLinksExpandedChange={setTownLinksExpanded}
                          size="compact"
                          className={inlineTownZip ? "min-w-0" : "w-full min-w-0"}
                          promotedInline={inlineTownZip}
                        />
                      </div>

                      {inlineTownZip ? (
                        <ZipFilterPills
                          zips={availableZips}
                          selected={zip}
                          onSelect={(next) => {
                            setZip(next);
                            setZipLinksExpanded(false);
                          }}
                          counts={zipCounts}
                          allCount={zipAllCount}
                          allLabel={`Search all zips for ${active}`}
                          townName={active}
                          zipLinksExpanded={zipLinksExpanded}
                          onZipLinksExpandedChange={setZipLinksExpanded}
                          onZipMouseEnter={(z, el) => {
                            setHoveredTown(null);
                            setHoveredTownEl(null);
                            setHoveredZip(z);
                            setHoveredZipEl(el);
                          }}
                          onZipMouseLeave={() => {
                            setHoveredZip(null);
                            setHoveredZipEl(null);
                          }}
                          className="min-w-0 shrink-0"
                          promotedInline
                        />
                      ) : null}
                    </div>

                    {showZipFilters && !inlineTownZip ? (
                      <ZipFilterPills
                        zips={availableZips}
                        selected={zip}
                        onSelect={(next) => {
                          setZip(next);
                          setZipLinksExpanded(false);
                        }}
                        counts={zipCounts}
                        allCount={zipAllCount}
                        allLabel={`Search all zips for ${active}`}
                        townName={active}
                        zipLinksExpanded={zipLinksExpanded}
                        onZipLinksExpandedChange={setZipLinksExpanded}
                        onZipMouseEnter={(z, el) => {
                          setHoveredTown(null);
                          setHoveredTownEl(null);
                          setHoveredZip(z);
                          setHoveredZipEl(el);
                        }}
                        onZipMouseLeave={() => {
                          setHoveredZip(null);
                          setHoveredZipEl(null);
                        }}
                        className="self-start w-full min-w-0"
                      />
                    ) : null}
                  </div>
                ) : null}

              {/* Slider range labels sit above All / For Sale / Rentals; pin on scroll. */}
              <div ref={descriptorSentinelRef} className="h-0 w-full" aria-hidden />
              <p
                className={`flex flex-wrap items-baseline gap-x-2 w-full min-w-0 font-mono text-xs tracking-wide mt-0.5 ${
                  descriptorsPinned
                    ? "invisible pointer-events-none"
                    : ""
                }`}
                data-intel-slider-context-blurb
                aria-hidden={descriptorsPinned || undefined}
              >
                {sliderDescriptorLabels}
              </p>

                {showTxChrome ? (
                  <div className="flex flex-wrap items-center gap-2 min-w-0 self-start w-full">
                    <FilterGroup
                      label=""
                      value={tx}
                      onChange={setTx}
                      options={[
                        { value: "all", label: "All" },
                        { value: "sale", label: "For Sale" },
                        { value: "rental", label: "Rentals" },
                      ]}
                    />
                    {!filterChromeCollapsed && tx !== "rental" ? (
                      <>
                        <div
                          className={`hidden sm:block ${filterPillSeparatorClass("compact")}`}
                          aria-hidden
                        />
                        <FilterGroup
                          label=""
                          value={saleProperty}
                          onChange={setSaleProperty}
                          options={[
                            { value: "all", label: "All types" },
                            { value: "homes", label: "Homes" },
                            { value: "multi", label: "Multi-family" },
                            { value: "condos", label: "Condos" },
                          ]}
                        />
                      </>
                    ) : null}
                    {!filterChromeCollapsed ? (
                      <>
                        <div
                          className={`hidden sm:block ${filterPillSeparatorClass("compact")}`}
                          aria-hidden
                        />
                        <FilterGroup
                          label=""
                          value={newConstructionFilter}
                          onChange={setNewConstructionFilter}
                          options={[
                            { value: "all", label: "Any age" },
                            { value: "new", label: "New construction" },
                          ]}
                        />
                        <IntelFiltersToggle
                          expanded={filtersExpanded}
                          filtersActive={slidersCustomized}
                          onToggle={() => setFiltersExpanded(!filtersExpanded)}
                        />
                      </>
                    ) : null}
                  </div>
                ) : null}
              </div>

              {/* Price/slider filter chrome; town context descriptors render above tx pills. */}
              {showSliderChrome ? (
                <IntelFilterControlsRow
                  filtersExpanded={filtersExpanded}
                  showPriceFilter={showPriceFilter}
                  cls={cls}
                  collapsedSlidersOpen={collapsedSlidersOpen}
                  boardPriceSteps={boardPriceSteps}
                  minPriceIndex={minPriceIndex}
                  maxPriceIndex={maxPriceIndex}
                  onMinPriceIndexChange={(index) => {
                    priceRangeCustomizedRef.current = true;
                    setMinPriceIndex(index);
                  }}
                  onMaxPriceIndexChange={(index) => {
                    priceRangeCustomizedRef.current = true;
                    setMaxPriceIndex(index);
                  }}
                  onPriceSliderActiveChange={setPriceSliderActive}
                  priceSliderActive={priceSliderActive}
                  minBedrooms={minBedrooms}
                  maxBedrooms={maxBedrooms}
                  onMinBedroomsChange={(n) =>
                    setMinBedsFilter(String(n) as MinBedFilter)
                  }
                  onMaxBedroomsChange={(n) =>
                    setMaxBedsFilter(String(n) as MinBedFilter)
                  }
                  minBathrooms={minBathrooms}
                  maxBathrooms={maxBathrooms}
                  onMinBathroomsChange={(n) =>
                    setMinBathsFilter(String(n) as MinBathFilter)
                  }
                  onMaxBathroomsChange={(n) =>
                    setMaxBathsFilter(String(n) as MinBathFilter)
                  }
                  minVintage={minVintage}
                  maxVintage={maxVintage}
                  onMinVintageChange={(n) =>
                    setMinVintageFilter(String(n) as VintageIndexFilter)
                  }
                  onMaxVintageChange={(n) =>
                    setMaxVintageFilter(String(n) as VintageIndexFilter)
                  }
                  onBedSliderActiveChange={setBedSliderActive}
                  onBathSliderActiveChange={setBathSliderActive}
                  onVintageSliderActiveChange={setVintageSliderActive}
                  onSqftSliderActiveChange={setSqftSliderActive}
                  boardSqftSteps={boardSqftSteps}
                  minSqftIndex={minSqftIndex}
                  maxSqftIndex={maxSqftIndex}
                  onMinSqftIndexChange={(index) => {
                    sqftRangeCustomizedRef.current = true;
                    setMinSqftIndex(index);
                  }}
                  onMaxSqftIndexChange={(index) => {
                    sqftRangeCustomizedRef.current = true;
                    setMaxSqftIndex(index);
                  }}
                  bedSliderActive={bedSliderActive}
                  bathSliderActive={bathSliderActive}
                  vintageSliderActive={vintageSliderActive}
                  sqftSliderActive={sqftSliderActive}
                  showFurnished={showFurnishedSlider}
                  furnishedFilter={furnishedFilter}
                  onFurnishedFilterChange={setFurnishedFilter}
                  onFurnishedSliderActiveChange={setFurnishedSliderActive}
                  furnishedSliderActive={furnishedSliderActive}
                  onResetSliders={resetSliders}
                  slidersCustomized={slidersCustomized}
                />
              ) : null}
              {active === "All" ? (
                <AllTownsDescriptor
                  className={filtersExpanded ? "mt-3" : "mt-1"}
                  towns={allTownsDescriptorStats}
                  aggregateMonthsSupply={aggregateAllTownsMonthsSupply}
                  monthlySalesLoaded={monthlySalesLoaded}
                  filterContext={allTownsFilterContext}
                  contextLeading={filterDescriptorLeading}
                  trailing={
                    showSliderChrome &&
                    collapsedSlidersOpen &&
                    !filtersExpanded ? (
                      <>
                        <IntelFilterDescriptorDot />
                        <button
                          type="button"
                          onClick={hideCollapsedSliders}
                          className="font-mono text-[9px] tracking-[0.12em] uppercase text-white/50 hover:text-gold underline underline-offset-2 decoration-white/20 hover:decoration-gold/50 transition-colors shrink-0 whitespace-nowrap"
                        >
                          Hide sliders
                        </button>
                      </>
                    ) : null
                  }
                />
              ) : (
                <p
                  className={`flex flex-wrap items-baseline gap-x-2 font-mono text-xs tracking-wide transition-[margin] duration-300 ease-out ${
                    filtersExpanded ? "mt-3" : "mt-1"
                  }`}
                >
                  {filterDescriptorLeading}
                  <span className="text-white/45">{TOWN_TAGLINES[active]}</span>
                  <span className="text-white/25" aria-hidden>
                    ·
                  </span>
                  <IntelMonthsSupplyInline
                    monthsSupply={activeTownMonthsSupply}
                    monthlySalesLoaded={monthlySalesLoaded}
                  />
                  {showSliderChrome &&
                  collapsedSlidersOpen &&
                  !filtersExpanded ? (
                    <>
                      <IntelFilterDescriptorDot />
                      <button
                        type="button"
                        onClick={hideCollapsedSliders}
                        className="font-mono text-[9px] tracking-[0.12em] uppercase text-white/50 hover:text-gold underline underline-offset-2 decoration-white/20 hover:decoration-gold/50 transition-colors shrink-0 whitespace-nowrap"
                      >
                        Hide sliders
                      </button>
                    </>
                  ) : null}
                </p>
              )}
            </div>
            <div className="w-full lg:w-[17rem] lg:max-w-[17rem] shrink-0 animate-fade-up">
              <DealOfTheDayFrame
                city={active}
                theme="hero"
                rotateTowns={active === "All"}
                transactionFilter={tx === "all" ? "sale" : tx}
                propertyClass={
                  saleProperty === "multi" || saleProperty === "condos"
                    ? saleProperty
                    : "homes"
                }
                className="w-full"
              />
            </div>
          </div>
        </div>
      </section>

      <section
        className={`bg-cream pb-10 lg:pb-14 transition-[padding] duration-300 ease-out ${
          filtersExpanded ? "pt-4 lg:pt-5" : "pt-2 lg:pt-3"
        }`}
      >
        <div className="mx-auto max-w-7xl xl:max-w-[90rem] px-6 lg:px-10">
          <div className="mb-4 lg:mb-5 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-end gap-x-4 gap-y-1.5 min-w-0">
                <h2 className="font-serif text-2xl sm:text-3xl lg:text-[2rem] text-navy leading-tight">
                  Your {filteredCount.toLocaleString()} of{" "}
                  {poolCount.toLocaleString()}{" "}
                  {poolCount === 1 ? "listing" : "listings"} in{" "}
                  {active === "All" ? "selected towns" : active},{" "}
                  <span className="italic">scored.</span>
                </h2>
                <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold pb-0.5">
                  Intelligent Deals
                </p>
              </div>
              {middleHidden ? (
                <p className="mt-1.5 font-mono text-[11px] tracking-[0.08em] text-slate leading-snug">
                  <span className="text-navy font-medium tabular-nums">
                    {visibleCount.toLocaleString()}
                  </span>
                  {" of "}
                  <span className="text-navy font-medium tabular-nums">
                    {resultCount.toLocaleString()}
                  </span>
                  {" visible"}
                  <span className="text-slate/55">
                    {" · middle tier collapsed ("}
                    {boardTiers.hideableCount.toLocaleString()}
                    {" hidden)"}
                  </span>
                </p>
              ) : null}
            </div>
            {/* Mobile: Live + separate Town stats / Vintages links. Desktop Live lives in the sidebar. */}
            <div className="flex flex-col items-end gap-1.5 shrink-0 lg:hidden pt-0.5">
              <div className="flex items-center gap-2 font-mono text-xs">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${liveStatusDotClass}`}
                />
                <span className="text-slate">{liveStatusLabel}</span>
              </div>
              {liveSnapshots.length > 0 ? (
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.14em] uppercase text-navy/65 hover:text-navy transition-colors"
                  onClick={() => {
                    setVintageStatsOpen(false);
                    setTownStatsOpen(true);
                  }}
                  aria-expanded={townStatsOpen}
                  aria-controls="intel-town-stats-drawer"
                >
                  <svg
                    viewBox="0 0 12 12"
                    className="h-2.5 w-2.5 shrink-0 animate-intel-town-stats-tri"
                    fill="currentColor"
                    aria-hidden
                  >
                    <path d="M8.5 1.2 L2.8 6 L8.5 10.8 Z" />
                  </svg>
                  <span className="underline underline-offset-2 decoration-navy/35">
                    Town stats
                  </span>
                </button>
              ) : null}
              {showVintageStats ? (
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.14em] uppercase text-navy/65 hover:text-navy transition-colors"
                  onClick={() => {
                    setTownStatsOpen(false);
                    setVintageStatsOpen(true);
                  }}
                  aria-expanded={vintageStatsOpen}
                  aria-controls="intel-vintage-stats-drawer"
                >
                  <svg
                    viewBox="0 0 12 12"
                    className="h-2.5 w-2.5 shrink-0 animate-intel-town-stats-tri"
                    fill="currentColor"
                    aria-hidden
                  >
                    <path d="M8.5 1.2 L2.8 6 L8.5 10.8 Z" />
                  </svg>
                  <span className="underline underline-offset-2 decoration-navy/35">
                    Vintages
                  </span>
                </button>
              ) : null}
            </div>
          </div>

          <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_248px] lg:gap-5 lg:items-start">

            {/* Deal board */}
            <div ref={boardRef} id="deal-board" className="min-w-0 scroll-mt-36">
          <DealBoardList
            topRows={boardTiers.top}
            middlePinnedRows={boardTiers.middlePinned}
            middleRows={boardTiers.middleCollapsible}
            bottomRows={boardTiers.bottom}
            canTier={boardTiers.canCollapse}
            middleTierExpanded={effectiveMiddleTierExpanded}
            hideMiddleTierToggle={hideMiddleTierToggle}
            onMiddleTierToggle={() => setMiddleTierExpanded((v) => !v)}
            resultCount={resultCount}
            scoreRankByKey={scoreRankByKey}
            rankTotal={filteredCount}
            isLive={state === "ready"}
            showTown={active === "All"}
            hideOwnershipType={tx === "sale" || tx === "rental"}
            loading={state === "loading" && liveListings === null}
            loadingLabel={`Loading ${active}…`}
            emptyLabel={`No ${active === "All" ? "" : `${active} `}${
              boardStatusFilter === "new"
                ? "new "
                : boardStatusFilter === "reduced"
                  ? "reduced "
                  : boardStatusFilter === "active"
                    ? "active "
                    : ""
            }listings match your current filters.`}
            onResetFilters={() => {
              setTx("all");
              setCls("all");
              setSaleProperty("all");
              setZip(null);
              setBoardStatusFilter("all");
              setMinVintageFilter("0");
              setMaxVintageFilter("6");
            }}
            onScoreClick={(listing) => {
              if (listing.scoreBreakdown) {
                setScoreBreakdownListing(listing as DisplayListing);
                return;
              }
              setScoreInfoOpen(true);
            }}
            onStatusClick={(listing) => {
              if (state === "ready") setHistoryModalListing(listing as DisplayListing);
            }}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={handleSort}
            boardView={boardView}
            onBoardViewChange={setBoardView}
            boardStatusFilter={boardStatusFilter}
            onBoardStatusFilterChange={(value) => {
              setBoardStatusFilter(value);
              setBoardPage(1);
            }}
            onResetSliders={resetSliders}
            slidersCustomized={slidersCustomized}
            scoreInfoButton={
              <ScoreInfoButton onInfoClick={() => setScoreInfoOpen(true)} />
            }
            resultsSummary={
              state === "loading" && liveListings === null ? (
                <p className="font-mono text-[10px] tracking-[0.12em] uppercase text-slate">
                  Loading results…
                </p>
              ) : resultCount === 0 ? (
                <p className="font-mono text-[10px] tracking-[0.12em] uppercase text-slate">
                  No results match your filters
                </p>
              ) : showBoardPagination ? (
                <p className="font-mono text-[10px] tracking-[0.12em] uppercase text-slate">
                  <span className="text-slate/55 normal-case tracking-normal">
                    Page {boardPage} of {totalBoardPages} (
                    {boardPageStart.toLocaleString()}–
                    {boardPageEnd.toLocaleString()} of{" "}
                    {filteredCount.toLocaleString()})
                  </span>
                </p>
              ) : null
            }
            footer={
              <div className="border-t border-charcoal/[0.12] bg-cream/60 px-5 py-3 font-mono text-[10px] tracking-[0.12em] uppercase text-slate">
                {visibleCount.toLocaleString()} of {resultCount.toLocaleString()}{" "}
                {resultCount === 1 ? "listing" : "listings"} in this view
                {middleHidden
                  ? ` · ${boardTiers.hideableCount} in middle tier hidden`
                  : ""}
                {showBoardPagination
                  ? ` · page ${boardPage}/${totalBoardPages} · ${boardPageStart.toLocaleString()}–${boardPageEnd.toLocaleString()} of ${filteredCount.toLocaleString()}`
                  : ""}
              </div>
            }
          />
          {showBoardPagination && (
            <DealBoardPagination
              page={boardPage}
              totalPages={totalBoardPages}
              pageStart={boardPageStart}
              pageEnd={boardPageEnd}
              totalCount={filteredCount}
              onPageChange={(page) => {
                setBoardPage(page);
                scrollToBoard();
              }}
            />
          )}
            </div>{/* end deal board */}

            <aside
              className={`hidden lg:flex lg:flex-col lg:mt-0 lg:w-[248px] lg:justify-self-end lg:shrink-0 lg:self-start ${
                anySnapshotExpanded ? "gap-4" : "gap-2"
              }`}
            >
              <div className="shrink-0 space-y-1">
                <div className="flex items-center justify-end gap-2 font-mono text-xs">
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${liveStatusDotClass}`}
                  />
                  <span className="text-slate">{liveStatusLabel}</span>
                </div>
                {(liveSnapshots.length > 0 || showVintageStats) ? (
                  <p className="text-right font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
                    Stats
                  </p>
                ) : null}
              </div>
              {vintageChartListingRows.length > 0 ? (
                <div className="w-full shrink-0">
                  <IntelligenceVintageMedianMiniChart
                    listings={vintageChartListingRows}
                    kind={tx === "rental" ? "rental" : "sale"}
                    activeBucketId={activeVintageChartBucketId}
                    onBucketClick={(bucketId) => {
                      selectVintageListings(bucketId);
                    }}
                  />
                </div>
              ) : null}
              <div
                id="intel-stats-panel"
                className={anySnapshotExpanded ? "space-y-4" : "space-y-2"}
              >
                {townStatsPanels}
              </div>
            </aside>
          </div>{/* end grid */}
        </div>
      </section>

      <IntelTownStatsDrawer
        open={townStatsOpen}
        onClose={closeTownStats}
        title="Town stats"
        ariaLabel="Town stats"
      >
        <div id="intel-town-stats-drawer" className="space-y-3">
          {townSnapshotPanels}
        </div>
      </IntelTownStatsDrawer>
      <IntelTownStatsDrawer
        open={vintageStatsOpen}
        onClose={closeVintageStats}
        title="Vintages"
        ariaLabel="Vintages"
      >
        <div id="intel-vintage-stats-drawer" className="space-y-3">
          {vintageStatsPanel}
        </div>
      </IntelTownStatsDrawer>
      {scoreBreakdownListing?.scoreBreakdown ? (
        <ListingScoreBreakdownModal
          open
          onClose={() => setScoreBreakdownListing(null)}
          score={scoreBreakdownListing.scoreBreakdown}
          title={scoreBreakdownListing.address}
          subtitle={scoreBreakdownListing.city}
          isRental={scoreBreakdownListing.isRental}
          listingHref={
            state === "ready"
              ? listingDetailHrefForListing({
                  mlsId: scoreBreakdownListing.key,
                  listingKey: scoreBreakdownListing.listingKey,
                  address: {
                    street: scoreBreakdownListing.address,
                    full: scoreBreakdownListing.address,
                  },
                  city: scoreBreakdownListing.city,
                })
              : null
          }
        />
      ) : null}
      {historyModalListing ? (
        <ListingHistoryModal
          open
          onClose={() => setHistoryModalListing(null)}
          mlsId={historyModalListing.key}
          title={historyModalListing.address}
          subtitle={historyModalListing.city}
          townHint={
            active !== "All"
              ? active
              : listingTown(historyModalListing)
          }
          listingHref={
            state === "ready"
              ? listingDetailHrefForListing({
                  mlsId: historyModalListing.key,
                  listingKey: historyModalListing.listingKey,
                  address: {
                    street: historyModalListing.address,
                    full: historyModalListing.address,
                  },
                  city: historyModalListing.city,
                })
              : null
          }
        />
      ) : null}
      <ModalPortal
        open={scoreInfoOpen}
        onClose={() => setScoreInfoOpen(false)}
        ariaLabel="Score methodology"
        zClass="z-[100]"
      >
        <div
          className={MODAL_PANEL_CLASS}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between mb-6">
            <div>
              <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-gold mb-1">
                Methodology
              </p>
              <h2 className="font-serif text-xl sm:text-2xl text-navy">How scores work</h2>
            </div>
            <button
              type="button"
              onClick={() => setScoreInfoOpen(false)}
              className="text-slate hover:text-navy transition-colors font-mono text-lg leading-none mt-1"
              aria-label="Close"
            >
              ×
            </button>
          </div>
          <p className="text-sm text-charcoal leading-relaxed mb-5">
            Each listing receives a Goldilocks composite score (0–100) — the same model used for Deal of the Day:
          </p>
          <ul className="space-y-3 mb-6">
            {[
              { label: "Age", detail: "Year built — newer construction scores higher on its own" },
              { label: "Condition", detail: "Renovation and move-in readiness language in listing remarks" },
              { label: "Finishes", detail: "Material quality, photo depth, and virtual tour availability" },
              { label: "PPSF fit", detail: "Price-per-sqft vs city median — the Goldilocks value band" },
              { label: "Layout", detail: "Bed/bath fit, sqft per bedroom, and floor-plan keywords" },
              { label: "Schools", detail: "School ratings for the listing, with town baselines as fallback" },
              { label: "DOM", detail: "Days on market — mid-range sweet spot scores highest; very new or very stale score lower" },
            ].map((row) => (
              <li key={row.label} className="flex gap-3">
                <span className="w-1.5 h-1.5 rounded-full bg-gold mt-1.5 shrink-0" />
                <div>
                  <span className="font-medium text-navy text-sm">{row.label}</span>
                  <span className="text-slate text-sm"> — {row.detail}</span>
                </div>
              </li>
            ))}
          </ul>
          <p className="text-xs text-slate/70 leading-relaxed border-t border-charcoal/[0.06] pt-4">
            Scores are relative to the current active listings in each city and refresh with each data sync. They are a starting signal, not investment advice.
          </p>
        </div>
      </ModalPortal>
      {hoveredTown && hoveredTownEl ? (
        hoveredTown === "All" ? (
          <ZipBoundaryPopover
            highlightAllTowns
            anchorEl={hoveredTownEl}
          />
        ) : (
          <ZipBoundaryPopover
            highlightTown={hoveredTown}
            anchorEl={hoveredTownEl}
          />
        )
      ) : flashedTown && townFilterAnchorRef.current ? (
        <ZipBoundaryPopover
          highlightTown={flashedTown}
          anchorEl={townFilterAnchorRef.current}
        />
      ) : null}
      {hoveredZip && (
        <ZipBoundaryPopover
          highlightZip={hoveredZip}
          contextZips={availableZips.filter((z) => z !== hoveredZip)}
          anchorEl={hoveredZipEl}
        />
      )}
    </>
  );
}

function ScoreInfoButton({ onInfoClick }: { onInfoClick: () => void }) {
  const [tipPos, setTipPos] = useState<{
    left: number;
    top: number;
    placeAbove: boolean;
  } | null>(null);
  const ref = useRef<HTMLSpanElement>(null);

  function showTip() {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const tipW = 224; // w-56
    const tipH = 96;
    const pad = 8;
    const placeAbove = r.top >= tipH + pad;
    const left = Math.min(
      Math.max(pad, r.left + r.width / 2 - tipW / 2),
      window.innerWidth - tipW - pad,
    );
    const top = placeAbove ? r.top - pad : r.bottom + pad;
    setTipPos({ left, top, placeAbove });
  }

  return (
    <span
      ref={ref}
      className="inline-flex items-center"
      onMouseEnter={showTip}
      onMouseLeave={() => setTipPos(null)}
    >
      <button
        type="button"
        onClick={onInfoClick}
        className="text-slate hover:text-charcoal transition-colors font-mono"
        aria-label="How scores are calculated"
      >
        *
      </button>
      {tipPos && typeof document !== "undefined" && createPortal(
        <div
          role="tooltip"
          className="pointer-events-none fixed z-[9999] w-56 rounded-xl bg-navy text-white text-[11px] leading-relaxed px-3.5 py-2.5 shadow-xl normal-case tracking-normal font-sans"
          style={{
            left: tipPos.left,
            top: tipPos.top,
            transform: tipPos.placeAbove ? "translateY(-100%)" : undefined,
          }}
        >
          A 0–100 Goldilocks composite — age, condition, finishes, PPSF fit, layout, schools, and DOM — ranked against peers in each town.
          <span
            className={`absolute left-1/2 -translate-x-1/2 border-4 border-transparent ${
              tipPos.placeAbove
                ? "top-full border-t-navy"
                : "bottom-full border-b-navy"
            }`}
          />
        </div>,
        document.body,
      )}
    </span>
  );
}

// Beds + Yr built in the left column; Baths + Sq feet share the right column.
function BedBathVintageSqftRow({
  onBedSliderActiveChange,
  onBathSliderActiveChange,
  onVintageSliderActiveChange,
  onSqftSliderActiveChange,
  onFurnishedSliderActiveChange,
  minBedrooms,
  maxBedrooms,
  onMinBedroomsChange,
  onMaxBedroomsChange,
  minBathrooms,
  maxBathrooms,
  onMinBathroomsChange,
  onMaxBathroomsChange,
  minVintage,
  maxVintage,
  onMinVintageChange,
  onMaxVintageChange,
  boardSqftSteps,
  minSqftIndex,
  maxSqftIndex,
  onMinSqftIndexChange,
  onMaxSqftIndexChange,
  showFurnished,
  furnishedFilter,
  onFurnishedFilterChange,
}: {
  onBedSliderActiveChange: (active: boolean) => void;
  onBathSliderActiveChange: (active: boolean) => void;
  onVintageSliderActiveChange: (active: boolean) => void;
  onSqftSliderActiveChange: (active: boolean) => void;
  onFurnishedSliderActiveChange: (active: boolean) => void;
  minBedrooms: number;
  maxBedrooms: number;
  onMinBedroomsChange: (value: number) => void;
  onMaxBedroomsChange: (value: number) => void;
  minBathrooms: number;
  maxBathrooms: number;
  onMinBathroomsChange: (value: number) => void;
  onMaxBathroomsChange: (value: number) => void;
  minVintage: number;
  maxVintage: number;
  onMinVintageChange: (value: number) => void;
  onMaxVintageChange: (value: number) => void;
  boardSqftSteps: readonly number[];
  minSqftIndex: number;
  maxSqftIndex: number;
  onMinSqftIndexChange: (index: number) => void;
  onMaxSqftIndexChange: (index: number) => void;
  showFurnished: boolean;
  furnishedFilter: FurnishedFilter;
  onFurnishedFilterChange: (value: FurnishedFilter) => void;
}) {
  return (
    <>
      <div className="flex items-center gap-1 shrink-0 w-fit">
        <IntelDualSlider
          label="Beds"
          maxIndex={BED_BATH_MAX}
          minValue={minBedrooms}
          maxValue={maxBedrooms}
          onMinChange={onMinBedroomsChange}
          onMaxChange={onMaxBedroomsChange}
          onActiveChange={onBedSliderActiveChange}
          minAriaLabel="Minimum bedrooms"
          maxAriaLabel="Maximum bedrooms"
        />
        <IntelDualSlider
          label="Baths"
          maxIndex={BED_BATH_MAX}
          minValue={minBathrooms}
          maxValue={maxBathrooms}
          onMinChange={onMinBathroomsChange}
          onMaxChange={onMaxBathroomsChange}
          onActiveChange={onBathSliderActiveChange}
          minAriaLabel="Minimum bathrooms"
          maxAriaLabel="Maximum bathrooms"
        />
      </div>
      <div className="flex items-start gap-1 shrink-0 w-fit">
        <div className="flex flex-col gap-1">
          <IntelDualSlider
            label="Yr built"
            maxIndex={VINTAGE_FILTER_MAX}
            minValue={minVintage}
            maxValue={maxVintage}
            onMinChange={onMinVintageChange}
            onMaxChange={onMaxVintageChange}
            onActiveChange={onVintageSliderActiveChange}
            minAriaLabel="Minimum vintage era"
            maxAriaLabel="Maximum vintage era"
          />
          {showFurnished ? (
            <IntelDiscreteSlider
              label="Furnish"
              maxIndex={FURNISHED_SLIDER_MAX}
              value={furnishedFilterIndex(furnishedFilter)}
              onChange={(index) =>
                onFurnishedFilterChange(furnishedFilterFromIndex(index))
              }
              onActiveChange={onFurnishedSliderActiveChange}
              ariaLabel="Furnished filter"
              valueText={formatFurnishedFilterLabel(furnishedFilter)}
              showCenterLabelWhen={(index) => index === 0}
            />
          ) : null}
        </div>
        <SqftRangeSlider
          label="Sq feet"
          steps={boardSqftSteps}
          minIndex={minSqftIndex}
          maxIndex={maxSqftIndex}
          onMinIndexChange={onMinSqftIndexChange}
          onMaxIndexChange={onMaxSqftIndexChange}
          onActiveChange={onSqftSliderActiveChange}
        />
      </div>
    </>
  );
}

function PriceRangeLabel({
  steps,
  minIndex,
  maxIndex,
  active,
  onClick,
}: {
  steps: readonly number[];
  minIndex: number;
  maxIndex: number;
  active: boolean;
  onClick?: () => void;
}) {
  const lo = Math.min(minIndex, maxIndex);
  const hi = Math.max(minIndex, maxIndex);
  const interactive = onClick != null;
  const className = descriptorLabelClass(active, interactive);

  if (interactive) {
    return (
      <button type="button" onClick={onClick} className={className}>
        {formatIntelPriceRangeLabelFromSteps(steps, lo, hi)}
      </button>
    );
  }

  return (
    <span className={className}>
      {formatIntelPriceRangeLabelFromSteps(steps, lo, hi)}
    </span>
  );
}

function BedroomLabel({
  min,
  max,
  active,
  onClick,
}: {
  min: number;
  max: number;
  active: boolean;
  onClick?: () => void;
}) {
  const interactive = onClick != null;
  const className = descriptorLabelClass(active, interactive);
  const label = formatBedBathRangeLabel(min, max, "Bed");

  if (interactive) {
    return (
      <button type="button" onClick={onClick} className={className}>
        {label}
      </button>
    );
  }

  return <span className={className}>{label}</span>;
}

function BathroomLabel({
  min,
  max,
  active,
  onClick,
}: {
  min: number;
  max: number;
  active: boolean;
  onClick?: () => void;
}) {
  const interactive = onClick != null;
  const className = descriptorLabelClass(active, interactive);
  const label = formatBedBathRangeLabel(min, max, "Bath");

  if (interactive) {
    return (
      <button type="button" onClick={onClick} className={className}>
        {label}
      </button>
    );
  }

  return <span className={className}>{label}</span>;
}

function VintageLabel({
  min,
  max,
  active,
  onClick,
}: {
  min: number;
  max: number;
  active: boolean;
  onClick?: () => void;
}) {
  const interactive = onClick != null;
  const className = descriptorLabelClass(active, interactive);
  const label = formatVintageRangeLabel(min, max);

  if (interactive) {
    return (
      <button type="button" onClick={onClick} className={className}>
        {label}
      </button>
    );
  }

  return <span className={className}>{label}</span>;
}

function SqftRangeLabel({
  steps,
  minIndex,
  maxIndex,
  active,
  onClick,
}: {
  steps: readonly number[];
  minIndex: number;
  maxIndex: number;
  active: boolean;
  onClick?: () => void;
}) {
  const lo = Math.min(minIndex, maxIndex);
  const hi = Math.max(minIndex, maxIndex);
  const interactive = onClick != null;
  const className = descriptorLabelClass(active, interactive);
  const label = formatIntelSqftRangeLabelFromSteps(steps, lo, hi);

  if (interactive) {
    return (
      <button type="button" onClick={onClick} className={className}>
        {label}
      </button>
    );
  }

  return <span className={className}>{label}</span>;
}

function DescriptorSearchIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  );
}

function DescriptorSearchControl({
  active,
  onClick,
}: {
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Open filter sliders"
      className={`inline-flex shrink-0 self-center text-gold drop-shadow-sm transition-all duration-300 ease-out ${
        active ? "opacity-100 scale-110" : "opacity-95 scale-100"
      } cursor-pointer hover:text-gold-light`}
    >
      <DescriptorSearchIcon className={active ? "h-5 w-5" : "h-4 w-4"} />
    </button>
  );
}

function IntelFilterDescriptorDot() {
  return (
    <span className="text-white/25" aria-hidden>
      ·
    </span>
  );
}

function FurnishedLabel({
  value,
  active,
  onClick,
}: {
  value: FurnishedFilter;
  active: boolean;
  onClick?: () => void;
}) {
  const interactive = onClick != null;
  const className = descriptorLabelClass(active, interactive);
  const label = formatFurnishedFilterLabel(value);

  if (interactive) {
    return (
      <button type="button" onClick={onClick} className={className}>
        {label}
      </button>
    );
  }

  return <span className={className}>{label}</span>;
}

type IntelSliderDescriptorLabelsProps = {
  showPriceFilter: boolean;
  cls: ClsFilter;
  showFurnished?: boolean;
  furnishedFilter?: FurnishedFilter;
  furnishedSliderActive?: boolean;
  onDescriptorClick: (kind: IntelSliderKind) => void;
  boardPriceSteps: readonly number[];
  minPriceIndex: number;
  maxPriceIndex: number;
  priceSliderActive: boolean;
  minBedrooms: number;
  maxBedrooms: number;
  minBathrooms: number;
  maxBathrooms: number;
  minVintage: number;
  maxVintage: number;
  boardSqftSteps: readonly number[];
  minSqftIndex: number;
  maxSqftIndex: number;
  bedSliderActive: boolean;
  bathSliderActive: boolean;
  vintageSliderActive: boolean;
  sqftSliderActive: boolean;
  withLeadingSeparator?: boolean;
};

function IntelSliderDescriptorLabels({
  showPriceFilter,
  cls,
  showFurnished = false,
  furnishedFilter = "all",
  furnishedSliderActive = false,
  onDescriptorClick,
  boardPriceSteps,
  minPriceIndex,
  maxPriceIndex,
  priceSliderActive,
  minBedrooms,
  maxBedrooms,
  minBathrooms,
  maxBathrooms,
  minVintage,
  maxVintage,
  boardSqftSteps,
  minSqftIndex,
  maxSqftIndex,
  bedSliderActive,
  bathSliderActive,
  vintageSliderActive,
  sqftSliderActive,
  withLeadingSeparator = false,
}: IntelSliderDescriptorLabelsProps) {
  if (!showPriceFilter && cls === "commercial" && !showFurnished) return null;

  const leadingDot = withLeadingSeparator;
  const showResidentialSliders = cls !== "commercial";
  const searchActive =
    priceSliderActive ||
    bedSliderActive ||
    bathSliderActive ||
    vintageSliderActive ||
    sqftSliderActive ||
    furnishedSliderActive;
  const openViaSearch = () =>
    onDescriptorClick(
      showResidentialSliders
        ? "sqft"
        : showPriceFilter
          ? "price"
          : "furnished",
    );

  return (
    <>
      {leadingDot ? <IntelFilterDescriptorDot /> : null}
      {showPriceFilter ? (
        <PriceRangeLabel
            steps={boardPriceSteps}
            minIndex={minPriceIndex}
            maxIndex={maxPriceIndex}
            active={priceSliderActive}
            onClick={() => onDescriptorClick("price")}
          />
      ) : null}
      {showResidentialSliders ? (
        <>
          {showPriceFilter ? <IntelFilterDescriptorDot /> : null}
          <BedroomLabel
            min={minBedrooms}
            max={maxBedrooms}
            active={bedSliderActive}
            onClick={() => onDescriptorClick("bed")}
          />
          <IntelFilterDescriptorDot />
          <BathroomLabel
            min={minBathrooms}
            max={maxBathrooms}
            active={bathSliderActive}
            onClick={() => onDescriptorClick("bath")}
          />
          <IntelFilterDescriptorDot />
          <VintageLabel
            min={minVintage}
            max={maxVintage}
            active={vintageSliderActive}
            onClick={() => onDescriptorClick("vintage")}
          />
          <IntelFilterDescriptorDot />
          <SqftRangeLabel
            steps={boardSqftSteps}
            minIndex={minSqftIndex}
            maxIndex={maxSqftIndex}
            active={sqftSliderActive}
            onClick={() => onDescriptorClick("sqft")}
          />
        </>
      ) : null}
      {showFurnished ? (
        <>
          {showPriceFilter || showResidentialSliders ? (
            <IntelFilterDescriptorDot />
          ) : null}
          <FurnishedLabel
            value={furnishedFilter}
            active={furnishedSliderActive}
            onClick={() => onDescriptorClick("furnished")}
          />
        </>
      ) : null}
      {/* Always trailing — right of whatever descriptors are showing. */}
      <DescriptorSearchControl active={searchActive} onClick={openViaSearch} />
    </>
  );
}

function IntelFilterControlsRow({
  filtersExpanded,
  showPriceFilter,
  cls,
  collapsedSlidersOpen,
  boardPriceSteps,
  minPriceIndex,
  maxPriceIndex,
  onMinPriceIndexChange,
  onMaxPriceIndexChange,
  onPriceSliderActiveChange,
  priceSliderActive,
  minBedrooms,
  maxBedrooms,
  onMinBedroomsChange,
  onMaxBedroomsChange,
  minBathrooms,
  maxBathrooms,
  onMinBathroomsChange,
  onMaxBathroomsChange,
  minVintage,
  maxVintage,
  onMinVintageChange,
  onMaxVintageChange,
  onBedSliderActiveChange,
  onBathSliderActiveChange,
  onVintageSliderActiveChange,
  onSqftSliderActiveChange,
  boardSqftSteps,
  minSqftIndex,
  maxSqftIndex,
  onMinSqftIndexChange,
  onMaxSqftIndexChange,
  bedSliderActive,
  bathSliderActive,
  vintageSliderActive,
  sqftSliderActive,
  showFurnished,
  furnishedFilter,
  onFurnishedFilterChange,
  onFurnishedSliderActiveChange,
  furnishedSliderActive,
  onResetSliders,
  slidersCustomized,
}: {
  filtersExpanded: boolean;
  showPriceFilter: boolean;
  cls: ClsFilter;
  collapsedSlidersOpen: boolean;
  boardPriceSteps: readonly number[];
  minPriceIndex: number;
  maxPriceIndex: number;
  onMinPriceIndexChange: (index: number) => void;
  onMaxPriceIndexChange: (index: number) => void;
  onPriceSliderActiveChange: (active: boolean) => void;
  priceSliderActive: boolean;
  minBedrooms: number;
  maxBedrooms: number;
  onMinBedroomsChange: (value: number) => void;
  onMaxBedroomsChange: (value: number) => void;
  minBathrooms: number;
  maxBathrooms: number;
  onMinBathroomsChange: (value: number) => void;
  onMaxBathroomsChange: (value: number) => void;
  minVintage: number;
  maxVintage: number;
  onMinVintageChange: (value: number) => void;
  onMaxVintageChange: (value: number) => void;
  onBedSliderActiveChange: (active: boolean) => void;
  onBathSliderActiveChange: (active: boolean) => void;
  onVintageSliderActiveChange: (active: boolean) => void;
  onSqftSliderActiveChange: (active: boolean) => void;
  boardSqftSteps: readonly number[];
  minSqftIndex: number;
  maxSqftIndex: number;
  onMinSqftIndexChange: (index: number) => void;
  onMaxSqftIndexChange: (index: number) => void;
  bedSliderActive: boolean;
  bathSliderActive: boolean;
  vintageSliderActive: boolean;
  sqftSliderActive: boolean;
  showFurnished: boolean;
  furnishedFilter: FurnishedFilter;
  onFurnishedFilterChange: (value: FurnishedFilter) => void;
  onFurnishedSliderActiveChange: (active: boolean) => void;
  furnishedSliderActive: boolean;
  onResetSliders: () => void;
  slidersCustomized: boolean;
}) {
  if (!showPriceFilter && cls === "commercial" && !showFurnished) return null;

  const rowClass = `flex flex-wrap items-start gap-2 w-full min-w-0 self-start font-mono text-xs tracking-wide ${
    filtersExpanded ? "mt-1.5" : "mt-1"
  }`;

  const sliderPanel = (
    <div className="flex flex-col gap-y-1">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {showPriceFilter ? (
          <div className="flex items-center gap-1 shrink-0">
            <PriceRangeSlider
              label="Price"
              steps={boardPriceSteps}
              minIndex={minPriceIndex}
              maxIndex={maxPriceIndex}
              onMinIndexChange={onMinPriceIndexChange}
              onMaxIndexChange={onMaxPriceIndexChange}
              onActiveChange={onPriceSliderActiveChange}
            />
            <PriceRangeInputs
              steps={boardPriceSteps}
              minIndex={minPriceIndex}
              maxIndex={maxPriceIndex}
              onMinIndexChange={onMinPriceIndexChange}
              onMaxIndexChange={onMaxPriceIndexChange}
              onActiveChange={onPriceSliderActiveChange}
            />
          </div>
        ) : null}
        <FilterResetButton
          onClick={onResetSliders}
          disabled={!slidersCustomized}
          label="Reset sliders"
        />
      </div>
      {cls !== "commercial" ? (
        <BedBathVintageSqftRow
          onBedSliderActiveChange={onBedSliderActiveChange}
          onBathSliderActiveChange={onBathSliderActiveChange}
          onVintageSliderActiveChange={onVintageSliderActiveChange}
          onSqftSliderActiveChange={onSqftSliderActiveChange}
          onFurnishedSliderActiveChange={onFurnishedSliderActiveChange}
          minBedrooms={minBedrooms}
          maxBedrooms={maxBedrooms}
          onMinBedroomsChange={onMinBedroomsChange}
          onMaxBedroomsChange={onMaxBedroomsChange}
          minBathrooms={minBathrooms}
          maxBathrooms={maxBathrooms}
          onMinBathroomsChange={onMinBathroomsChange}
          onMaxBathroomsChange={onMaxBathroomsChange}
          minVintage={minVintage}
          maxVintage={maxVintage}
          onMinVintageChange={onMinVintageChange}
          onMaxVintageChange={onMaxVintageChange}
          boardSqftSteps={boardSqftSteps}
          minSqftIndex={minSqftIndex}
          maxSqftIndex={maxSqftIndex}
          onMinSqftIndexChange={onMinSqftIndexChange}
          onMaxSqftIndexChange={onMaxSqftIndexChange}
          showFurnished={showFurnished}
          furnishedFilter={furnishedFilter}
          onFurnishedFilterChange={onFurnishedFilterChange}
        />
      ) : showFurnished ? (
        <IntelDiscreteSlider
          label="Furnish"
          maxIndex={FURNISHED_SLIDER_MAX}
          value={furnishedFilterIndex(furnishedFilter)}
          onChange={(index) =>
            onFurnishedFilterChange(furnishedFilterFromIndex(index))
          }
          onActiveChange={onFurnishedSliderActiveChange}
          ariaLabel="Furnished filter"
          valueText={formatFurnishedFilterLabel(furnishedFilter)}
          showCenterLabelWhen={(index) => index === 0}
        />
      ) : null}
    </div>
  );

  if (filtersExpanded) {
    return <div className={rowClass}>{sliderPanel}</div>;
  }

  if (!collapsedSlidersOpen) return null;

  return (
    <div className={rowClass} data-intel-slider-panel>
      {sliderPanel}
    </div>
  );
}

function IntelDualSlider({
  label,
  maxIndex,
  minValue,
  maxValue,
  onMinChange,
  onMaxChange,
  onActiveChange,
  minAriaLabel,
  maxAriaLabel,
  widthClass = INTEL_SLIDER_WIDTH_CLASS,
}: {
  label?: string;
  maxIndex: number;
  minValue: number;
  maxValue: number;
  onMinChange: (value: number) => void;
  onMaxChange: (value: number) => void;
  onActiveChange: (active: boolean) => void;
  minAriaLabel: string;
  maxAriaLabel: string;
  widthClass?: string;
}) {
  const [active, setActive] = useState(false);
  const lo = Math.min(minValue, maxValue);
  const hi = Math.max(minValue, maxValue);
  const disabled = maxIndex <= 0;

  const setSliderActive = (next: boolean) => {
    setActive(next);
    onActiveChange(next);
  };

  useEffect(() => {
    if (!active) return;
    const stop = () => setSliderActive(false);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    window.addEventListener("keyup", stop);
    return () => {
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      window.removeEventListener("keyup", stop);
    };
  }, [active]);

  // Show the category label on the bar only while the range spans its full
  // extent (i.e. untouched / just reset). Any inward drag hides it.
  const atFullRange = lo <= 0 && hi >= maxIndex;
  return (
    <div className="flex items-center shrink-0">
      <div className={`relative h-6 ${widthClass} shrink-0`}>
        <div
          aria-hidden
          className="pointer-events-none absolute left-0 right-0 top-1/2 h-2.5 -translate-y-1/2 rounded-full bg-white/20"
        />
        {label && atFullRange ? (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center font-mono text-[10px] font-medium leading-none tracking-[0.14em] uppercase text-white/75"
          >
            {label}
          </span>
        ) : null}
        <input
          type="range"
          min={0}
          max={maxIndex}
          step={1}
          value={lo}
          disabled={disabled}
          onChange={(e) => {
            const next = Number(e.target.value);
            const clamped = Math.min(next, hi);
            if (clamped !== lo) setSliderActive(true);
            onMinChange(clamped);
          }}
          className="intel-price-range absolute inset-0 z-20 h-6 w-full cursor-pointer appearance-none bg-transparent accent-[#C8A951] disabled:opacity-40"
          aria-label={minAriaLabel}
          aria-valuemin={0}
          aria-valuemax={maxIndex}
          aria-valuenow={lo}
        />
        <input
          type="range"
          min={0}
          max={maxIndex}
          step={1}
          value={hi}
          disabled={disabled}
          onChange={(e) => {
            const next = Number(e.target.value);
            const clamped = Math.max(next, lo);
            if (clamped !== hi) setSliderActive(true);
            onMaxChange(clamped);
          }}
          className="intel-price-range absolute inset-0 z-30 h-6 w-full cursor-pointer appearance-none bg-transparent accent-[#C8A951] disabled:opacity-40"
          aria-label={maxAriaLabel}
          aria-valuemin={0}
          aria-valuemax={maxIndex}
          aria-valuenow={hi}
        />
      </div>
    </div>
  );
}

/** Single-thumb discrete slider (e.g. Furnished filter steps). */
function IntelDiscreteSlider({
  label,
  maxIndex,
  value,
  onChange,
  onActiveChange,
  ariaLabel,
  valueText,
  showCenterLabelWhen,
  widthClass = INTEL_SLIDER_WIDTH_CLASS,
}: {
  label?: string;
  maxIndex: number;
  value: number;
  onChange: (value: number) => void;
  onActiveChange: (active: boolean) => void;
  ariaLabel: string;
  valueText?: string;
  showCenterLabelWhen?: (value: number) => boolean;
  widthClass?: string;
}) {
  const [active, setActive] = useState(false);
  const clamped = Math.max(0, Math.min(maxIndex, value));
  const disabled = maxIndex <= 0;
  const showLabel =
    Boolean(label) &&
    (showCenterLabelWhen ? showCenterLabelWhen(clamped) : clamped === 0);

  const setSliderActive = (next: boolean) => {
    setActive(next);
    onActiveChange(next);
  };

  useEffect(() => {
    if (!active) return;
    const stop = () => setSliderActive(false);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    window.addEventListener("keyup", stop);
    return () => {
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      window.removeEventListener("keyup", stop);
    };
  }, [active]);

  return (
    <div className="flex items-center shrink-0">
      <div className={`relative h-6 ${widthClass} shrink-0`}>
        <div
          aria-hidden
          className="pointer-events-none absolute left-0 right-0 top-1/2 h-2.5 -translate-y-1/2 rounded-full bg-white/20"
        />
        {showLabel ? (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center font-mono text-[10px] font-medium leading-none tracking-[0.14em] uppercase text-white/75"
          >
            {label}
          </span>
        ) : null}
        <input
          type="range"
          min={0}
          max={maxIndex}
          step={1}
          value={clamped}
          disabled={disabled}
          onChange={(e) => {
            const next = Number(e.target.value);
            if (next !== clamped) setSliderActive(true);
            onChange(next);
          }}
          className="intel-price-range absolute inset-0 z-20 h-6 w-full cursor-pointer appearance-none bg-transparent accent-[#C8A951] disabled:opacity-40"
          aria-label={ariaLabel}
          aria-valuemin={0}
          aria-valuemax={maxIndex}
          aria-valuenow={clamped}
          aria-valuetext={valueText}
        />
      </div>
    </div>
  );
}

function PriceRangeSlider({
  label,
  steps,
  minIndex,
  maxIndex,
  onMinIndexChange,
  onMaxIndexChange,
  onActiveChange,
}: {
  label?: string;
  steps: readonly number[];
  minIndex: number;
  maxIndex: number;
  onMinIndexChange: (value: number) => void;
  onMaxIndexChange: (value: number) => void;
  onActiveChange: (active: boolean) => void;
}) {
  const [active, setActive] = useState(false);
  const maxStepIndex = boardPriceMaxIndex(steps);
  const lo = Math.min(minIndex, maxIndex);
  const hi = Math.max(minIndex, maxIndex);
  const disabled = maxStepIndex <= 0;

  const setSliderActive = (next: boolean) => {
    setActive(next);
    onActiveChange(next);
  };

  useEffect(() => {
    if (!active) return;
    const stop = () => setSliderActive(false);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    window.addEventListener("keyup", stop);
    return () => {
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      window.removeEventListener("keyup", stop);
    };
  }, [active]);

  // Label shows only while the price range spans its full extent (untouched /
  // just reset); dragging either thumb inward hides it.
  const atFullRange = lo <= 0 && hi >= maxStepIndex;
  return (
    <div className="flex flex-col items-stretch shrink-0">
      <div className={`relative h-6 ${INTEL_SLIDER_WIDTH_CLASS} shrink-0`}>
        <div
          aria-hidden
          className="pointer-events-none absolute left-0 right-0 top-1/2 h-2.5 -translate-y-1/2 rounded-full bg-white/20"
        />
        {label && atFullRange ? (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center font-mono text-[10px] font-medium leading-none tracking-[0.14em] uppercase text-white/75"
          >
            {label}
          </span>
        ) : null}
        <input
          type="range"
          min={0}
          max={maxStepIndex}
          step={1}
          value={lo}
          disabled={disabled}
          onChange={(e) => {
            const next = Number(e.target.value);
            const clamped = Math.min(next, hi);
            if (clamped !== lo) setSliderActive(true);
            onMinIndexChange(clamped);
          }}
          className="intel-price-range absolute inset-0 z-20 h-6 w-full cursor-pointer appearance-none bg-transparent accent-[#C8A951] disabled:opacity-40"
          aria-label="Minimum price"
          aria-valuemin={0}
          aria-valuemax={maxStepIndex}
          aria-valuenow={lo}
        />
        <input
          type="range"
          min={0}
          max={maxStepIndex}
          step={1}
          value={hi}
          disabled={disabled}
          onChange={(e) => {
            const next = Number(e.target.value);
            const clamped = Math.max(next, lo);
            if (clamped !== hi) setSliderActive(true);
            onMaxIndexChange(clamped);
          }}
          className="intel-price-range absolute inset-0 z-30 h-6 w-full cursor-pointer appearance-none bg-transparent accent-[#C8A951] disabled:opacity-40"
          aria-label="Maximum price"
          aria-valuemin={0}
          aria-valuemax={maxStepIndex}
          aria-valuenow={hi}
        />
      </div>
    </div>
  );
}

function SqftRangeSlider({
  label,
  steps,
  minIndex,
  maxIndex,
  onMinIndexChange,
  onMaxIndexChange,
  onActiveChange,
}: {
  label?: string;
  steps: readonly number[];
  minIndex: number;
  maxIndex: number;
  onMinIndexChange: (value: number) => void;
  onMaxIndexChange: (value: number) => void;
  onActiveChange: (active: boolean) => void;
}) {
  const [active, setActive] = useState(false);
  const maxStepIndex = boardSqftMaxIndex(steps);
  const lo = Math.min(minIndex, maxIndex);
  const hi = Math.max(minIndex, maxIndex);
  const disabled = maxStepIndex <= 0;

  const setSliderActive = (next: boolean) => {
    setActive(next);
    onActiveChange(next);
  };

  useEffect(() => {
    if (!active) return;
    const stop = () => setSliderActive(false);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    window.addEventListener("keyup", stop);
    return () => {
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      window.removeEventListener("keyup", stop);
    };
  }, [active]);

  const atFullRange = lo <= 0 && hi >= maxStepIndex;
  return (
    <div className="flex flex-col items-stretch shrink-0">
      <div className={`relative h-6 ${INTEL_SLIDER_WIDTH_CLASS} shrink-0`}>
        <div
          aria-hidden
          className="pointer-events-none absolute left-0 right-0 top-1/2 h-2.5 -translate-y-1/2 rounded-full bg-white/20"
        />
        {label && atFullRange ? (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center font-mono text-[10px] font-medium leading-none tracking-[0.14em] uppercase text-white/75"
          >
            {label}
          </span>
        ) : null}
        <input
          type="range"
          min={0}
          max={maxStepIndex}
          step={1}
          value={lo}
          disabled={disabled}
          onChange={(e) => {
            const next = Number(e.target.value);
            const clamped = Math.min(next, hi);
            if (clamped !== lo) setSliderActive(true);
            onMinIndexChange(clamped);
          }}
          className="intel-price-range absolute inset-0 z-20 h-6 w-full cursor-pointer appearance-none bg-transparent accent-[#C8A951] disabled:opacity-40"
          aria-label="Minimum square feet"
          aria-valuemin={0}
          aria-valuemax={maxStepIndex}
          aria-valuenow={lo}
        />
        <input
          type="range"
          min={0}
          max={maxStepIndex}
          step={1}
          value={hi}
          disabled={disabled}
          onChange={(e) => {
            const next = Number(e.target.value);
            const clamped = Math.max(next, lo);
            if (clamped !== hi) setSliderActive(true);
            onMaxIndexChange(clamped);
          }}
          className="intel-price-range absolute inset-0 z-30 h-6 w-full cursor-pointer appearance-none bg-transparent accent-[#C8A951] disabled:opacity-40"
          aria-label="Maximum square feet"
          aria-valuemin={0}
          aria-valuemax={maxStepIndex}
          aria-valuenow={hi}
        />
      </div>
    </div>
  );
}

/** Keep number-pad friendly drafts; allow optional trailing K/M (desktop / paste). */
function sanitizeIntelPriceDraft(raw: string): string {
  const cleaned = raw.replace(/[^0-9.kKmM]/g, "");
  const suffix = /[kKmM]$/.test(cleaned) ? cleaned.slice(-1) : "";
  const body = (suffix ? cleaned.slice(0, -1) : cleaned).replace(/[kKmM]/g, "");
  const dot = body.indexOf(".");
  const normalized =
    dot === -1
      ? body
      : `${body.slice(0, dot + 1)}${body.slice(dot + 1).replace(/\./g, "")}`;
  return `${normalized}${suffix}`;
}

function PriceRangeInputs({
  steps,
  minIndex,
  maxIndex,
  onMinIndexChange,
  onMaxIndexChange,
  onActiveChange,
}: {
  steps: readonly number[];
  minIndex: number;
  maxIndex: number;
  onMinIndexChange: (value: number) => void;
  onMaxIndexChange: (value: number) => void;
  onActiveChange: (active: boolean) => void;
}) {
  const [minDraft, setMinDraft] = useState<string | null>(null);
  const [maxDraft, setMaxDraft] = useState<string | null>(null);
  const [focusedBound, setFocusedBound] = useState<"min" | "max" | null>(null);
  const [boundNote, setBoundNote] = useState<string | null>(null);
  const boundNoteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxStepIndex = boardPriceMaxIndex(steps);
  const lo = Math.min(minIndex, maxIndex);
  const hi = Math.max(minIndex, maxIndex);
  const disabled = maxStepIndex <= 0;
  const minPrice = steps[lo] ?? 0;
  const maxPrice = steps[hi] ?? steps[maxStepIndex] ?? 0;
  const priceFloor = steps[0] ?? 0;
  const priceCeiling = steps[maxStepIndex] ?? 0;

  const clearBoundNoteTimer = () => {
    if (boundNoteTimerRef.current != null) {
      clearTimeout(boundNoteTimerRef.current);
      boundNoteTimerRef.current = null;
    }
  };

  const showBoundNote = (message: string) => {
    clearBoundNoteTimer();
    setBoundNote(message);
    boundNoteTimerRef.current = setTimeout(() => {
      setBoundNote(null);
      boundNoteTimerRef.current = null;
    }, 10_000);
  };

  useEffect(() => () => clearBoundNoteTimer(), []);

  const setSliderActive = (next: boolean) => {
    onActiveChange(next);
  };

  const commitMinPrice = (raw: string) => {
    setMinDraft(null);
    const trimmed = raw.trim();
    if (!trimmed) return;
    const parsed = parseIntelPriceInput(raw);
    if (parsed == null) {
      showBoundNote(
        "Lower price isn’t valid — use dollars, or a number with K/M (e.g. 750k or 1.2m).",
      );
      return;
    }
    const upperCap = steps[hi] ?? parsed;
    if (parsed < priceFloor) {
      showBoundNote(
        `Lower price can’t be below ${formatIntelPriceStep(priceFloor)} (lowest on this board).`,
      );
    } else if (parsed > upperCap) {
      showBoundNote(
        `Lower price can’t be above the upper bound (${formatIntelPriceStep(upperCap)}).`,
      );
    } else if (parsed > priceCeiling) {
      showBoundNote(
        `Lower price can’t be above ${formatIntelPriceStep(priceCeiling)} (highest on this board).`,
      );
    } else {
      clearBoundNoteTimer();
      setBoundNote(null);
    }
    const clamped = Math.max(priceFloor, Math.min(parsed, upperCap));
    const index = minPriceToStepIndex(clamped, steps);
    const finalIndex = Math.min(index, hi);
    if (finalIndex !== lo) setSliderActive(true);
    onMinIndexChange(finalIndex);
  };

  const commitMaxPrice = (raw: string) => {
    setMaxDraft(null);
    const trimmed = raw.trim();
    if (!trimmed) return;
    const parsed = parseIntelPriceInput(raw);
    if (parsed == null) {
      showBoundNote(
        "Upper price isn’t valid — use dollars, or a number with K/M (e.g. 750k or 1.2m).",
      );
      return;
    }
    const lowerCap = steps[lo] ?? parsed;
    if (parsed > priceCeiling) {
      showBoundNote(
        `Upper price can’t be above ${formatIntelPriceStep(priceCeiling)} (highest on this board).`,
      );
    } else if (parsed < lowerCap) {
      showBoundNote(
        `Upper price can’t be below the lower bound (${formatIntelPriceStep(lowerCap)}).`,
      );
    } else if (parsed < priceFloor) {
      showBoundNote(
        `Upper price can’t be below ${formatIntelPriceStep(priceFloor)} (lowest on this board).`,
      );
    } else {
      clearBoundNoteTimer();
      setBoundNote(null);
    }
    const clamped = Math.min(priceCeiling, Math.max(parsed, lowerCap));
    const index = maxPriceToStepIndex(clamped, steps);
    const finalIndex = Math.max(index, lo);
    if (finalIndex !== hi) setSliderActive(true);
    onMaxIndexChange(finalIndex);
  };

  /** Mobile number pad has no letters — K/M buttons multiply the typed coefficient (e.g. 750→K→$750K). */
  const applyPriceSuffix = (bound: "min" | "max", suffix: "k" | "m") => {
    if (disabled) return;
    const draft = bound === "min" ? minDraft : maxDraft;
    if (draft == null || !draft.trim()) {
      showBoundNote(
        `Type a number in the ${bound === "min" ? "lower" : "upper"} price box before tapping ${suffix.toUpperCase()}.`,
      );
      return;
    }
    const baseRaw = draft.replace(/[kKmM]+$/g, "");
    const coefficient = Number(baseRaw.replace(/[^0-9.]/g, ""));
    if (!Number.isFinite(coefficient) || coefficient < 0) {
      showBoundNote(
        `${bound === "min" ? "Lower" : "Upper"} price isn’t valid — type a number first, then ${suffix.toUpperCase()}.`,
      );
      return;
    }
    const dollars = Math.round(coefficient * (suffix === "m" ? 1_000_000 : 1_000));
    if (bound === "min") {
      commitMinPrice(String(dollars));
      setMinDraft("");
    } else {
      commitMaxPrice(String(dollars));
      setMaxDraft("");
    }
  };

  const applyMinWheel = (deltaY: number) => {
    if (disabled) return;
    const current =
      minDraft != null ? (parseIntelPriceInput(minDraft) ?? minPrice) : minPrice;
    const ceiling = steps[hi] ?? priceCeiling;
    const next = adjustIntelPriceByWheel(current, deltaY, priceFloor, ceiling);
    if (next === current) return;
    setMinDraft(null);
    const index = minPriceToStepIndex(next, steps);
    const finalIndex = Math.min(index, hi);
    if (finalIndex !== lo) setSliderActive(true);
    onMinIndexChange(finalIndex);
  };

  const applyMaxWheel = (deltaY: number) => {
    if (disabled) return;
    const current =
      maxDraft != null ? (parseIntelPriceInput(maxDraft) ?? maxPrice) : maxPrice;
    const floor = steps[lo] ?? priceFloor;
    const next = adjustIntelPriceByWheel(current, deltaY, floor, priceCeiling);
    if (next === current) return;
    setMaxDraft(null);
    const index = maxPriceToStepIndex(next, steps);
    const finalIndex = Math.max(index, lo);
    if (finalIndex !== hi) setSliderActive(true);
    onMaxIndexChange(finalIndex);
  };

  // Either bound focused → enlarge both upper and lower (same scale as before).
  const priceInputsEnlarged = focusedBound != null;
  const priceInputClass = [
    "w-0 min-w-0 flex-1 rounded border border-white/20 bg-white/5 font-mono tabular-nums text-gold placeholder:text-white/30 focus:border-gold/50 focus:outline-none disabled:opacity-40 overflow-y-auto transition-[font-size,padding] duration-150",
    priceInputsEnlarged
      ? "px-1.5 py-1 text-[14px] leading-tight"
      : "px-1 py-0.5 text-[9px]",
  ].join(" ");

  const suffixBtnClass =
    "rounded border border-gold/40 bg-gold/15 px-2 py-0.5 font-mono text-[10px] font-semibold tracking-wide text-gold active:bg-gold/25";

  return (
    <div className={`flex flex-col gap-0.5 ${INTEL_SLIDER_WIDTH_CLASS} shrink-0`}>
      <div className="flex gap-1">
        <input
          type="text"
          inputMode="decimal"
          disabled={disabled}
          value={minDraft ?? formatIntelPriceStep(minPrice)}
          placeholder={formatIntelPriceStep(minPrice)}
          onChange={(e) => setMinDraft(sanitizeIntelPriceDraft(e.target.value))}
          onFocus={() => {
            setFocusedBound("min");
            // Clear so number-pad entry + K/M means “750 then K”, not “1500000×K”.
            setMinDraft("");
          }}
          onBlur={(e) => {
            setFocusedBound((prev) => (prev === "min" ? null : prev));
            commitMinPrice(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitMinPrice((e.target as HTMLInputElement).value);
              (e.target as HTMLInputElement).blur();
            }
          }}
          onWheel={(e) => {
            e.preventDefault();
            applyMinWheel(e.deltaY);
          }}
          title="Type a number, then K (thousands) or M (millions) — or full dollars. Scroll: $500K steps ($1M above $4M)."
          aria-label="Minimum price amount"
          className={priceInputClass}
        />
        <input
          type="text"
          inputMode="decimal"
          disabled={disabled}
          value={maxDraft ?? formatIntelPriceStep(maxPrice)}
          placeholder={formatIntelPriceStep(maxPrice)}
          onChange={(e) => setMaxDraft(sanitizeIntelPriceDraft(e.target.value))}
          onFocus={() => {
            setFocusedBound("max");
            setMaxDraft("");
          }}
          onBlur={(e) => {
            setFocusedBound((prev) => (prev === "max" ? null : prev));
            commitMaxPrice(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitMaxPrice((e.target as HTMLInputElement).value);
              (e.target as HTMLInputElement).blur();
            }
          }}
          onWheel={(e) => {
            e.preventDefault();
            applyMaxWheel(e.deltaY);
          }}
          title="Type a number, then K (thousands) or M (millions) — or full dollars. Scroll: $500K steps ($1M above $4M)."
          aria-label="Maximum price amount"
          className={priceInputClass}
        />
      </div>
      {focusedBound && !disabled ? (
        <div className="flex items-center justify-end gap-1">
          <span className="mr-auto font-mono text-[8px] tracking-wide text-white/40">
            type 750 → K
          </span>
          <button
            type="button"
            className={suffixBtnClass}
            // Keep focus on the input so blur/commit does not race the tap.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => applyPriceSuffix(focusedBound, "k")}
            aria-label="Multiply by one thousand (K)"
          >
            K
          </button>
          <button
            type="button"
            className={suffixBtnClass}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => applyPriceSuffix(focusedBound, "m")}
            aria-label="Multiply by one million (M)"
          >
            M
          </button>
        </div>
      ) : null}
      {boundNote ? (
        <p
          role="status"
          aria-live="polite"
          className="font-mono text-[10px] leading-snug text-coral"
        >
          {boundNote}
        </p>
      ) : null}
    </div>
  );
}

function FilterGroup<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="flex items-center gap-3">
      {label && (
        <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-white/45">
          {label}
        </span>
      )}
      <div className={filterPillContainerClass("compact", { wrap: false })}>
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            aria-pressed={value === opt.value}
            className={filterPillButtonClass(
              value === opt.value,
              "compact",
              "dark",
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function TownSnapshotPanel({
  snapshot,
  tx,
  expanded,
  collapsible,
  onToggleExpanded,
  onListingsClick,
  onSnapshotAction,
  onMedianHref,
}: {
  snapshot: TownSnapshot;
  tx: TxFilter;
  expanded: boolean;
  collapsible: boolean;
  onToggleExpanded: () => void;
  onListingsClick?: (town: string, zip?: string | null) => void;
  onSnapshotAction?: (
    town: string,
    action: "new" | "reduced" | "closed",
    zip?: string | null,
  ) => string;
  onMedianHref?: (snapshot: TownSnapshot) => string | null;
}) {
  const title = snapshotCardTitle(snapshot, tx);
  const showExpanded = collapsible ? expanded : true;

  return (
    <div
      className={`bg-white border border-charcoal/[0.06] overflow-hidden ${
        showExpanded ? "rounded-2xl" : "rounded-xl"
      }`}
    >
      <div
        className={`navy-gradient border-b border-white/10 flex items-center gap-2 ${
          showExpanded ? "px-5 py-4" : "px-3 py-2"
        }`}
      >
        <p
          className={`flex-1 min-w-0 font-mono uppercase text-gold font-bold truncate ${
            showExpanded
              ? "text-[10px] tracking-[0.2em] text-center"
              : "text-[9px] tracking-[0.18em]"
          }`}
        >
          {title}
        </p>
        {collapsible ? (
          <SnapshotCollapseToggle
            expanded={expanded}
            onToggle={onToggleExpanded}
            label={title}
          />
        ) : null}
      </div>
      {showExpanded ? (
        <SnapshotCardBody
          snapshot={snapshot}
          tx={tx}
          onListingsClick={onListingsClick}
          onSnapshotAction={onSnapshotAction}
          onMedianHref={onMedianHref}
        />
      ) : (
        <SnapshotSummaryBody
          snapshot={snapshot}
          tx={tx}
          onListingsClick={onListingsClick}
        />
      )}
    </div>
  );
}

function SnapshotSummaryBody({
  snapshot,
  tx,
  onListingsClick,
}: {
  snapshot: TownSnapshot;
  tx: TxFilter;
  onListingsClick?: (town: string, zip?: string | null) => void;
}) {
  const title = snapshotCardTitle(snapshot, tx);
  const summary = snapshotSummaryParts(snapshot);
  const { stats } = snapshot;

  return (
    <div className="px-3 py-2 font-mono text-[10px] leading-snug tabular-nums">
      <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-slate">
        {onListingsClick ? (
          <button
            type="button"
            onClick={() => onListingsClick(snapshot.town, snapshot.zip)}
            className="text-navy font-medium hover:text-gold transition-colors underline decoration-charcoal/15 underline-offset-2"
            aria-label={`View ${title} listings on deal board`}
          >
            {summary.listings} listings
          </button>
        ) : (
          <span className="text-navy font-medium">{summary.listings} listings</span>
        )}
        <span className="text-slate/35" aria-hidden>
          ·
        </span>
        <span className="text-navy">{summary.medianPrice}</span>
        <span className="text-slate/35" aria-hidden>
          ·
        </span>
        <span style={summary.monthsSupplyStyle}>{summary.monthsSupply}</span>
        <span className="text-slate/35" aria-hidden>
          ·
        </span>
        <span>{summary.medianDom}</span>
      </div>
      {(stats.newThisWeek > 0 || stats.reduced > 0) && (
        <p className="mt-1 text-[9px] tracking-wide text-slate/70">
          {stats.newThisWeek > 0 ? `${stats.newThisWeek} new` : null}
          {stats.newThisWeek > 0 && stats.reduced > 0 ? " · " : null}
          {stats.reduced > 0 ? `${stats.reduced} reduced` : null}
        </p>
      )}
    </div>
  );
}

function SnapshotCardBody({
  snapshot,
  tx,
  onListingsClick,
  onSnapshotAction,
  onMedianHref,
}: {
  snapshot: TownSnapshot;
  tx: TxFilter;
  onListingsClick?: (town: string, zip?: string | null) => void;
  onSnapshotAction?: (
    town: string,
    action: "new" | "reduced" | "closed",
    zip?: string | null,
  ) => string;
  onMedianHref?: (snapshot: TownSnapshot) => string | null;
}) {
  const medianHref = onMedianHref?.(snapshot) ?? null;
  const title = snapshotCardTitle(snapshot, tx);
  const place = snapshotHeading(snapshot);
  return (
    <div className="grid grid-cols-2">
      {snapshot.metrics.map((m) => {
        const isMonthsSupply = m.label === "Months supply";
        const monthsSupplyStyle = isMonthsSupply
          ? monthsSupplyMetricStyle(snapshot.stats.monthsSupply)
          : undefined;
        const valueColor = isMonthsSupply
          ? ""
          : snapshotValueColorClass(m.valueSignal);
        return (
          <div
            key={m.label}
            className="flex flex-col items-center text-center px-3 py-3 border-b border-r border-charcoal/[0.04] odd:last:col-span-2"
          >
            <span className="font-mono text-[9px] tracking-[0.15em] uppercase text-slate/70 mb-1 font-bold">
              {m.label}
            </span>
            {m.label === "Listings" && onListingsClick ? (
              <button
                type="button"
                onClick={() => onListingsClick(snapshot.town, snapshot.zip)}
                className={`font-mono text-sm tabular-nums leading-tight hover:text-gold transition-colors underline decoration-charcoal/20 hover:decoration-gold underline-offset-2 ${valueColor}`}
                aria-label={`View all ${title} listings on deal board`}
              >
                {m.value}
              </button>
            ) : m.label === "Median price" && medianHref ? (
              <Link
                href={medianHref}
                className={`font-mono text-sm tabular-nums leading-tight hover:text-gold transition-colors underline decoration-charcoal/20 hover:decoration-gold underline-offset-2 ${valueColor}`}
                aria-label={`View ${place} median price listings on stats`}
              >
                {m.value}
              </Link>
            ) : (
              <p
                className={`font-mono text-sm tabular-nums leading-tight ${valueColor}`}
                style={monthsSupplyStyle}
              >
                {m.value}
              </p>
            )}
            {m.action && onSnapshotAction ? (
              <Link
                href={onSnapshotAction(snapshot.town, m.action!, snapshot.zip)}
                className={`font-mono text-[9px] leading-tight mt-0.5 underline underline-offset-2 transition-colors hover:opacity-80 ${valueColor}`}
                style={monthsSupplyStyle}
                aria-label={
                  m.action === "new"
                    ? `View new ${place} listings this week`
                    : m.action === "reduced"
                      ? `View reduced ${place} listings`
                      : `View ${tx === "rental" ? "leased" : "closed"} ${place} listings this week`
                }
              >
                {m.trend}
              </Link>
            ) : (
              <p
                className={`font-mono text-[9px] leading-tight mt-0.5 ${valueColor}`}
                style={monthsSupplyStyle}
              >
                {m.trend}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function DealBoardPagination({
  page,
  totalPages,
  pageStart,
  pageEnd,
  totalCount,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  pageStart: number;
  pageEnd: number;
  totalCount: number;
  onPageChange: (page: number) => void;
}) {
  return (
    <div className="mt-3 flex flex-col gap-3 rounded-xl border border-charcoal/[0.08] bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="font-mono text-[10px] tracking-[0.12em] uppercase text-slate">
        Showing{" "}
        <span className="text-navy tabular-nums">
          {pageStart.toLocaleString()}–{pageEnd.toLocaleString()}
        </span>{" "}
        of{" "}
        <span className="text-navy tabular-nums">{totalCount.toLocaleString()}</span>{" "}
        {totalCount === 1 ? "listing" : "listings"}
      </p>
      <nav aria-label="Pagination">
        <div className="inline-flex flex-wrap items-center gap-1 rounded-full border border-charcoal/[0.08] bg-white p-0.5">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => {
            const isActive = pageNum === page;
            return (
              <button
                key={pageNum}
                type="button"
                onClick={() => onPageChange(pageNum)}
                disabled={isActive}
                aria-current={isActive ? "page" : undefined}
                aria-label={`Page ${pageNum}`}
                className={`inline-flex min-w-8 items-center justify-center rounded-full px-3 py-1.5 font-mono text-[10px] tracking-[0.12em] tabular-nums transition-colors ${
                  isActive
                    ? "bg-navy text-white"
                    : "text-slate hover:text-navy hover:bg-charcoal/[0.04]"
                }`}
              >
                {pageNum}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

const INTEL_FILTER_LINE_XS = [6, 12, 18] as const;
const INTEL_FILTER_TRI_Y_MIN = 6;
const INTEL_FILTER_TRI_Y_MAX = 18;

function randomIntelFilterTriY(): number {
  return (
    INTEL_FILTER_TRI_Y_MIN +
    Math.random() * (INTEL_FILTER_TRI_Y_MAX - INTEL_FILTER_TRI_Y_MIN)
  );
}

function IntelFiltersToggle({
  expanded,
  filtersActive,
  onToggle,
}: {
  expanded: boolean;
  filtersActive: boolean;
  onToggle: () => void;
}) {
  const label = expanded ? "Hide slider filters" : "Show slider filters";

  // One triangle per bar. Intro: CSS bob for ~10s (no rAF / no per-frame React).
  // Rest: freeze at a fresh random Y. Negligible CPU — 3 SVG nodes, compositor only.
  const intro = useMemo(
    () =>
      INTEL_FILTER_LINE_XS.map((x) => ({
        x,
        y: randomIntelFilterTriY(),
        durationSec: 0.55 + Math.random() * 0.75,
        delaySec: Math.random() * 0.4,
        amp: 1.6 + Math.random() * 2.4,
      })),
    [],
  );
  const [restYs, setRestYs] = useState<number[] | null>(null);

  useEffect(() => {
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setRestYs(INTEL_FILTER_LINE_XS.map(() => randomIntelFilterTriY()));
      return;
    }
    const id = window.setTimeout(() => {
      setRestYs(INTEL_FILTER_LINE_XS.map(() => randomIntelFilterTriY()));
    }, 10_000);
    return () => window.clearTimeout(id);
  }, []);

  const bobbing = restYs == null;

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      aria-label={label}
      title={label}
      className="relative inline-flex h-8 w-8 shrink-0 items-center justify-center text-white transition-opacity hover:opacity-80"
    >
      {/* Three bars + one triangle handle each (slider-filter glyph). */}
      <svg
        className="h-4 w-4 overflow-visible"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <line x1="6" y1="3" x2="6" y2="21" />
        <line x1="12" y1="3" x2="12" y2="21" />
        <line x1="18" y1="3" x2="18" y2="21" />
        {intro.map((tri, i) => {
          const y = restYs?.[i] ?? tri.y;
          const x = tri.x;
          const lo = Math.max(
            INTEL_FILTER_TRI_Y_MIN,
            Math.min(INTEL_FILTER_TRI_Y_MAX, y - tri.amp),
          );
          const hi = Math.max(
            INTEL_FILTER_TRI_Y_MIN,
            Math.min(INTEL_FILTER_TRI_Y_MAX, y + tri.amp),
          );
          return (
            <g key={x} transform={bobbing ? undefined : `translate(0 ${y})`}>
              {bobbing ? (
                <animateTransform
                  attributeName="transform"
                  type="translate"
                  values={`0 ${lo}; 0 ${hi}; 0 ${lo}`}
                  keyTimes="0; 0.5; 1"
                  calcMode="spline"
                  keySplines="0.45 0 0.55 1; 0.45 0 0.55 1"
                  dur={`${tri.durationSec * 2}s`}
                  begin={`${tri.delaySec}s`}
                  repeatCount="indefinite"
                />
              ) : null}
              {/* Tip at (x, 0); group translateY places it on the bar. */}
              <path d={`M${x} -3 L${x + 4} 0 L${x} 3 Z`} />
            </g>
          );
        })}
      </svg>
      {!expanded && filtersActive ? (
        <span
          className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-gold ring-2 ring-navy"
          aria-hidden
        />
      ) : null}
    </button>
  );
}
