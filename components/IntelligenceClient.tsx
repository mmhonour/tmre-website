"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Fragment,
  useCallback,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type Ref,
} from "react";
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
import IntelligencePriceBandMiniChart from "@/components/IntelligencePriceBandMiniChart";
import IntelligenceLuxuryPriceBandMiniChart from "@/components/IntelligenceLuxuryPriceBandMiniChart";
import IntelligenceDomBandMiniChart from "@/components/IntelligenceDomBandMiniChart";
import IntelligenceMiniGraphsStrip from "@/components/IntelligenceMiniGraphsStrip";
import { listingMatchesDomBand, parseDomBandId } from "@/lib/intel-dom-bands";
import IntelTownStatsDrawer from "@/components/intelligence/IntelTownStatsDrawer";
import SnapshotCollapseToggle from "@/components/SnapshotCollapseToggle";
import type { VintageListingRow } from "@/lib/intelligence-vintage-stats";
import type { VintageBucketId } from "@/lib/vintage-buckets";
import DealOfTheDayFrame from "./DealOfTheDayFrame";
import DealBoardList from "@/components/intelligence/deal-board/DealBoardList";
import DealBoardStatusFilterPills from "@/components/intelligence/deal-board/DealBoardStatusFilterPills";
import {
  DealBoardCardViewButton,
  DealBoardMapToggleButton,
} from "@/components/intelligence/deal-board/DealBoardViewPicker";
import {
  dealBoardSortLabel,
  type DealBoardSortDir,
  type DealBoardSortKey,
} from "@/components/intelligence/deal-board/deal-board-sort";
import type { DealBoardStatusFilter } from "@/components/intelligence/deal-board/deal-board-types";
import {
  DEAL_BOARD_CARD_VIEW_VALUES,
  DEAL_BOARD_MAP_LAYOUT_DEFAULT,
  DEAL_BOARD_MAP_LAYOUT_LABELS,
  DEAL_BOARD_MAP_LAYOUT_PREF_KEY,
  DEAL_BOARD_MAP_LAYOUT_SHORT_LABELS,
  DEAL_BOARD_MAP_LAYOUT_VALUES,
  DEAL_BOARD_MAP_ON_PREF_KEY,
  DEAL_BOARD_VIEW_DEFAULT,
  DEAL_BOARD_VIEW_PREF_KEY,
  dealBoardCardView,
  dealBoardMapLayoutFromStored,
  dealBoardViewDefaultForViewport,
  type DealBoardCardView,
  type DealBoardMapLayout,
} from "@/lib/deal-board-view";
import DealBoardMap from "@/components/intelligence/DealBoardMap";
import {
  clearDealBoardFocus,
  currentDealBoardReturnPath,
  dealBoardRowDomId,
  matchListingKeyFromFocusId,
  parseDealBoardFocusHash,
  peekDealBoardFocus,
  rememberDealBoardFocus,
  stampDealBoardHash,
} from "@/lib/deal-board-focus";
import { persistReturnNav } from "@/lib/listing-return-nav";
import type { TownDescriptorStats } from "@/lib/intelligence-all-towns-descriptor";
import {
  LISTING_FURNISHED_VALUES,
  type ListingFurnished,
} from "@/lib/listing-furnished";
import { monthsSupplyColorStyle } from "@/lib/months-supply-color";
import ListingScoreBreakdownModal from "./ListingScoreBreakdownModal";
import ListingHistoryModal from "./ListingHistoryModal";
import ModalPortal, { MODAL_PANEL_CLASS } from "./ModalPortal";
import { useCoverageTowns } from "@/components/CoverageTownsProvider";
import TownFilterPills from "./TownFilterPills";
import ZipFilterPills from "./ZipFilterPills";
import { useTabKitSegmentedStyle } from "@/hooks/useTabKitAssignments";
import { formatTownZipPlace, normalizeTownName, TMRE_TOWNS, listingZipMatchesTown, townHasMultipleZips, zipAreaNickname, type TmreTown, zipsForTown, mapBoundZipsForScope } from "@/lib/tmre-towns";
import { TOWN_MARKET_TAGLINES } from "@/lib/intelligence-town-taglines";
import { listingDetailHrefForListing } from "@/lib/listing-url";
import { underContractStatusLabel } from "@/lib/listing-status";
import { prefetchMlsPhotoThumbsOrdered } from "@/lib/prefetch-listing-images";
import {
  buildIntelligenceShareHref,
  buildIntelligenceShareTitle,
  parseIntelligenceSearchParams,
} from "@/lib/intelligence-search-url";
import {
  cloneIntelligenceDescriptorSizes,
  DEFAULT_INTELLIGENCE_DESCRIPTOR_SIZES,
  intelligenceDescriptorSizeCssVars,
  type IntelligenceDescriptorSizes,
} from "@/lib/intelligence-descriptor-sizes-shared";
import ListingShareButton from "@/components/listing/ListingShareButton";
import { useSiteUnlocked } from "@/components/SiteUnlockProvider";
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
import {
  BOARD_LISTING_LIMIT,
  BOARD_MAP_LISTING_LIMIT,
  intelligenceMiddleTierEligible,
  planMiddleTierCollapse,
  splitBoardByScoreTier,
} from "@/lib/intelligence-deal-board-tiers";

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
const NEW_CONSTRUCTION_VALUES = ["all", "new", "not-new"] as const;
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
  return value === "all" ? "Any Furnished" : value;
}

/**
 * SmartMLS splits under-agreement rows into "Under Contract" (D) and "Under
 * Contract - Continue to Show" (SH). CTS sellers are still showing the home, so
 * those rows are never filtered; plain under contract is off unless asked for.
 */
const UNDER_CONTRACT_PREF_VALUES = ["off", "on"] as const;
type UnderContractPref = (typeof UNDER_CONTRACT_PREF_VALUES)[number];
const UNDER_CONTRACT_PREF_KEY = "tmre_intel_under_contract";
const STATS_EXPANDED_PREF = "tmre_intel_stats_expanded_towns";
/**
 * Share query string for the board the visitor last looked at. Restores the
 * filters that live in memory rather than their own cookie (price, sqft, DOM
 * band) when Intelligence is opened without params — e.g. "Back to deal board".
 */
const INTEL_BOARD_STATE_PREF_KEY = "tmre_intel_board";
const FILTERS_EXPANDED_VALUES = ["true", "false"] as const;
type FiltersExpandedPref = (typeof FILTERS_EXPANDED_VALUES)[number];
type MinBedFilter = (typeof MIN_BED_VALUES)[number];
type MinBathFilter = (typeof MIN_BATH_VALUES)[number];
type NewConstructionFilter = (typeof NEW_CONSTRUCTION_VALUES)[number];
const INTEL_CITIES = ["All", ...TMRE_TOWNS] as const;
type IntelCity = (typeof INTEL_CITIES)[number];

/** Market positioning copy — separate from offline mock data. */
const TOWN_TAGLINES = TOWN_MARKET_TAGLINES;

type IntelDescriptorPartKind = "town" | "tx" | "cls" | "construction" | "plain";

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
  newConstructionFilter,
  boardStatusFilter,
  furnishedFilter,
}: {
  active: IntelCity;
  zip: string | null;
  tx: TxFilter;
  cls: ClsFilter;
  saleProperty: SalePropertyFilter;
  newConstructionFilter: NewConstructionFilter;
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

  if (cls === "residential") parts.push({ kind: "cls", label: "Residential" });
  else if (cls === "commercial") parts.push({ kind: "cls", label: "Commercial" });

  if (tx !== "rental" && cls !== "commercial") {
    if (saleProperty === "homes") parts.push({ kind: "tx", label: "Homes" });
    else if (saleProperty === "multi") parts.push({ kind: "tx", label: "Multi-family" });
    else if (saleProperty === "condos") parts.push({ kind: "tx", label: "Condos" });
  }

  if (furnishedFilter !== "all") {
    parts.push({ kind: "plain", label: furnishedFilter });
  }

  // Always surface construction type (like Residential) so the filter stays
  // discoverable when chrome is collapsed — click peeks Construction Type pills.
  if (newConstructionFilter === "new") {
    parts.push({ kind: "construction", label: "New Construction" });
  } else if (newConstructionFilter === "not-new") {
    parts.push({ kind: "construction", label: "Not New Construction" });
  } else {
    parts.push({ kind: "construction", label: "Any" });
  }

  if (boardStatusFilter === "new") parts.push({ kind: "plain", label: "New listings" });
  else if (boardStatusFilter === "reduced") {
    parts.push({ kind: "plain", label: "Price reduced" });
  } else if (boardStatusFilter === "active") {
    parts.push({ kind: "plain", label: "Active only" });
  }

  return parts;
}

/**
 * When pinned, move filter chrome into the fixed nav panel.
 * If the host isn’t mounted yet, render nothing — never paint peeks in the
 * scrolled-away hero (that looked like “descriptors do nothing”).
 */
function IntelChromePortal({
  pin,
  host,
  children,
}: {
  pin: boolean;
  host: HTMLElement | null;
  children: ReactNode;
}) {
  if (!pin) return <>{children}</>;
  if (!host) return null;
  return createPortal(children, host);
}

function IntelDescriptorContext({
  parts,
  onTownClick,
  onTxClick,
  onClsClick,
  onConstructionClick,
}: {
  parts: IntelDescriptorPart[];
  onTownClick?: () => void;
  onTxClick?: () => void;
  onClsClick?: () => void;
  onConstructionClick?: () => void;
}) {
  return (
    <>
      {parts.map((part, index) => {
        const interactive =
          (part.kind === "town" && onTownClick != null) ||
          (part.kind === "tx" && onTxClick != null) ||
          (part.kind === "cls" && onClsClick != null) ||
          (part.kind === "construction" && onConstructionClick != null);
        const onClick =
          part.kind === "town"
            ? onTownClick
            : part.kind === "tx"
              ? onTxClick
              : part.kind === "cls"
                ? onClsClick
                : part.kind === "construction"
                  ? onConstructionClick
                  : undefined;
        return (
          <Fragment key={`${part.kind}-${part.label}-${index}`}>
            {interactive && onClick ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onClick();
                }}
                className="cursor-pointer text-white/45 hover:text-gold underline underline-offset-2 decoration-white/25 hover:decoration-gold/50 transition-colors"
              >
                {part.label}
              </button>
            ) : (
              <span className="text-white/45">{part.label}</span>
            )}
            <IntelFilterDescriptorDot />
          </Fragment>
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

/**
 * When filtered results exceed one board page (100), only the first N photos
 * are eager-loaded / prefetched per page — more mount as you scroll.
 */
const PHOTO_BATCH_WHEN_PAGED = 20;
const BED_BATH_MAX = 6;
const INTEL_SLIDER_WIDTH_CLASS = "w-[7.5rem]";

/** Keep dual-range thumbs from stacking — always ≥1 step between them when possible. */
const INTEL_DUAL_SLIDER_MIN_GAP = 1;

function clampDualSliderMin(
  next: number,
  hi: number,
  maxIndex: number,
): number {
  const gap = maxIndex >= INTEL_DUAL_SLIDER_MIN_GAP ? INTEL_DUAL_SLIDER_MIN_GAP : 0;
  return Math.max(0, Math.min(next, hi - gap));
}

function clampDualSliderMax(
  next: number,
  lo: number,
  maxIndex: number,
): number {
  const gap = maxIndex >= INTEL_DUAL_SLIDER_MIN_GAP ? INTEL_DUAL_SLIDER_MIN_GAP : 0;
  return Math.min(maxIndex, Math.max(next, lo + gap));
}

/** Visual thumb positions when state bounds are equal — keep a 1-step gap. */
function dualSliderThumbValues(
  lo: number,
  hi: number,
  maxIndex: number,
): { thumbLo: number; thumbHi: number } {
  if (lo !== hi || maxIndex < INTEL_DUAL_SLIDER_MIN_GAP) {
    return { thumbLo: lo, thumbHi: hi };
  }
  if (lo >= maxIndex) {
    return { thumbLo: maxIndex - INTEL_DUAL_SLIDER_MIN_GAP, thumbHi: maxIndex };
  }
  return { thumbLo: lo, thumbHi: lo + INTEL_DUAL_SLIDER_MIN_GAP };
}
/** Keep slider descriptors enlarged this long after thumb release or descriptor click. */
const DESCRIPTOR_ENLARGE_HOLD_MS = 10_000;
/**
 * Idle dismiss for peeked filter groups, “... more towns”, and Market
 * Intelligence / triangle chrome. Other towns stay visible until this
 * fires; they do not stay open indefinitely on the phone.
 */
const FILTER_PEEK_IDLE_MS = 30_000;
type IntelSliderKind =
  | "price"
  | "bed"
  | "bath"
  | "vintage"
  | "sqft"
  | "furnished"
  | "undercontract";
/** Descriptor peeks: accumulate kinds, or `"all"` (mag glass / every kind exposed). */
type ExposedIntelSliders = "all" | IntelSliderKind[] | null;

/** Pill groups the descriptor line can peek open while the chrome is collapsed. */
type FilterChromePeek = "towns" | "tx" | "cls" | "construction" | "sliders";

function availableIntelSliderKinds(opts: {
  showPriceFilter: boolean;
  cls: ClsFilter;
  showFurnished: boolean;
}): IntelSliderKind[] {
  const kinds: IntelSliderKind[] = [];
  if (opts.showPriceFilter) kinds.push("price");
  if (opts.cls !== "commercial") {
    kinds.push("bed", "bath", "vintage", "sqft");
  }
  if (opts.showFurnished) kinds.push("furnished");
  // Under contract applies to every class and transaction type.
  kinds.push("undercontract");
  return kinds;
}

function isPartialSliderPeek(exposed: ExposedIntelSliders): boolean {
  return Array.isArray(exposed) && exposed.length > 0;
}

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

/** Idle size from admin CSS vars (`--intel-desc-idle`); active held enlarge stays `text-lg`. */
const INTEL_DESCRIPTOR_IDLE_TEXT =
  "text-[length:var(--intel-desc-idle,9px)]";

function descriptorLabelClass(active: boolean, interactive: boolean): string {
  return `font-mono tabular-nums text-gold leading-none origin-left transition-all duration-300 ease-out shrink-0 ${
    active
      ? "text-lg font-medium scale-110"
      : `${INTEL_DESCRIPTOR_IDLE_TEXT} scale-100`
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
  /** MLS coordinates for the Map board view; absent on non-cache paths. */
  latitude?: number | null;
  longitude?: number | null;
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
  action?: "new" | "reduced" | "closed" | "to-contract";
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

function wentToContractThisWeekForTown(
  town: string,
  zip: string | null | undefined,
  byTown: Record<string, number>,
  byTownZip: Record<string, Record<string, number>>,
): number {
  if (zip) return byTownZip[town]?.[zip] ?? 0;
  return byTown[town] ?? 0;
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

/** True only for plain "Under Contract" — Continue to Show stays on the board. */
function listingHiddenAsUnderContract(l: DisplayListing): boolean {
  return underContractStatusLabel(l.contractStatus) === "Under Contract";
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
  newConstructionFilter: NewConstructionFilter = "all",
  furnishedFilter: FurnishedFilter = "all",
  exactBeds = false,
  minPrice = 0,
  maxPrice: number | null = null,
  minVintage = 0,
  maxVintage = VINTAGE_FILTER_MAX,
  minSqft = 0,
  maxSqft: number | null = null,
  minDomDays: number | null = null,
  maxDomDays: number | null = null,
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
    if (
      minDomDays != null &&
      !listingMatchesDomBand(l.dom, minDomDays, maxDomDays)
    ) {
      return false;
    }
    if (newConstructionFilter === "new") {
      if (!matchesNewConstruction(l.yearBuilt, l.propertyType)) return false;
    } else if (newConstructionFilter === "not-new") {
      if (matchesNewConstruction(l.yearBuilt, l.propertyType)) return false;
    }
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
  wentToContractThisWeekCount = 0,
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
      label: "To contract this week",
      value: String(wentToContractThisWeekCount),
      trend: wentToContractThisWeekCount > 0 ? "Past 7 days" : "None this week",
      tone: wentToContractThisWeekCount > 0 ? "up" : "flat",
      action: wentToContractThisWeekCount > 0 ? "to-contract" : undefined,
    },
    {
      label: "Median price",
      value: formatSnapshotPrice(medPrice),
      trend:
        medPrice != null && benchmarks.medianPrice != null
          ? medPrice >= benchmarks.medianPrice
            ? "Above market median"
            : "Below market median"
          : medPrice != null
            ? "Active listings"
            : "—",
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
      wentToContractThisWeek: wentToContractThisWeekCount,
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
  if (tx === "rental") return `${place} Listings for Rent`;
  if (tx === "sale") return `${place} Listings for Sale`;
  return `${place} Listings`;
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

function formatListingsRefreshTime(iso: string | null | undefined): string | null {
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

/** Admin-only refresh kind labels for the Live status chip. */
function formatListingsRefreshKind(
  kind: string | null | undefined,
): string | null {
  if (!kind || kind === "unknown") return null;
  switch (kind) {
    case "incremental":
      return "incremental";
    case "full-sync":
      return "full sync";
    case "full-sync-chunked":
      return "full sync (chunked)";
    case "stats-cache":
      return "stats cache";
    case "refresh":
      return "refresh";
    default:
      return kind.replace(/-/g, " ");
  }
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
    wentToContractThisWeekByTown: Record<string, number>;
    wentToContractThisWeekByTownZip: Record<string, Record<string, number>>;
  },
  setters: {
    setMonthlySales: (v: Record<string, number>) => void;
    setClosedThisWeekByTown: (v: Record<string, number>) => void;
    setClosedThisWeekByTownZip: (v: Record<string, Record<string, number>>) => void;
    setWentToContractThisWeekByTown: (v: Record<string, number>) => void;
    setWentToContractThisWeekByTownZip: (
      v: Record<string, Record<string, number>>,
    ) => void;
  },
) {
  setters.setMonthlySales(board.monthlySales);
  setters.setClosedThisWeekByTown(board.closedThisWeekByTown);
  setters.setClosedThisWeekByTownZip(board.closedThisWeekByTownZip);
  setters.setWentToContractThisWeekByTown(board.wentToContractThisWeekByTown);
  setters.setWentToContractThisWeekByTownZip(board.wentToContractThisWeekByTownZip);
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
  wentToContractThisWeekSale?: number;
  wentToContractThisWeekRental?: number;
  wentToContractThisWeekByZipSale?: Record<string, number>;
  wentToContractThisWeekByZipRental?: Record<string, number>;
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
  latitude?: number | null;
  longitude?: number | null;
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
    latitude: row.latitude ?? null,
    longitude: row.longitude ?? null,
  };
}

async function fetchIntelligenceDealBoard(
  transaction: TxFilter = "sale",
): Promise<{
  byCity: Record<TmreTown, DisplayListing[]>;
  monthlySales: Record<string, number>;
  closedThisWeekByTown: Record<string, number>;
  closedThisWeekByTownZip: Record<string, Record<string, number>>;
  wentToContractThisWeekByTown: Record<string, number>;
  wentToContractThisWeekByTownZip: Record<string, Record<string, number>>;
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
  const wentToContractThisWeekByTown: Record<string, number> = {};
  const wentToContractThisWeekByTownZip: Record<
    string,
    Record<string, number>
  > = {};
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
    wentToContractThisWeekByTown[town] = rental
      ? (meta?.wentToContractThisWeekRental ?? 0)
      : (meta?.wentToContractThisWeekSale ?? 0);
    wentToContractThisWeekByTownZip[town] = rental
      ? (meta?.wentToContractThisWeekByZipRental ?? {})
      : (meta?.wentToContractThisWeekByZipSale ?? {});
  }

  return {
    byCity,
    monthlySales,
    closedThisWeekByTown,
    closedThisWeekByTownZip,
    wentToContractThisWeekByTown,
    wentToContractThisWeekByTownZip,
  };
}

type LoadState = "loading" | "ready" | "fallback";

export default function IntelligenceClient({
  initialDotdDealsByTown = null,
  initialInventorySegmentChart = null,
  initialDescriptorSizes = DEFAULT_INTELLIGENCE_DESCRIPTOR_SIZES,
}: {
  /** FSSR seed for Deal of the Day frame (sale/homes by default). */
  initialDotdDealsByTown?: import("@/lib/deal-of-the-day-carousel-types").DealCarouselDealsByTown | null;
  /** SSR seed: Market Bands inventory charts (incl. Discount) for city All. */
  initialInventorySegmentChart?: import("@/lib/intelligence-inventory-segment-fssr").InventorySegmentChartSeed | null;
  /** Admin-tuned idle filter descriptor sizes (mobile / desktop). */
  initialDescriptorSizes?: IntelligenceDescriptorSizes;
} = {}) {
  const { knownTowns } = useCoverageTowns();
  const siteUnlocked = useSiteUnlocked();
  const searchParams = useSearchParams();
  const [descriptorSizes, setDescriptorSizes] =
    useState<IntelligenceDescriptorSizes>(() =>
      cloneIntelligenceDescriptorSizes(initialDescriptorSizes),
    );

  useEffect(() => {
    let cancelled = false;
    fetch("/api/intelligence/descriptor-sizes", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) return null;
        return (await res.json()) as { config?: IntelligenceDescriptorSizes };
      })
      .then((body) => {
        if (cancelled || !body?.config) return;
        setDescriptorSizes(cloneIntelligenceDescriptorSizes(body.config));
      })
      .catch(() => {
        /* keep SSR / default sizes */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const descriptorSizeStyle = useMemo(
    () =>
      intelligenceDescriptorSizeCssVars(descriptorSizes) as CSSProperties,
    [descriptorSizes],
  );
  const urlSearchParams = useMemo(
    () => parseIntelligenceSearchParams(searchParams),
    [searchParams],
  );
  /**
   * "Back to deal board" links to `/intelligence#deal-…` with no query string,
   * so the board state saved on the way out stands in for the missing params.
   * Anything in the address bar wins — a shared or deep link is explicit.
   */
  const [savedBoardSearch, setSavedBoardSearch] = useState<string | null>(null);
  useEffect(() => {
    if (urlSearchParams) return;
    const stored = readClientPref(INTEL_BOARD_STATE_PREF_KEY);
    if (stored) setSavedBoardSearch(stored);
  }, [urlSearchParams]);
  const urlSearch = useMemo(() => {
    if (urlSearchParams) return urlSearchParams;
    if (!savedBoardSearch) return null;
    return parseIntelligenceSearchParams(new URLSearchParams(savedBoardSearch));
  }, [urlSearchParams, savedBoardSearch]);
  const urlSearchAppliedRef = useRef(false);
  /** Price / sqft / DOM band need the board ladders, so they land later. */
  const urlPriceSqftAppliedRef = useRef(false);

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
  /** Price-band mini chart selection (stats_cache bands → board price filter). */
  const [activePriceBandId, setActivePriceBandId] = useState<string | null>(null);
  const [activeLuxuryPriceBandId, setActiveLuxuryPriceBandId] = useState<
    string | null
  >(null);
  const [activeDomBandId, setActiveDomBandId] = useState<string | null>(null);
  const [domBandMinDays, setDomBandMinDays] = useState<number | null>(null);
  const [domBandMaxDays, setDomBandMaxDays] = useState<number | null>(null);
  const [priceSliderActive, setPriceSliderActive] = useHeldSliderActive();
  const [bedSliderActive, setBedSliderActive] = useHeldSliderActive();
  const [bathSliderActive, setBathSliderActive] = useHeldSliderActive();
  const [vintageSliderActive, setVintageSliderActive] = useHeldSliderActive();
  const [minSqftIndex, setMinSqftIndex] = useState(0);
  const [maxSqftIndex, setMaxSqftIndex] = useState(INTEL_SQFT_MAX_INDEX);
  const [sqftSliderActive, setSqftSliderActive] = useHeldSliderActive();
  const [furnishedSliderActive, setFurnishedSliderActive] = useHeldSliderActive();
  const [underContractSliderActive, setUnderContractSliderActive] =
    useHeldSliderActive();
  const sqftRangeCustomizedRef = useRef(false);
  const [collapsedSlidersOpen, setCollapsedSlidersOpen] = useState(false);
  /**
   * When collapsed chrome peeks sliders: which kinds are visible.
   * Descriptor clicks accumulate; mag glass / full set → `"all"`.
   */
  const [exposedSliders, setExposedSliders] =
    useState<ExposedIntelSliders>(null);
  const priceRangeCustomizedRef = useRef(false);
  const priceFilterContextRef = useRef("");
  const [newConstructionFilter, setNewConstructionFilter] =
    usePersistedFilter<NewConstructionFilter>(
      "tmre_intel_new_construction",
      "all",
      NEW_CONSTRUCTION_VALUES,
    );
  const [furnishedFilter, setFurnishedFilter] = usePersistedFilter<FurnishedFilter>(
    "tmre_intel_furnished",
    "all",
    FURNISHED_FILTER_VALUES,
  );
  const [underContractPref, setUnderContractPref] =
    usePersistedFilter<UnderContractPref>(
      UNDER_CONTRACT_PREF_KEY,
      "off",
      UNDER_CONTRACT_PREF_VALUES,
    );
  const showUnderContract = underContractPref === "on";
  const [zip, setZip] = usePersistedNullableFilter("tmre_intel_zip");
  const [boardStatusFilter, setBoardStatusFilter] = usePersistedFilter<BoardStatusFilter>(
    "tmre_intel_board_status",
    "all",
    BOARD_STATUS_VALUES,
  );
  const [filtersExpandedPref, setFiltersExpandedPref] = usePersistedFilter<FiltersExpandedPref>(
    "tmre_intel_filters_expanded",
    "false",
    FILTERS_EXPANDED_VALUES,
  );
  const filtersExpanded = filtersExpandedPref === "true";
  /**
   * Collapse town/class/tx pills + sliders/price boxes. Descriptor line stays
   * visible; descriptor clicks peek the matching group. Triangle still expands
   * everything (later: whether class pills stay always-visible vs hide-only).
   * Always start minimized on load / navigation so descriptors stay in view.
   */
  const [filterChromeCollapsed, setFilterChromeCollapsed] = useState(true);
  /**
   * While collapsed, which pill groups / sliders the descriptor line has peeked
   * open. Clicks accumulate (like slider descriptors do); clicking the same
   * descriptor again drops only that group.
   */
  const [filterChromePeeks, setFilterChromePeeks] = useState<FilterChromePeek[]>(
    [],
  );
  /** Desktop: click minimized DOTD strip to expand before navigating. */
  const [dotdForceExpanded, setDotdForceExpanded] = useState(false);
  /** Host for peeked filter chrome while descriptors are pinned under the nav. */
  const [pinnedFilterChromeHost, setPinnedFilterChromeHost] =
    useState<HTMLDivElement | null>(null);
  const isPeeking = (key: FilterChromePeek) => filterChromePeeks.includes(key);
  const addFilterChromePeek = (key: FilterChromePeek) =>
    setFilterChromePeeks((prev) =>
      prev.includes(key) ? prev : [...prev, key],
    );
  const dropFilterChromePeek = (key: FilterChromePeek) =>
    setFilterChromePeeks((prev) => prev.filter((k) => k !== key));
  /**
   * Bumped on filter-chrome interaction so the peek idle timer restarts.
   * Pass `revealMarketIntel` for Edit-all / triangle — descriptor peeks stay quiet.
   */
  const [filterPeekActivityEpoch, setFilterPeekActivityEpoch] = useState(0);
  /** After idle: hide “Market Intelligence” + triangle until Edit-all / triangle. */
  const [marketIntelChromeDismissed, setMarketIntelChromeDismissed] =
    useState(false);
  const bumpFilterPeekActivity = useCallback(
    (opts?: { revealMarketIntel?: boolean }) => {
      setFilterPeekActivityEpoch((n) => n + 1);
      if (opts?.revealMarketIntel) setMarketIntelChromeDismissed(false);
    },
    [],
  );
  /** Phone: slide-overs for town Stats / vintages (desktop keeps the sidebar). */
  const [townStatsOpen, setTownStatsOpen] = useState(false);
  const [vintageStatsOpen, setVintageStatsOpen] = useState(false);
  /** Desktop sidebar: folder tabs between town Stats and vintage panel. */
  const [desktopStatsTab, setDesktopStatsTab] = useState<"stats" | "vintage">(
    "stats",
  );
  const [miniGraphsHidden, setMiniGraphsHidden] = useState(false);
  /**
   * Mobile map: graphs start hidden and stay unmounted until "Show graphs" —
   * the map owns the viewport, and the charts are not free to build.
   */
  const [mapGraphsRevealed, setMapGraphsRevealed] = useState(false);
  const [miniGraphsAutoHideSuspended, setMiniGraphsAutoHideSuspended] =
    useState(false);
  const setMiniGraphsHiddenPref = useCallback(
    (hidden: boolean, opts?: { suspendAutoHide?: boolean }) => {
      setMiniGraphsHidden(hidden);
      if (hidden) {
        setMiniGraphsAutoHideSuspended(false);
      } else if (opts?.suspendAutoHide === true) {
        setMiniGraphsAutoHideSuspended(true);
      } else if (opts?.suspendAutoHide === false) {
        // Explicit resume (e.g. sync phrase re-show) — idle auto-hide stays on.
        setMiniGraphsAutoHideSuspended(false);
      }
      // Plain show (strip toggle after it set suspend) leaves suspend unchanged.
      try {
        sessionStorage.setItem(
          "tmre-intel-mini-graphs-hidden",
          hidden ? "1" : "0",
        );
      } catch {
        /* private mode */
      }
    },
    [],
  );
  /**
   * Sync timestamp phrase currently shown in the Live chip (`synced today at…`).
   * null = omit (animation finished or none). While animating, shrinks one
   * letter at a time until empty.
   */
  const [syncPhraseDisplay, setSyncPhraseDisplay] = useState<string | null>(
    null,
  );
  /** Nav mount under the mobile hamburger for Live status. */
  const [mobileLiveRoot, setMobileLiveRoot] = useState<HTMLElement | null>(
    null,
  );
  useEffect(() => {
    let cancelled = false;
    const sync = () => {
      if (cancelled) return;
      setMobileLiveRoot(
        document.getElementById("tmre-intel-mobile-live-root"),
      );
    };
    sync();
    const raf = window.requestAnimationFrame(sync);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(raf);
    };
  }, []);
  const syncPhraseAnimKeyRef = useRef<string | null>(null);
  const syncPhraseAnimDoneRef = useRef<string | null>(null);
  const [sortFieldDrawerOpen, setSortFieldDrawerOpen] = useState(false);
  // Safety: never leave the sort drawer’s body scroll-lock stuck after close.
  useEffect(() => {
    if (sortFieldDrawerOpen) return;
    document.documentElement.style.overflow = "";
    document.body.style.overflow = "";
  }, [sortFieldDrawerOpen]);
  const [townLinksExpanded, setTownLinksExpanded] = useState(false);
  const [zipLinksExpanded, setZipLinksExpanded] = useState(false);
  /** Phone: after town (+ zip when multi-zip) is chosen, collapse location pills. */
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [mobileZipConfirmed, setMobileZipConfirmed] = useState(false);
  /** Phone: town market tagline fades out 10s after a town is selected. */
  const [showMobileTownTagline, setShowMobileTownTagline] = useState(true);
  /**
   * Desktop listings blurb erase: once erasing, freeze the sentence and drop
   * characters from the front (~2/sec). null = show the live JSX blurb.
   */
  const [listingsBlurbFrozen, setListingsBlurbFrozen] = useState<string | null>(
    null,
  );
  const [listingsBlurbCharsRemoved, setListingsBlurbCharsRemoved] = useState(0);
  const setFiltersExpanded = (expanded: boolean) =>
    setFiltersExpandedPref(expanded ? "true" : "false");
  const [hoveredZip, setHoveredZip] = useState<string | null>(null);
  const [hoveredZipEl, setHoveredZipEl] = useState<HTMLElement | null>(null);
  const [hoveredTown, setHoveredTown] = useState<TmreTown | "All" | null>(null);
  const [hoveredTownEl, setHoveredTownEl] = useState<HTMLElement | null>(null);
  const townHoverClearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Desktop hover flash hold; touch uses the shorter touch constants below. */
  const TOWN_MAP_FLASH_MS = 1_000;
  const ZIP_MAP_FLASH_MS = 1_500;
  const TOWN_MAP_FLASH_MS_TOUCH = 900;
  const ZIP_MAP_FLASH_MS_TOUCH = 1_200;
  const ALL_TOWNS_MAP_FLASH_MS = 2_000;
  const ALL_TOWNS_MAP_FLASH_MS_TOUCH = 1_800;
  const MAP_FADE_MS = 220;
  const [flashedTown, setFlashedTown] = useState<TmreTown | "All" | null>(null);
  const townMapHoldCityRef = useRef<TmreTown | "All" | null>(null);
  const townFilterAnchorRef = useRef<HTMLDivElement>(null);
  const [townFilterAnchorEl, setTownFilterAnchorEl] =
    useState<HTMLDivElement | null>(null);
  const bindTownFilterAnchor = (el: HTMLDivElement | null) => {
    townFilterAnchorRef.current = el;
    setTownFilterAnchorEl(el);
  };
  const townMapFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [flashedZip, setFlashedZip] = useState<string | null>(null);
  const zipFilterAnchorRef = useRef<HTMLDivElement>(null);
  const [zipFilterAnchorEl, setZipFilterAnchorEl] =
    useState<HTMLDivElement | null>(null);
  const bindZipFilterAnchor = (el: HTMLDivElement | null) => {
    zipFilterAnchorRef.current = el;
    setZipFilterAnchorEl(el);
  };
  const zipMapFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [boundaryMapExiting, setBoundaryMapExiting] = useState(false);
  const boundaryMapFadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const prefersFineHover = () =>
    typeof window !== "undefined" &&
    window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  /**
   * Reactive twin of `prefersFineHover()`. The boundary map only accepts clicks
   * on mouse pointers — on touch it must stay click-through so it never eats a
   * tap meant for the page underneath.
   */
  const [fineHoverPointer, setFineHoverPointer] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(hover: hover) and (pointer: fine)");
    const sync = () => setFineHoverPointer(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const clearTownMapFlashTimer = () => {
    if (townMapFlashTimerRef.current) {
      clearTimeout(townMapFlashTimerRef.current);
      townMapFlashTimerRef.current = null;
    }
  };

  const clearZipMapFlashTimer = () => {
    if (zipMapFlashTimerRef.current) {
      clearTimeout(zipMapFlashTimerRef.current);
      zipMapFlashTimerRef.current = null;
    }
  };

  const clearBoundaryMapFadeTimer = () => {
    if (boundaryMapFadeTimerRef.current) {
      clearTimeout(boundaryMapFadeTimerRef.current);
      boundaryMapFadeTimerRef.current = null;
    }
  };

  const fadeClearBoundaryMaps = (clear: () => void) => {
    clearBoundaryMapFadeTimer();
    setBoundaryMapExiting(true);
    boundaryMapFadeTimerRef.current = setTimeout(() => {
      clear();
      setBoundaryMapExiting(false);
      boundaryMapFadeTimerRef.current = null;
    }, MAP_FADE_MS);
  };

  /** Pointer moved from a pill onto the boundary map — keep it on screen. */
  const holdBoundaryMapOpen = () => {
    if (townHoverClearTimer.current) {
      clearTimeout(townHoverClearTimer.current);
      townHoverClearTimer.current = null;
    }
    clearTownMapFlashTimer();
    clearBoundaryMapFadeTimer();
    setBoundaryMapExiting(false);
  };

  /** Pointer left the boundary map itself. */
  const releaseBoundaryMap = () => {
    if (townHoverClearTimer.current) {
      clearTimeout(townHoverClearTimer.current);
      townHoverClearTimer.current = null;
    }
    clearTownMapFlashTimer();
    fadeClearBoundaryMaps(() => {
      setHoveredTown(null);
      setHoveredTownEl(null);
      setFlashedTown(null);
    });
  };

  const beginTownMapHold = (holdMs: number) => {
    clearTownMapFlashTimer();
    townMapFlashTimerRef.current = setTimeout(() => {
      townMapFlashTimerRef.current = null;
      townMapHoldCityRef.current = null;
      fadeClearBoundaryMaps(() => setFlashedTown(null));
    }, holdMs);
  };

  const flashTownMapOnSelect = (city: TmreTown | "All") => {
    clearTownMapFlashTimer();
    clearZipMapFlashTimer();
    clearBoundaryMapFadeTimer();
    setBoundaryMapExiting(false);
    setFlashedZip(null);
    townMapHoldCityRef.current = city;
    if (city === "All") prefetchAllTownBoundaries();
    else prefetchTownBoundaries(city);
    setFlashedTown(city);
    // Phone: keep the outline up until the next town/zip tap. A 0.9s flash
    // after the last TIGER fix is why Fairfield vanished.
    if (prefersFineHover()) beginTownMapHold(8_000);
  };

  /** Desktop only — replace the fallback hold once rings have painted. */
  const onTownMapSettled = () => {
    if (townMapHoldCityRef.current == null) return;
    if (!prefersFineHover()) return;
    const holdMs =
      townMapHoldCityRef.current === "All"
        ? ALL_TOWNS_MAP_FLASH_MS
        : TOWN_MAP_FLASH_MS;
    beginTownMapHold(holdMs);
  };

  const flashZipMapOnSelect = (nextZip: string | null) => {
    clearZipMapFlashTimer();
    clearTownMapFlashTimer();
    clearBoundaryMapFadeTimer();
    setBoundaryMapExiting(false);
    setFlashedTown(null);
    townMapHoldCityRef.current = null;
    setHoveredTown(null);
    setHoveredTownEl(null);
    if (!nextZip) {
      setFlashedZip(null);
      setHoveredZip(null);
      setHoveredZipEl(null);
      return;
    }
    prefetchZipBoundaries([
      nextZip,
      ...availableZips.filter((z) => z !== nextZip),
    ]);
    setHoveredZip(null);
    setHoveredZipEl(null);
    setFlashedZip(nextZip);
    if (!prefersFineHover()) return;
    const holdMs = ZIP_MAP_FLASH_MS;
    zipMapFlashTimerRef.current = setTimeout(() => {
      zipMapFlashTimerRef.current = null;
      fadeClearBoundaryMaps(() => setFlashedZip(null));
    }, holdMs);
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
  const [boardView, setBoardView] = usePersistedFilter<DealBoardCardView>(
    DEAL_BOARD_VIEW_PREF_KEY,
    DEAL_BOARD_VIEW_DEFAULT,
    DEAL_BOARD_CARD_VIEW_VALUES,
    false,
    dealBoardViewDefaultForViewport,
  );
  const [mapOnPref, setMapOnPref] = usePersistedFilter(
    DEAL_BOARD_MAP_ON_PREF_KEY,
    "off",
    ["on", "off"] as const,
  );
  const showMap = mapOnPref === "on";
  const [mapLayout, setMapLayout] = usePersistedFilter<DealBoardMapLayout>(
    DEAL_BOARD_MAP_LAYOUT_PREF_KEY,
    DEAL_BOARD_MAP_LAYOUT_DEFAULT,
    DEAL_BOARD_MAP_LAYOUT_VALUES,
    false,
    () =>
      dealBoardMapLayoutFromStored(
        readClientPref(DEAL_BOARD_MAP_LAYOUT_PREF_KEY),
      ),
  );
  /** Left / Right both put the map in its own column next to the cards. */
  const mapBeside = mapLayout !== "top";
  /** Pin ↔ card selection for the Map view. */
  const [mapActiveKey, setMapActiveKey] = useState<string | null>(null);
  /** Phone: map takes the whole viewport, keeping its own pagination + pills. */
  const [mapFullscreen, setMapFullscreen] = useState(false);
  const mapChromeRef = useRef<HTMLDivElement>(null);
  const [mapFitInset, setMapFitInset] = useState({
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  });
  const mapBoundZips = useMemo(
    () => [...mapBoundZipsForScope(active, zip)],
    [active, zip],
  );

  // Phone chrome sits on the map; fit the town to the leftover rectangle so
  // the outline touches the visible edge (regular + full screen).
  useEffect(() => {
    if (!showMap) {
      setMapFitInset({ top: 0, right: 0, bottom: 0, left: 0 });
      return;
    }
    const el = mapChromeRef.current;
    const measure = () => {
      const phone = window.matchMedia("(max-width: 767px)").matches;
      const bottom =
        phone && el ? Math.round(el.getBoundingClientRect().height) : 0;
      setMapFitInset({ top: 0, right: 0, bottom, left: 0 });
    };
    measure();
    const ro =
      el && typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(measure)
        : null;
    if (el && ro) ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [showMap, mapFullscreen, isMobileViewport]);

  useEffect(() => {
    if (readClientPref(DEAL_BOARD_VIEW_PREF_KEY) === "map") {
      setMapOnPref("on");
    }
  }, [setMapOnPref]);

  // Full screen is a phone affordance and dies with the map or the breakpoint.
  useEffect(() => {
    if (!showMap || !isMobileViewport) setMapFullscreen(false);
  }, [isMobileViewport, showMap]);

  useEffect(() => {
    if (!mapFullscreen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMapFullscreen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [mapFullscreen]);

  // Turning the map off ends the reveal, so the next map open starts graph-free.
  useEffect(() => {
    if (!showMap) setMapGraphsRevealed(false);
  }, [showMap]);

  useEffect(() => {
    if (!showMap) return;
    if (active === "All") prefetchAllTownBoundaries();
    else prefetchTownBoundaries(active);
  }, [active, showMap]);

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
        newConstruction:
          newConstructionFilter === "new"
            ? true
            : newConstructionFilter === "not-new"
              ? false
              : null,
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
    newConstructionFilter,
    boardStatusFilter,
  ]);

  const [middleTierExpanded, setMiddleTierExpanded] = useState(false);
  const [boardPage, setBoardPage] = useState(1);
  const [expandedSnapshotKeys, setExpandedSnapshotKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const [expandedSnapshotsHydrated, setExpandedSnapshotsHydrated] = useState(false);
  const boardRef = useRef<HTMLDivElement>(null);
  const miniGraphsInteractRef = useRef<(() => void) | null>(null);
  const pauseMiniGraphsRotation = () => {
    miniGraphsInteractRef.current?.();
  };
  const [heroIntroDismissed, setHeroIntroDismissed] = useState(false);
  /**
   * Phone only: 5s after the hero intro collapses, replace the DOTD card with a
   * left “Deal of the Day” control and right-aligned Months supply (same mono
   * idle size / title case as the descriptor line).
   * Tapping the control restores the DOTD preview (and descriptor months supply).
   */
  const [mobileHeroCompactChrome, setMobileHeroCompactChrome] = useState(false);
  /** After the user restores the preview, don’t auto-collapse again this visit. */
  const [mobileHeroCompactSuspended, setMobileHeroCompactSuspended] =
    useState(false);
  const [listingsRefresh, setListingsRefresh] = useState<{
    refreshing: boolean;
    lastFinishedAt: string | null;
    lastKind: string | null;
    refreshingKind: string | null;
  }>({
    refreshing: false,
    lastFinishedAt: null,
    lastKind: null,
    refreshingKind: null,
  });
  const listingsWasRefreshingRef = useRef(false);
  const listingsSoftReloadRef = useRef(false);
  const listingsSoftReloadTimerRef = useRef<number | null>(null);
  // Monthly sales counts per city for months-of-supply calculation
  const [monthlySales, setMonthlySales] = useState<Record<string, number>>({});
  const [closedThisWeekByTown, setClosedThisWeekByTown] = useState<Record<string, number>>({});
  const [closedThisWeekByTownZip, setClosedThisWeekByTownZip] = useState<
    Record<string, Record<string, number>>
  >({});
  const [wentToContractThisWeekByTown, setWentToContractThisWeekByTown] = useState<
    Record<string, number>
  >({});
  const [wentToContractThisWeekByTownZip, setWentToContractThisWeekByTownZip] =
    useState<Record<string, Record<string, number>>>({});
  const [monthlySalesLoaded, setMonthlySalesLoaded] = useState(false);
  /** Precomputed months-supply index (town × sale|rental × property class). */
  const [monthsSupplyEntries, setMonthsSupplyEntries] = useState<
    MonthsSupplyCacheEntry[] | null
  >(null);

  const orderedCities = usePersonalizedTowns(knownTowns);

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
    if (!isMobileViewport || !heroIntroDismissed) {
      setMobileHeroCompactChrome(false);
      return;
    }
    if (mobileHeroCompactSuspended) return;
    const timer = window.setTimeout(() => setMobileHeroCompactChrome(true), 5_000);
    return () => window.clearTimeout(timer);
  }, [isMobileViewport, heroIntroDismissed, mobileHeroCompactSuspended]);

  useEffect(() => {
    return () => {
      clearTownMapFlashTimer();
      clearZipMapFlashTimer();
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
          lastKind?: string | null;
          refreshingKind?: string | null;
        };
        setListingsRefresh({
          refreshing: data.refreshing,
          lastFinishedAt: data.lastFinishedAt,
          lastKind: data.lastKind ?? null,
          refreshingKind: data.refreshingKind ?? null,
        });
        if (listingsWasRefreshingRef.current && !data.refreshing) {
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
                      setWentToContractThisWeekByTown,
                      setWentToContractThisWeekByTownZip,
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
        listingsWasRefreshingRef.current = data.refreshing;
      } catch {
        /* ignore polling errors */
      }
    };

    pollRefreshStatus();
    const id = window.setInterval(
      pollRefreshStatus,
      listingsRefresh.refreshing ? 5_000 : 3_000,
    );
    return () => {
      cancelled = true;
      window.clearInterval(id);
      if (listingsSoftReloadTimerRef.current != null) {
        window.clearTimeout(listingsSoftReloadTimerRef.current);
      }
    };
  }, [listingsRefresh.refreshing, tx]);

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

    setActive(urlSearch.city as IntelCity);
    if (urlSearch.tx) setTx(urlSearch.tx as TxFilter);
    if (urlSearch.cls) setCls(urlSearch.cls as ClsFilter);
    if (urlSearch.property) {
      setSaleProperty(urlSearch.property as SalePropertyFilter);
    } else if (urlSearch.tx === "rental" || urlSearch.cls === "commercial") {
      setSaleProperty("all");
    }

    if (urlSearch.resetMinor) {
      // Market Pulse (and similar) deep links: apply criteria, wipe leftover prefs.
      setZip(null);
      setMinBedsFilter("0");
      setMaxBedsFilter("6");
      setMinBathsFilter("0");
      setMaxBathsFilter("6");
      setMinVintageFilter("0");
      setMaxVintageFilter("6");
      setNewConstructionFilter("all");
      setFurnishedFilter("all");
      setUnderContractPref("off");
      setBoardStatusFilter("all");
      setSortKey("score");
      setSortDir("desc");
      setMinPriceIndex(0);
      setMaxPriceIndex(INTEL_PRICE_MAX_INDEX);
      setMinSqftIndex(0);
      setMaxSqftIndex(INTEL_SQFT_MAX_INDEX);
      setActivePriceBandId(null);
      setActiveLuxuryPriceBandId(null);
      setActiveDomBandId(null);
      setDomBandMinDays(null);
      setDomBandMaxDays(null);
      priceRangeCustomizedRef.current = false;
      sqftRangeCustomizedRef.current = false;
    } else {
      setZip(urlSearch.zip);
      if (urlSearch.bedsMin != null) {
        setMinBedsFilter(String(urlSearch.bedsMin) as MinBedFilter);
      }
      if (urlSearch.bedsMax != null) {
        setMaxBedsFilter(String(urlSearch.bedsMax) as MinBedFilter);
      } else if (urlSearch.exactBeds && urlSearch.bedsMin != null) {
        setMaxBedsFilter(String(urlSearch.bedsMin) as MinBedFilter);
      }
      if (urlSearch.bathsMin != null) {
        setMinBathsFilter(String(urlSearch.bathsMin) as MinBathFilter);
      }
      if (urlSearch.bathsMax != null) {
        setMaxBathsFilter(String(urlSearch.bathsMax) as MinBathFilter);
      }
      if (urlSearch.vintageMin != null) {
        setMinVintageFilter(String(urlSearch.vintageMin) as VintageIndexFilter);
      }
      if (urlSearch.vintageMax != null) {
        setMaxVintageFilter(String(urlSearch.vintageMax) as VintageIndexFilter);
      }
      setNewConstructionFilter(
        urlSearch.newConstruction === true
          ? "new"
          : urlSearch.newConstruction === false
            ? "not-new"
            : "all",
      );
      if (urlSearch.status) {
        setBoardStatusFilter(urlSearch.status as BoardStatusFilter);
      }
      if (urlSearch.furnished) {
        setFurnishedFilter(urlSearch.furnished as FurnishedFilter);
      }
      if (urlSearch.underContract) setUnderContractPref("on");
      // Sort applied in a dedicated effect below so it wins over cookie hydration.
    }
    // Keep a compact shareable URL in the address bar (no hex id). The #deal-…
    // row anchor from "Back to deal board" has to survive the rewrite.
    window.history.replaceState(
      null,
      "",
      `${buildIntelligenceShareHref({
        city: urlSearch.city,
        zip: urlSearch.resetMinor ? null : urlSearch.zip,
        tx: urlSearch.tx ?? undefined,
        cls: urlSearch.cls ?? undefined,
        property: urlSearch.property ?? undefined,
        bedsMin: urlSearch.resetMinor
          ? undefined
          : (urlSearch.bedsMin ?? undefined),
        bedsMax: urlSearch.resetMinor
          ? undefined
          : (urlSearch.bedsMax ?? undefined),
        bathsMin: urlSearch.resetMinor
          ? undefined
          : (urlSearch.bathsMin ?? undefined),
        bathsMax: urlSearch.resetMinor
          ? undefined
          : (urlSearch.bathsMax ?? undefined),
        vintageMin: urlSearch.resetMinor
          ? undefined
          : (urlSearch.vintageMin ?? undefined),
        vintageMax: urlSearch.resetMinor
          ? undefined
          : (urlSearch.vintageMax ?? undefined),
        newConstruction: urlSearch.resetMinor
          ? null
          : urlSearch.newConstruction,
        status: urlSearch.resetMinor
          ? undefined
          : (urlSearch.status ?? undefined),
        sort: urlSearch.resetMinor ? "score" : (urlSearch.sort ?? "score"),
        dir: urlSearch.resetMinor
          ? "desc"
          : (urlSearch.dir ?? "desc"),
        view: urlSearch.view ?? undefined,
        furnished: urlSearch.resetMinor ? null : urlSearch.furnished,
        underContract: urlSearch.resetMinor ? false : urlSearch.underContract,
        minPrice: urlSearch.resetMinor
          ? undefined
          : (urlSearch.minPrice ?? undefined),
        maxPrice: urlSearch.resetMinor
          ? undefined
          : (urlSearch.maxPrice ?? undefined),
        minSqft: urlSearch.resetMinor
          ? undefined
          : (urlSearch.minSqft ?? undefined),
        maxSqft: urlSearch.resetMinor
          ? undefined
          : (urlSearch.maxSqft ?? undefined),
        domBand: urlSearch.resetMinor ? null : urlSearch.domBand,
      })}${window.location.hash}`,
    );
  }, [
    urlSearch,
    setActive,
    setZip,
    setMinBedsFilter,
    setMaxBedsFilter,
    setMinBathsFilter,
    setMaxBathsFilter,
    setMinVintageFilter,
    setMaxVintageFilter,
    setTx,
    setCls,
    setSaleProperty,
    setNewConstructionFilter,
    setBoardStatusFilter,
    setFurnishedFilter,
    setUnderContractPref,
  ]);

  // Sort / view from the share URL must beat usePersistedFilter cookie hydration.
  // Declared after those hooks' effects and re-run when urlSearch is present so
  // a shared sort/dir/view is not overwritten by cookies.
  useEffect(() => {
    if (!urlSearch) return;
    if (urlSearch.resetMinor) {
      setSortKey("score");
      setSortDir("desc");
      return;
    }
    const key =
      urlSearch.sort &&
      (SORT_KEY_VALUES as readonly string[]).includes(urlSearch.sort)
        ? (urlSearch.sort as SortKey)
        : "score";
    setSortKey(key);
    setSortDir(urlSearch.dir ?? "desc");
    if (
      urlSearch.view === "large" ||
      urlSearch.view === "grid" ||
      urlSearch.view === "line"
    ) {
      setBoardView(urlSearch.view);
    }
    if (urlSearch.mapOn) setMapOnPref("on");
    if (urlSearch.mapLayout) setMapLayout(urlSearch.mapLayout);
  }, [urlSearch, setSortKey, setSortDir, setBoardView, setMapLayout]);

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
            setWentToContractThisWeekByTown,
            setWentToContractThisWeekByTownZip,
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
      const toContract: Record<string, number> = {};
      const toContractByZip: Record<string, Record<string, number>> = {};
      for (const city of TMRE_TOWNS) {
        sales[city] = 0;
        closed[city] = 0;
        closedByZip[city] = {};
        toContract[city] = 0;
        toContractByZip[city] = {};
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
        if (typeof d.wentToContractThisWeek === "number") {
          toContract[city] = (toContract[city] ?? 0) + d.wentToContractThisWeek;
        }
        if (
          d.wentToContractThisWeekByZip &&
          typeof d.wentToContractThisWeekByZip === "object"
        ) {
          for (const [zipCode, count] of Object.entries(
            d.wentToContractThisWeekByZip as Record<string, number>,
          )) {
            toContractByZip[city][zipCode] =
              (toContractByZip[city][zipCode] ?? 0) + count;
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
      setWentToContractThisWeekByTown(toContract);
      setWentToContractThisWeekByTownZip(toContractByZip);
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
  /**
   * Board pool per town. Plain "Under Contract" rows are dropped here rather
   * than inside filterBoardListings, so the board, town/zip counts, price and
   * sqft ladders and snapshots all work from one universe of listings.
   */
  const poolByCity = useMemo(() => {
    if (showUnderContract) return byCity;
    const next = {} as Record<TmreTown, DisplayListing[] | null>;
    for (const town of TMRE_TOWNS) {
      const rows = byCity[town];
      next[town] = rows
        ? rows.filter((l) => !listingHiddenAsUnderContract(l))
        : rows;
    }
    return next;
  }, [byCity, showUnderContract]);
  const liveListings: DisplayListing[] = active === "All"
    ? Object.values(poolByCity).flatMap((l) => l ?? [])
    : (poolByCity[active] ?? []);
  const allListings: DisplayListing[] = active === "All"
    ? (liveListings.length > 0
        ? liveListings
        : MOCK_FALLBACK.flatMap((d) => d.listings.map((l) => ({ ...l, city: d.city }))))
    : (liveListings.length > 0
        ? liveListings
        : (snapshot?.listings ?? []).map((l) => ({ ...l, city: active })));

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
    if (filtersExpanded) {
      setCollapsedSlidersOpen(false);
      setExposedSliders(null);
    }
  }, [filtersExpanded]);

  // Fresh load / client navigation: keep class-pill chevron minimized so
  // descriptors stay visible (same chrome as after scrolling + collapse).
  useEffect(() => {
    setFilterChromeCollapsed(true);
    setFilterChromePeeks([]);
    try {
      setMiniGraphsHidden(sessionStorage.getItem("tmre-intel-mini-graphs-hidden") === "1");
    } catch {
      /* private mode */
    }
  }, []);

  useEffect(() => {
    // Full Edit-all (no peek) stays open on outside click. Descriptor / mag-glass
    // peeks dismiss — including a partial peek over an Edit-all session.
    if (filtersExpanded && exposedSliders == null) return;
    if (!collapsedSlidersOpen && exposedSliders == null) return;
    const dismissCollapsedSliders = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest("[data-intel-slider-panel]")) return;
      if (target.closest("[data-intel-collapsed-slider-label]")) return;
      if (target.closest("[data-intel-slider-context-blurb]")) return;
      if (target.closest("[data-intel-slider-context-blurb-pinned]")) return;
      setCollapsedSlidersOpen(false);
      setExposedSliders(null);
      dropFilterChromePeek("sliders");
      setPriceSliderActive(false, { immediate: true });
      setBedSliderActive(false, { immediate: true });
      setBathSliderActive(false, { immediate: true });
      setVintageSliderActive(false, { immediate: true });
      setSqftSliderActive(false, { immediate: true });
      setFurnishedSliderActive(false, { immediate: true });
    };
    window.addEventListener("pointerdown", dismissCollapsedSliders);
    return () => window.removeEventListener("pointerdown", dismissCollapsedSliders);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collapsedSlidersOpen, filtersExpanded, exposedSliders]);

  useEffect(() => {
    if (active === "All" || availableZips.length <= 1) setZip(null);
  }, [active, availableZips.length, setZip]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    const sync = () => setIsMobileViewport(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // Phone: start with the other towns visible, then FILTER_PEEK_IDLE_MS hides them.
  useEffect(() => {
    if (isMobileViewport) setTownLinksExpanded(true);
  }, [isMobileViewport]);

  useEffect(() => {
    setMobileZipConfirmed(false);
  }, [active]);

  // Persisted / deep-linked zip means the location choice is already settled.
  useEffect(() => {
    if (zip != null) setMobileZipConfirmed(true);
  }, [zip]);

  useEffect(() => {
    setZipLinksExpanded(false);
  }, [active]);

  // Multi-zip towns on phone: keep zip choices open until a zip is tapped.
  useEffect(() => {
    if (
      isMobileViewport &&
      active !== "All" &&
      townHasMultipleZips(active) &&
      availableZips.length > 1 &&
      !mobileZipConfirmed
    ) {
      setZipLinksExpanded(true);
    }
  }, [isMobileViewport, active, availableZips.length, mobileZipConfirmed]);

  useEffect(() => {
    if (active !== "All" && availableZips.length > 1) {
      prefetchZipBoundaries(availableZips);
    }
  }, [active, availableZips]);

  // Phone: hide market tagline 10s after a specific town is selected.
  useEffect(() => {
    if (!isMobileViewport || active === "All") {
      setShowMobileTownTagline(true);
      return;
    }
    setShowMobileTownTagline(true);
    const timer = window.setTimeout(() => setShowMobileTownTagline(false), 10_000);
    return () => window.clearTimeout(timer);
  }, [active, isMobileViewport]);

  // Phone: keep location chrome peeked while a multi-zip town still needs a zip.
  // Do not steal an intentional For Sale/Rentals (tx) or slider peek.
  useEffect(() => {
    if (
      !isMobileViewport ||
      active === "All" ||
      mobileZipConfirmed ||
      !townHasMultipleZips(active) ||
      availableZips.length <= 1
    ) {
      return;
    }
    setFilterChromePeeks((prev) =>
      prev.includes("tx") || prev.includes("sliders") || prev.includes("towns")
        ? prev
        : [...prev, "towns"],
    );
  }, [
    isMobileViewport,
    active,
    mobileZipConfirmed,
    availableZips.length,
  ]);

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
        newConstructionFilter,
        furnishedFilter,
        false,
        0,
        null,
        minVintage,
        maxVintage,
      ),
    [allListings, tx, cls, zip, boardStatusFilter, saleProperty, minBedrooms, maxBedrooms, minBathrooms, maxBathrooms, newConstructionFilter, furnishedFilter, minVintage, maxVintage],
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
        newConstructionFilter,
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
      newConstructionFilter,
      furnishedFilter,
    ],
  );

  useEffect(() => {
    if (priceFilterContextRef.current !== priceFilterContextKey) {
      priceFilterContextRef.current = priceFilterContextKey;
      setActivePriceBandId(null);
      setActiveLuxuryPriceBandId(null);
      setActiveDomBandId(null);
      setDomBandMinDays(null);
      setDomBandMaxDays(null);
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
        newConstructionFilter,
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
      newConstructionFilter,
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
        newConstructionFilter,
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
      newConstructionFilter,
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

  const intelligenceShareState = useMemo(
    () => ({
      city: active,
      zip,
      tx,
      cls,
      property: saleProperty,
      bedsMin: minBedrooms,
      bedsMax: maxBedrooms,
      bathsMin: minBathrooms,
      bathsMax: maxBathrooms,
      vintageMin: minVintage,
      vintageMax: maxVintage,
      newConstruction:
        newConstructionFilter === "new"
          ? true
          : newConstructionFilter === "not-new"
            ? false
            : null,
      status: boardStatusFilter,
      sort: sortKey,
      dir: sortDir,
      view: dealBoardCardView(boardView),
      mapOn: showMap,
      mapLayout,
      furnished: furnishedFilter === "all" ? null : furnishedFilter,
      underContract: showUnderContract,
      minPrice:
        showPriceFilter && priceFilterActive && minPrice > 0
          ? minPrice
          : undefined,
      maxPrice:
        showPriceFilter &&
        priceFilterActive &&
        maxPrice != null &&
        Number.isFinite(maxPrice)
          ? maxPrice
          : undefined,
      minSqft: sqftFilterActive ? minSqft : undefined,
      maxSqft: sqftFilterActive ? maxSqft : undefined,
      domBand: activeDomBandId,
    }),
    [
      active,
      zip,
      tx,
      cls,
      saleProperty,
      minBedrooms,
      maxBedrooms,
      minBathrooms,
      maxBathrooms,
      minVintage,
      maxVintage,
      newConstructionFilter,
      boardStatusFilter,
      sortKey,
      sortDir,
      boardView,
      showMap,
      mapLayout,
      furnishedFilter,
      showUnderContract,
      showPriceFilter,
      priceFilterActive,
      minPrice,
      maxPrice,
      sqftFilterActive,
      minSqft,
      maxSqft,
      activeDomBandId,
    ],
  );
  const intelligenceShareHref = useMemo(
    () => buildIntelligenceShareHref(intelligenceShareState),
    [intelligenceShareState],
  );
  const intelligenceShareTitle = useMemo(
    () => buildIntelligenceShareTitle(intelligenceShareState),
    [intelligenceShareState],
  );

  // Keep the current board in the address bar so Back from a listing restores
  // sort, view, and filters (replaceState updates this history entry), and save
  // the same query string for return trips that arrive without one.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.pathname !== "/intelligence") return;
    // Hold the saved state until an inbound one has been applied, otherwise the
    // first render's defaults overwrite the board we are about to restore.
    if (!urlSearch || urlPriceSqftAppliedRef.current) {
      writeClientPref(
        INTEL_BOARD_STATE_PREF_KEY,
        intelligenceShareHref.split("?")[1] ?? "",
      );
    }
    // The #deal-… row anchor must survive; the focus restore below reads it.
    const hash = window.location.hash;
    const next = `${intelligenceShareHref}${hash}`;
    const current = `${window.location.pathname}${window.location.search}${hash}`;
    if (current === next) return;
    window.history.replaceState(null, "", next);
  }, [intelligenceShareHref, urlSearch]);

  // Apply price/sqft/DOM band from the share URL once board step ladders are
  // ready — the ladders only exist after listings land, which is also after the
  // filter-context effect above has stopped clearing these on hydration.
  useEffect(() => {
    if (!urlSearch || urlPriceSqftAppliedRef.current) return;
    const wantsPrice =
      urlSearch.minPrice != null || urlSearch.maxPrice != null;
    const wantsSqft = urlSearch.minSqft != null || urlSearch.maxSqft != null;
    const domBand = urlSearch.domBand
      ? parseDomBandId(urlSearch.domBand)
      : null;
    if (!wantsPrice && !wantsSqft && !domBand) {
      urlPriceSqftAppliedRef.current = true;
      return;
    }
    if (boardPriceSteps.length === 0) return;
    if (wantsSqft && boardSqftSteps.length === 0) return;

    urlPriceSqftAppliedRef.current = true;
    if (domBand) {
      setActiveDomBandId(urlSearch.domBand);
      setDomBandMinDays(domBand.minDays);
      setDomBandMaxDays(domBand.maxDays);
    }
    if (wantsPrice) {
      priceRangeCustomizedRef.current = true;
      if (urlSearch.minPrice != null) {
        setMinPriceIndex(
          minPriceToStepIndex(urlSearch.minPrice, boardPriceSteps),
        );
      }
      if (urlSearch.maxPrice != null) {
        setMaxPriceIndex(
          maxPriceToStepIndex(urlSearch.maxPrice, boardPriceSteps),
        );
      }
    }
    if (wantsSqft) {
      sqftRangeCustomizedRef.current = true;
      if (urlSearch.minSqft != null) {
        setMinSqftIndex(minSqftToStepIndex(urlSearch.minSqft, boardSqftSteps));
      }
      if (urlSearch.maxSqft != null) {
        setMaxSqftIndex(maxSqftToStepIndex(urlSearch.maxSqft, boardSqftSteps));
      }
    }
  }, [urlSearch, boardPriceSteps, boardSqftSteps]);

  useEffect(() => {
    setMiddleTierExpanded(false);
    setBoardPage(1);
  }, [active, tx, cls, saleProperty, zip, boardStatusFilter, minBedrooms, maxBedrooms, minBathrooms, maxBathrooms, minVintage, maxVintage, newConstructionFilter, furnishedFilter, underContractPref, minPriceIndex, maxPriceIndex, minSqftIndex, maxSqftIndex]);

  // Sort changes only reset page — keep middle-tier state so we don't force a
  // full remount of ~100 photo cards when leaving score/desc.
  useEffect(() => {
    setBoardPage(1);
  }, [sortKey, sortDir]);

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
        newConstructionFilter,
        furnishedFilter,
        false,
        minPrice,
        maxPrice,
        minVintage,
        maxVintage,
        minSqft,
        maxSqft,
        domBandMinDays,
        domBandMaxDays,
      ),
    [allListings, tx, cls, zip, boardStatusFilter, saleProperty, minBedrooms, maxBedrooms, minBathrooms, maxBathrooms, newConstructionFilter, furnishedFilter, minPrice, maxPrice, minVintage, maxVintage, minSqft, maxSqft, domBandMinDays, domBandMaxDays],
  );

  const rankedListings = useMemo(() => rankListingsByScore(listings), [listings]);
  // Keep sort chrome (chip / drawer) on the urgent sortKey/sortDir; defer the
  // heavy board reorder so tapping a column doesn't lock the main thread.
  const boardSortKey = useDeferredValue(sortKey);
  const boardSortDir = useDeferredValue(sortDir);
  const boardSortPending =
    boardSortKey !== sortKey || boardSortDir !== sortDir;
  const boardSortedListings = useMemo(() => {
    if (boardSortKey === "score") return rankedListings;
    return sortListings(listings, boardSortKey, boardSortDir);
  }, [listings, rankedListings, boardSortKey, boardSortDir]);
  const boardPageSize = showMap ? BOARD_MAP_LISTING_LIMIT : BOARD_LISTING_LIMIT;
  const boardListings = useMemo(() => {
    const start = (boardPage - 1) * boardPageSize;
    return boardSortedListings.slice(start, start + boardPageSize);
  }, [boardSortedListings, boardPage, boardPageSize]);

  const boardPrefetchIds = useMemo(() => {
    // Display order for the current page so prefetch matches what the user sees.
    return boardListings.map((l) => l.key);
  }, [boardListings]);

  const boardTiers = useMemo(() => {
    const rows = boardListings;
    // Middle tier only makes sense in the default score ranking (high → low).
    // Any other sort (or score ascending) shows the flat list — no collapse band.
    if (
      !intelligenceMiddleTierEligible({
        sortKey: boardSortKey,
        sortDir: boardSortDir,
        vintageFilterActive: vintageFilterActive(minVintage, maxVintage),
      })
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
    // Too few results to hide a middle band — keep one flat list so grid/large
    // views don't restart columns in separate top/middle/bottom CSS grids.
    if (!planned.canCollapse) {
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
    return {
      top: sortListings(planned.top, boardSortKey, boardSortDir),
      middle: sortListings(
        [...planned.middlePinned, ...planned.middleCollapsible],
        boardSortKey,
        boardSortDir,
      ),
      middlePinned: sortListings(planned.middlePinned, boardSortKey, boardSortDir),
      middleCollapsible: sortListings(
        planned.middleCollapsible,
        boardSortKey,
        boardSortDir,
      ),
      bottom: sortListings(planned.bottom, boardSortKey, boardSortDir),
      canTier: tiers.canTier,
      canCollapse: planned.canCollapse,
      hideableCount: planned.hideableCount,
    };
  }, [boardListings, boardSortKey, boardSortDir, minVintage, maxVintage]);

  const filteredCount = listings.length;
  const resultCount = boardListings.length;
  const totalBoardPages = Math.max(1, Math.ceil(filteredCount / boardPageSize));
  const boardPageStart =
    filteredCount === 0 ? 0 : (boardPage - 1) * boardPageSize + 1;
  const boardPageEnd = Math.min(boardPage * boardPageSize, filteredCount);
  const showBoardPagination = filteredCount > boardPageSize;

  useEffect(() => {
    if (state !== "ready" || boardPrefetchIds.length === 0) return;
    // Grid/large cards load their own photos — skip stack prefetch to avoid RETS storms.
    if (boardView === "grid" || boardView === "large") return;
    return prefetchMlsPhotoThumbsOrdered(boardPrefetchIds, {
      stackPhotosForTop: PHOTO_BATCH_WHEN_PAGED,
      stackPhotoCount: 1,
      // 100+ results: only warm the first batch so photos don't contend.
      maxPrefetch: showBoardPagination ? PHOTO_BATCH_WHEN_PAGED : undefined,
    });
  }, [boardPrefetchIds, state, boardView, showBoardPagination]);

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

  const listingsBlurbLive =
    state === "loading" && liveListings === null
      ? null
      : resultCount === 0
        ? null
        : `${filteredCount.toLocaleString()} of ${poolCount.toLocaleString()} of your listings${
            active === "All" ? "" : ` in ${active}`
          }${sortKey === "score" ? ", scored." : "."}`;

  /** Filter identity — new search (or first results) reinstates the blurb erase. */
  const listingsBlurbSearchKey = [
    active,
    zip ?? "",
    tx,
    cls,
    saleProperty,
    sortKey,
    boardStatusFilter,
    String(minBedrooms),
    String(maxBedrooms),
    String(minBathrooms),
    String(maxBathrooms),
    String(minVintage),
    String(maxVintage),
    String(minPriceIndex),
    String(maxPriceIndex),
    String(minSqftIndex),
    String(maxSqftIndex),
    newConstructionFilter,
    furnishedFilter,
    listingsBlurbLive ? "has-blurb" : "no-blurb",
  ].join("|");

  const listingsBlurbLiveRef = useRef(listingsBlurbLive);
  listingsBlurbLiveRef.current = listingsBlurbLive;

  // Desktop: after 10s, erase the listings blurb from the first letter (4/sec).
  // Reinstate whenever the user issues a new search (filter key changes).
  useEffect(() => {
    setListingsBlurbFrozen(null);
    setListingsBlurbCharsRemoved(0);

    if (typeof window === "undefined") return;
    if (!window.matchMedia("(min-width: 1024px)").matches) return;
    if (!listingsBlurbLiveRef.current) return;

    let cancelled = false;
    let intervalId: number | null = null;

    const holdId = window.setTimeout(() => {
      if (cancelled) return;
      const frozen = listingsBlurbLiveRef.current;
      if (!frozen) return;
      setListingsBlurbFrozen(frozen);
      let removed = 0;
      intervalId = window.setInterval(() => {
        if (cancelled) return;
        removed += 1;
        if (removed >= frozen.length) {
          if (intervalId != null) window.clearInterval(intervalId);
          intervalId = null;
          setListingsBlurbCharsRemoved(frozen.length);
          return;
        }
        setListingsBlurbCharsRemoved(removed);
      }, 250);
    }, 10_000);

    return () => {
      cancelled = true;
      window.clearTimeout(holdId);
      if (intervalId != null) window.clearInterval(intervalId);
    };
  }, [listingsBlurbSearchKey]);

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
      // The row link's `from=` only names the row. Record the whole search so
      // Back — and anything shared from that listing — rebuilds these filters.
      persistReturnNav({
        href: currentDealBoardReturnPath(mlsId),
        label: "Deal board",
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

    const targetPage = Math.floor(idx / boardPageSize) + 1;
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
    boardPageSize,
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
        poolByCity[town] ?? [],
        tx,
        cls,
        null,
        boardStatusFilter,
        saleProperty,
        minBedrooms,
        maxBedrooms,
        minBathrooms,
        maxBathrooms,
        newConstructionFilter,
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
  }, [poolByCity, state, tx, cls, boardStatusFilter, saleProperty, minBedrooms, maxBedrooms, minBathrooms, maxBathrooms, newConstructionFilter, furnishedFilter, minPrice, maxPrice, minVintage, maxVintage, minSqft, maxSqft]);

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
      newConstructionFilter,
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
  }, [allListings, active, tx, cls, boardStatusFilter, saleProperty, minBedrooms, maxBedrooms, minBathrooms, maxBathrooms, newConstructionFilter, furnishedFilter, minPrice, maxPrice, minVintage, maxVintage, minSqft, maxSqft]);

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
    newConstructionFilter !== "all" ||
    furnishedFilter !== "all" ||
    showUnderContract ||
    zip != null ||
    boardStatusFilter !== "all" ||
    priceFilterActive ||
    activeDomBandId != null;
  const showZipFilters = active !== "All" && availableZips.length > 1;
  const townNeedsMobileZipPick =
    isMobileViewport &&
    active !== "All" &&
    townHasMultipleZips(active) &&
    showZipFilters &&
    !mobileZipConfirmed;
  /**
   * Phone: hide town pills after a town is chosen, unless that town still needs
   * a zip pick. Hide zip pills once a zip is confirmed. Expanding filters or
   * peeking towns via the descriptor reveals them again.
   */
  const mobileLocationChromeHidden =
    isMobileViewport &&
    active !== "All" &&
    !townNeedsMobileZipPick &&
    filterChromeCollapsed &&
    !isPeeking("towns");
  const showMobileTownPills = !mobileLocationChromeHidden;
  const showMobileZipPills = !mobileLocationChromeHidden;
  /**
   * Phone: the pill row is already a deliberate reveal, so "... more towns"
   * only costs a second tap to see the towns. Show the list outright there.
   */
  /**
   * Phone used to force this open (`|| isMobileViewport`), which meant the
   * other towns never collapsed after FILTER_PEEK_IDLE_MS. The list now
   * opens on purpose (peek / All Towns / “… more towns”) and times out.
   */
  const townLinksOpen = townLinksExpanded;
  const inlineTownZip =
    showZipFilters && !townLinksOpen && !zipLinksExpanded;

  function handleSort(key: DealBoardSortKey) {
    // Lookey-only column — Intelligence has no last-looked clock.
    if (key === "looked") return;
    // Update sort state urgently so the chip/drawer respond immediately.
    // Board rows follow via useDeferredValue(boardSortKey/Dir) above.
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
      return;
    }
    setSortKey(key);
    setSortDir(
      key === "status" || key === "town" || key === "price" ? "asc" : "desc",
    );
  }

  /** Sort drawer ↑ / ↓: field and direction land in one action. */
  function handleSortDir(key: DealBoardSortKey, dir: DealBoardSortDir) {
    if (key === "looked") return;
    setSortKey(key);
    setSortDir(dir);
  }

  const slidersCustomized =
    bedBathFilterActive(minBedrooms, maxBedrooms) ||
    bedBathFilterActive(minBathrooms, maxBathrooms) ||
    vintageFilterActive(minVintage, maxVintage) ||
    sqftFilterActive ||
    priceFilterActive ||
    furnishedFilter !== "all" ||
    showUnderContract;

  function isSliderKindCustomized(kind: IntelSliderKind): boolean {
    switch (kind) {
      case "price":
        return priceFilterActive;
      case "bed":
        return bedBathFilterActive(minBedrooms, maxBedrooms);
      case "bath":
        return bedBathFilterActive(minBathrooms, maxBathrooms);
      case "vintage":
        return vintageFilterActive(minVintage, maxVintage);
      case "sqft":
        return sqftFilterActive;
      case "furnished":
        return furnishedFilter !== "all";
      case "undercontract":
        return showUnderContract;
    }
  }

  function resetSliderKind(kind: IntelSliderKind) {
    switch (kind) {
      case "price":
        priceRangeCustomizedRef.current = false;
        setMinPriceIndex(0);
        setMaxPriceIndex(
          showPriceFilter ? boardPriceMaxIdx : INTEL_PRICE_MAX_INDEX,
        );
        setActivePriceBandId(null);
        setActiveLuxuryPriceBandId(null);
        break;
      case "bed":
        setMinBedsFilter("0");
        setMaxBedsFilter("6");
        break;
      case "bath":
        setMinBathsFilter("0");
        setMaxBathsFilter("6");
        break;
      case "vintage":
        setMinVintageFilter("0");
        setMaxVintageFilter("6");
        break;
      case "sqft":
        sqftRangeCustomizedRef.current = false;
        setMinSqftIndex(0);
        setMaxSqftIndex(
          cls === "commercial" ? INTEL_SQFT_MAX_INDEX : boardSqftMaxIdx,
        );
        break;
      case "furnished":
        setFurnishedFilter("all");
        break;
      case "undercontract":
        setUnderContractPref("off");
        break;
    }
    setBoardPage(1);
  }

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
    setActivePriceBandId(null);
    setActiveLuxuryPriceBandId(null);
    setActiveDomBandId(null);
    setDomBandMinDays(null);
    setDomBandMaxDays(null);
    setBoardStatusFilter("all");
    setFurnishedFilter("all");
    setUnderContractPref("off");
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
    setUnderContractSliderActive(true);
    // Release without `immediate` so each label stays enlarged for DESCRIPTOR_ENLARGE_HOLD_MS.
    setPriceSliderActive(false);
    setBedSliderActive(false);
    setBathSliderActive(false);
    setVintageSliderActive(false);
    setSqftSliderActive(false);
    setFurnishedSliderActive(false);
    setUnderContractSliderActive(false);
  }

  /** Enlarge one slider descriptor (matching the filter being exposed). */
  function pulseSliderDescriptor(kind: IntelSliderKind) {
    const pulse = (
      setActive: (active: boolean, opts?: { immediate?: boolean }) => void,
    ) => {
      setActive(true);
      setActive(false);
    };
    switch (kind) {
      case "price":
        pulse(setPriceSliderActive);
        break;
      case "bed":
        pulse(setBedSliderActive);
        break;
      case "bath":
        pulse(setBathSliderActive);
        break;
      case "vintage":
        pulse(setVintageSliderActive);
        break;
      case "sqft":
        pulse(setSqftSliderActive);
        break;
      case "furnished":
        pulse(setFurnishedSliderActive);
        break;
      case "undercontract":
        pulse(setUnderContractSliderActive);
        break;
    }
  }

  /**
   * Reveal slider chrome — one descriptor (accumulating), or all (mag glass).
   * Second click on the same control hides it. Once every available descriptor
   * is exposed, promote to `"all"`.
   */
  function hideCollapsedSliders() {
    setCollapsedSlidersOpen(false);
    setExposedSliders(null);
    dropFilterChromePeek("sliders");
    setPriceSliderActive(false, { immediate: true });
    setBedSliderActive(false, { immediate: true });
    setBathSliderActive(false, { immediate: true });
    setVintageSliderActive(false, { immediate: true });
    setSqftSliderActive(false, { immediate: true });
    setFurnishedSliderActive(false, { immediate: true });
    setUnderContractSliderActive(false, { immediate: true });
  }

  /**
   * After FILTER_PEEK_IDLE_MS with no filter activity: collapse peeks (keep
   * forced multi-zip town peek) and sync Market Intelligence + triangle:
   * hide while chrome remains (quiet page / forced zip); re-show when peeks
   * fully clear. Full Edit-all chrome is not auto-minimized.
   */
  useEffect(() => {
    if (!filterChromeCollapsed) return;

    const peeksOpen =
      filterChromePeeks.length > 0 || collapsedSlidersOpen;
    const forcedTownPeekOnly =
      townNeedsMobileZipPick &&
      filterChromePeeks.length > 0 &&
      filterChromePeeks.every((k) => k === "towns") &&
      !collapsedSlidersOpen;

    // Quiet page, or only forced multi-zip town peek: hide MI + triangle.
    if (!peeksOpen || forcedTownPeekOnly) {
      const id = window.setTimeout(() => {
        setMarketIntelChromeDismissed(true);
      }, FILTER_PEEK_IDLE_MS);
      return () => window.clearTimeout(id);
    }

    const id = window.setTimeout(() => {
      setFilterChromePeeks((prev) =>
        townNeedsMobileZipPick ? prev.filter((k) => k === "towns") : [],
      );
      setCollapsedSlidersOpen(false);
      setExposedSliders(null);
      setPriceSliderActive(false, { immediate: true });
      setBedSliderActive(false, { immediate: true });
      setBathSliderActive(false, { immediate: true });
      setVintageSliderActive(false, { immediate: true });
      setSqftSliderActive(false, { immediate: true });
      setFurnishedSliderActive(false, { immediate: true });
      setUnderContractSliderActive(false, { immediate: true });
      // Peeks cleared → no filter chrome showing → keep triangle available.
      // If multi-zip still forces towns, hide MI above those pills instead.
      setMarketIntelChromeDismissed(townNeedsMobileZipPick);
    }, FILTER_PEEK_IDLE_MS);
    return () => window.clearTimeout(id);
  }, [
    filterChromeCollapsed,
    filterChromePeeks,
    collapsedSlidersOpen,
    filterPeekActivityEpoch,
    townNeedsMobileZipPick,
  ]);

  /** Other towns / “… more towns” collapse after the same idle window. */
  useEffect(() => {
    if (!townLinksExpanded) return;
    const id = window.setTimeout(() => {
      setTownLinksExpanded(false);
    }, FILTER_PEEK_IDLE_MS);
    return () => window.clearTimeout(id);
  }, [townLinksExpanded, filterPeekActivityEpoch]);

  function exposeSliderFilters(kind?: IntelSliderKind) {
    bumpFilterPeekActivity();
    // Mag glass: toggle all sliders off if already fully exposed.
    if (kind == null) {
      if (collapsedSlidersOpen && exposedSliders === "all") {
        hideCollapsedSliders();
        return;
      }
      if (filterChromeCollapsed) {
        addFilterChromePeek("sliders");
      }
      setCollapsedSlidersOpen(true);
      setExposedSliders("all");
      pulseAllSliderDescriptors();
      return;
    }

    // Same descriptor again while that slider is showing → hide it.
    const kindAlreadyShown =
      collapsedSlidersOpen &&
      (exposedSliders === "all" ||
        (Array.isArray(exposedSliders) && exposedSliders.includes(kind)));
    if (kindAlreadyShown) {
      if (exposedSliders === "all") {
        const available = availableIntelSliderKinds({
          showPriceFilter,
          cls,
          showFurnished: tx !== "sale",
        });
        const rest = available.filter((k) => k !== kind);
        if (rest.length === 0) {
          hideCollapsedSliders();
          return;
        }
        setExposedSliders(rest);
        return;
      }
      const rest = (exposedSliders as IntelSliderKind[]).filter((k) => k !== kind);
      if (rest.length === 0) {
        hideCollapsedSliders();
        return;
      }
      setExposedSliders(rest);
      return;
    }

    if (filterChromeCollapsed) {
      addFilterChromePeek("sliders");
    }
    setCollapsedSlidersOpen(true);
    const available = availableIntelSliderKinds({
      showPriceFilter,
      cls,
      showFurnished: tx !== "sale",
    });
    setExposedSliders((prev) => {
      if (prev === "all") return "all";
      const next = prev == null ? [kind] : prev.includes(kind) ? prev : [...prev, kind];
      if (available.length > 0 && available.every((k) => next.includes(k))) {
        return "all";
      }
      return next;
    });
    pulseSliderDescriptor(kind);
  }

  function handleDescriptorSliderClick(kind: IntelSliderKind) {
    exposeSliderFilters(kind);
  }

  /** Open the filter chrome/sliders that the descriptor line summarizes. */
  function handleEditFilters() {
    bumpFilterPeekActivity({ revealMarketIntel: true });
    setFilterChromeCollapsed(false);
    setFilterChromePeeks([]);
    setFiltersExpanded(true);
    setCollapsedSlidersOpen(false);
    setExposedSliders(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /** Reveal sliders still at default — the unused half of the descriptor line. */
  function handleMoreFilters() {
    const unused = availableIntelSliderKinds({
      showPriceFilter,
      cls,
      showFurnished: tx !== "sale",
    }).filter((kind) => !isSliderKindCustomized(kind));
    if (unused.length === 0) {
      handleEditFilters();
      return;
    }
    bumpFilterPeekActivity();
    if (filterChromeCollapsed) addFilterChromePeek("sliders");
    setCollapsedSlidersOpen(true);
    setExposedSliders(unused);
  }

  const isPartialDescriptorPeek = isPartialSliderPeek(exposedSliders);

  const showFurnishedSlider = tx !== "sale";

  const activeTownMonthsSupply = useMemo(() => {
    if (active === "All") return null;
    const count = filterBoardListings(
      poolByCity[active] ?? [],
      tx,
      cls,
      zip,
      boardStatusFilter,
      saleProperty,
      minBedrooms,
      maxBedrooms,
      minBathrooms,
      maxBathrooms,
      newConstructionFilter,
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
  }, [active, poolByCity, tx, cls, zip, boardStatusFilter, saleProperty, minBedrooms, maxBedrooms, minBathrooms, maxBathrooms, newConstructionFilter, furnishedFilter, minPrice, maxPrice, minVintage, maxVintage, minSqft, maxSqft, monthlySales]);

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
          newConstructionFilter,
          furnishedFilter,
          false,
          minPrice,
          maxPrice,
          0,
          VINTAGE_FILTER_MAX,
          minSqft,
          maxSqft,
          domBandMinDays,
          domBandMaxDays,
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
      newConstructionFilter,
      furnishedFilter,
      minPrice,
      maxPrice,
      minSqft,
      maxSqft,
      domBandMinDays,
      domBandMaxDays,
    ],
  );

  const graphsAvailable =
    vintageChartListingRows.length > 0 || showPriceFilter;
  /**
   * Mobile map: graphs are opt-in, so the strip never mounts until asked for.
   * Desktop keeps them, since the map sits beside / above the cards there.
   */
  const mapGraphsSuppressed = showMap && isMobileViewport && !mapGraphsRevealed;
  const graphsHidden = mapGraphsSuppressed || miniGraphsHidden;

  /** Price / segment mini-graphs: all filters except price (so other bands stay clickable). */
  const priceMiniGraphListings = useMemo(
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
        newConstructionFilter,
        furnishedFilter,
        false,
        0,
        null,
        minVintage,
        maxVintage,
        minSqft,
        maxSqft,
        domBandMinDays,
        domBandMaxDays,
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
      newConstructionFilter,
      furnishedFilter,
      minVintage,
      maxVintage,
      minSqft,
      maxSqft,
      domBandMinDays,
      domBandMaxDays,
    ],
  );

  /** DOM mini-graph: all filters except DOM band. */
  const domMiniGraphListings = useMemo(
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
        newConstructionFilter,
        furnishedFilter,
        false,
        minPrice,
        maxPrice,
        minVintage,
        maxVintage,
        minSqft,
        maxSqft,
        null,
        null,
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
      newConstructionFilter,
      furnishedFilter,
      minPrice,
      maxPrice,
      minVintage,
      maxVintage,
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
      newConstructionFilter,
      furnishedFilter,
      underContract: showUnderContract,
      minPrice,
      maxPrice,
      minSqft,
      maxSqft,
    };

    const filterTown = (city: TmreTown) =>
      filterBoardListings(
        poolByCity[city] ?? [],
        tx,
        cls,
        zip,
        boardStatusFilter,
        saleProperty,
        minBedrooms,
        maxBedrooms,
        minBathrooms,
        maxBathrooms,
        newConstructionFilter,
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
              wentToContractThisWeekForTown(
                city,
                zip,
                wentToContractThisWeekByTown,
                wentToContractThisWeekByTownZip,
              ),
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
            wentToContractThisWeekForTown(
              active,
              zip,
              wentToContractThisWeekByTown,
              wentToContractThisWeekByTownZip,
            ),
          ),
      ),
    ];
  }, [
    listings,
    active,
    monthlySales,
    closedThisWeekByTown,
    closedThisWeekByTownZip,
    wentToContractThisWeekByTown,
    wentToContractThisWeekByTownZip,
    orderedCities,
    poolByCity,
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
    newConstructionFilter,
    furnishedFilter,
    showUnderContract,
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
      newConstructionFilter,
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
      newConstructionFilter,
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
        newConstructionFilter,
        boardStatusFilter,
        furnishedFilter,
      }),
    [
      active,
      zip,
      tx,
      cls,
      saleProperty,
      newConstructionFilter,
      boardStatusFilter,
      furnishedFilter,
    ],
  );

  const showTownChrome = !filterChromeCollapsed || isPeeking("towns");
  const showClsChrome = !filterChromeCollapsed || isPeeking("cls");
  const showTxChrome = !filterChromeCollapsed || isPeeking("tx");
  const showConstructionChrome =
    !filterChromeCollapsed || isPeeking("construction");
  const showSliderChrome = !filterChromeCollapsed || isPeeking("sliders");
  /**
   * Market Intelligence + triangle: idle-dismissed while quiet / peeking.
   * Reappears via Edit-all / triangle, or when peeks auto-clear after idle.
   */
  const showMarketIntelChrome = !marketIntelChromeDismissed;

  // DOTD chrome is independent of filter peeks / Edit-all. Peeking “All towns”
  // must not expand DOTD — that used to stretch the hero column via lg:items-end
  // and leave a tall empty band above Market Intelligence.
  const desktopDotdSingleLine = !dotdForceExpanded;

  /** DOTD follows Intelligence town + Sale/Rental (All tx → sale picks). */
  const dotdKind = tx === "rental" ? "rental" : "sale";
  const dotdPropertyClass =
    dotdKind === "rental"
      ? "all"
      : saleProperty === "multi" || saleProperty === "condos"
        ? saleProperty
        : "homes";

  /**
   * Descriptor clicks on the town / tx / class line each toggle their own pill
   * group and leave the others alone, so several can stay open at once. Full
   * chrome (Edit all) collapses back to descriptors on any of these clicks.
   */
  const peekPills = (key: FilterChromePeek) => {
    bumpFilterPeekActivity();
    setFilterChromeCollapsed(true);
    // Full chrome already shows every group, so the click means hide.
    if (!filterChromeCollapsed) {
      setFilterChromePeeks([]);
      return;
    }
    if (isPeeking(key)) dropFilterChromePeek(key);
    else addFilterChromePeek(key);
  };
  const peekTownPills = () => {
    peekPills("towns");
    // Descriptor already names the current town — open the other towns, not
    // a second copy of the selection as a pill.
    setTownLinksExpanded(true);
  };
  const peekClsPills = () => peekPills("cls");
  const peekTxPills = () => {
    const closingTx = !filterChromeCollapsed || isPeeking("tx");
    peekPills("tx");
    // Phone: a multi-zip town still needing a zip keeps its pills in reach.
    if (
      closingTx &&
      isMobileViewport &&
      active !== "All" &&
      townHasMultipleZips(active) &&
      showZipFilters &&
      !mobileZipConfirmed
    ) {
      addFilterChromePeek("towns");
    }
  };
  const peekConstructionPills = () => peekPills("construction");
  const toggleFilterChrome = () => {
    bumpFilterPeekActivity({ revealMarketIntel: true });
    setFilterChromeCollapsed(!filterChromeCollapsed);
    setFilterChromePeeks([]);
  };

  const filterDescriptorLeading = (
    <IntelDescriptorContext
      parts={filterDescriptorParts}
      onTownClick={peekTownPills}
      onTxClick={peekTxPills}
      onClsClick={peekClsPills}
      onConstructionClick={peekConstructionPills}
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

  /**
   * Switching towns restarts at the default score sort. Kept in the click
   * handlers (not an effect on `active`) so a remount — Back from a listing,
   * where the town arrives from the cookie — keeps the visitor's sort.
   */
  const resetSortToDefault = () => {
    setSortKey("score");
    setSortDir("desc");
  };

  /** Town pill, town link, and boundary-map click all land here. */
  const applyTownFilter = (city: IntelCity) => {
    if (city !== active) resetSortToDefault();
    setActive(city);
    setZip(null);
    setMobileZipConfirmed(false);
    setBoardStatusFilter("all");
    setTownLinksExpanded(isMobileViewport && city === "All");
    setZipLinksExpanded(false);
    if (city === "All") {
      setExpandedSnapshotKeys(new Set());
    }
    if (isMobileViewport && city !== "All") {
      setFilterChromeCollapsed(true);
      setFilterChromePeeks(townHasMultipleZips(city) ? ["towns"] : []);
    }
    flashTownMapOnSelect(city);
  };

  /** Clicking a town inside the boundary map filters to it. */
  const selectTownFromBoundaryMap = (town: TmreTown) => {
    if (!(INTEL_CITIES as readonly string[]).includes(town)) return;
    clearBoundaryMapFadeTimer();
    setBoundaryMapExiting(false);
    setHoveredTown(null);
    setHoveredTownEl(null);
    applyTownFilter(town as IntelCity);
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
    } else if (town !== active) {
      resetSortToDefault();
    }
    scrollToBoard();
  };

  const descriptorSearchActive =
    priceSliderActive ||
    bedSliderActive ||
    bathSliderActive ||
    vintageSliderActive ||
    sqftSliderActive ||
    furnishedSliderActive ||
    underContractSliderActive;

  /** Magnifying glass — leftmost on the descriptor line. */
  const descriptorSearchControl = (
    <DescriptorSearchControl
      active={descriptorSearchActive}
      onClick={() => exposeSliderFilters()}
    />
  );

  const availableSliderKinds = availableIntelSliderKinds({
    showPriceFilter,
    cls,
    showFurnished: showFurnishedSlider,
  });
  const allSlidersCustomized =
    availableSliderKinds.length > 0 &&
    availableSliderKinds.every((kind) => isSliderKindCustomized(kind));

  /** Edit all only when every available slider is off default; otherwise More filters. */
  const descriptorEditAllControl = (
    <>
      <IntelFilterDescriptorDot />
      <DescriptorEditAllControl
        active={descriptorSearchActive}
        label={allSlidersCustomized ? "Edit all" : "More filters"}
        onClick={allSlidersCustomized ? handleEditFilters : handleMoreFilters}
      />
    </>
  );

  /** Range labels — only sliders that are off their default. */
  const sliderDescriptorLabels = (
    <IntelSliderDescriptorLabels
      showPriceFilter={showPriceFilter}
      cls={cls}
      showFurnished={showFurnishedSlider}
      furnishedFilter={furnishedFilter}
      furnishedSliderActive={furnishedSliderActive}
      underContractSliderActive={underContractSliderActive}
      isSliderKindCustomized={isSliderKindCustomized}
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
  const pinnedDescriptorBarRef = useRef<HTMLDivElement>(null);
  const [descriptorsPinned, setDescriptorsPinned] = useState(false);
  /** Live header bottom — nav is taller than pt-20/24 (multi-line logo, badges). */
  const [navOffsetPx, setNavOffsetPx] = useState(96);
  const [pinnedBarHeightPx, setPinnedBarHeightPx] = useState(0);

  // Pin descriptors under the nav once their in-flow row scrolls away —
  // phone and desktop. Peeked pills/sliders portal into that bar so filters
  // stay usable while the deal board scrolls.
  useEffect(() => {
    const sentinel = descriptorSentinelRef.current;
    if (!sentinel) {
      setDescriptorsPinned(false);
      return;
    }
    const header = document.querySelector("header");
    const update = () => {
      const offset = header?.getBoundingClientRect().bottom ?? 96;
      setNavOffsetPx(offset);
      const top = sentinel.getBoundingClientRect().top;
      setDescriptorsPinned(top < offset + 1);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    const ro =
      header && typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(update)
        : null;
    if (header && ro) ro.observe(header);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      ro?.disconnect();
    };
  }, [
    showPriceFilter,
    cls,
    showFurnishedSlider,
    filtersExpanded,
    collapsedSlidersOpen,
    filterChromeCollapsed,
    filterChromePeeks,
    heroIntroDismissed,
    marketIntelChromeDismissed,
  ]);

  useEffect(() => {
    if (!descriptorsPinned) {
      setPinnedBarHeightPx(0);
      return;
    }
    const el = pinnedDescriptorBarRef.current;
    if (!el) return;
    const measure = () => setPinnedBarHeightPx(el.getBoundingClientRect().height);
    measure();
    const ro =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [descriptorsPinned, filterChromePeeks, exposedSliders, filtersExpanded]);

  /**
   * "Map on top" on desktop: the map pins under the nav and the cards scroll
   * beneath it. Phones already run the map full-bleed with the cards hidden,
   * and Left / Right give the map its own sticky column, so neither pins here.
   */
  const stickyTopMapActive =
    showMap && mapLayout === "top" && !mapFullscreen && !isMobileViewport;
  const stickyTopMapRef = useRef<HTMLDivElement>(null);
  const [stickyTopMapHeightPx, setStickyTopMapHeightPx] = useState(0);

  useEffect(() => {
    if (!stickyTopMapActive) {
      setStickyTopMapHeightPx(0);
      return;
    }
    const el = stickyTopMapRef.current;
    if (!el) return;
    const measure = () =>
      setStickyTopMapHeightPx(el.getBoundingClientRect().height);
    measure();
    const ro =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [stickyTopMapActive]);

  /**
   * Desktop map layouts: the results toolbar (count, sort, status pills, view /
   * map icons, reset) leaves the listings card and spans the full width above
   * the map — full-bleed for Map on Top, across both columns for Left / Right.
   */
  const hoistBoardToolbar = showMap && !mapFullscreen && !isMobileViewport;
  const [boardToolbarHost, setBoardToolbarHost] =
    useState<HTMLDivElement | null>(null);
  const [boardToolbarHeightPx, setBoardToolbarHeightPx] = useState(0);

  useEffect(() => {
    if (!hoistBoardToolbar || !boardToolbarHost) {
      setBoardToolbarHeightPx(0);
      return;
    }
    const measure = () =>
      setBoardToolbarHeightPx(
        boardToolbarHost.getBoundingClientRect().height,
      );
    measure();
    const ro =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    ro?.observe(boardToolbarHost);
    return () => ro?.disconnect();
  }, [hoistBoardToolbar, boardToolbarHost]);

  /** Peeked pill / slider chrome portals into the pinned nav panel (phone). */
  const pinFilterChromeToNav = descriptorsPinned;
  /**
   * Minimized hero (intro gone + filters collapsed): hug the live nav bottom
   * instead of tall pt-28/32 — mobile and desktop. Stops a large empty navy
   * band above Town / Sale / Residential descriptors.
   */
  const compactHeroTop = heroIntroDismissed && filterChromeCollapsed;
  const heroPaddingTopPx = compactHeroTop
    ? Math.max(Math.round(navOffsetPx) + 8, 72)
    : null;

  const closeTownStats = () => setTownStatsOpen(false);
  const closeVintageStats = () => setVintageStatsOpen(false);

  const liveSyncIso =
    state === "ready" && !listingsRefresh.refreshing
      ? listingsRefresh.lastFinishedAt
      : null;
  const liveSyncedAt = formatListingsRefreshTime(liveSyncIso);

  // When "synced …" appears: hide graphs, delete the phrase one letter at a
  // time, then show graphs again and flip the Show/Hide graphs control.
  // Mobile (~hamburger Live): ~50% slower letter delete than desktop.
  useEffect(() => {
    if (!liveSyncIso || !liveSyncedAt) return;
    if (syncPhraseAnimDoneRef.current === liveSyncIso) return;
    if (syncPhraseAnimKeyRef.current === liveSyncIso) return;

    syncPhraseAnimKeyRef.current = liveSyncIso;
    const fullPhrase = `synced ${liveSyncedAt}`;
    setSyncPhraseDisplay(fullPhrase);
    setMiniGraphsHiddenPref(true);

    let cancelled = false;
    let intervalId: number | null = null;
    let charIndex = fullPhrase.length;
    const deleteLetterMs = window.matchMedia("(max-width: 767px)").matches
      ? 68
      : 45;

    const holdId = window.setTimeout(() => {
      if (cancelled) return;
      intervalId = window.setInterval(() => {
        if (cancelled) return;
        charIndex -= 1;
        if (charIndex <= 0) {
          if (intervalId != null) window.clearInterval(intervalId);
          intervalId = null;
          setSyncPhraseDisplay(null);
          syncPhraseAnimDoneRef.current = liveSyncIso;
          syncPhraseAnimKeyRef.current = null;
          setMiniGraphsHiddenPref(false, { suspendAutoHide: false });
          return;
        }
        setSyncPhraseDisplay(fullPhrase.slice(0, charIndex));
      }, deleteLetterMs);
    }, 1_200);

    return () => {
      cancelled = true;
      window.clearTimeout(holdId);
      if (intervalId != null) window.clearInterval(intervalId);
      // Allow restart if this sync stamp is still current after unmount/remount.
      if (syncPhraseAnimDoneRef.current !== liveSyncIso) {
        syncPhraseAnimKeyRef.current = null;
      }
    };
  }, [liveSyncIso, liveSyncedAt, setMiniGraphsHiddenPref]);

  const liveStatusLabel =
    state === "ready"
      ? listingsRefresh.refreshing
        ? (() => {
            const kind = siteUnlocked
              ? formatListingsRefreshKind(listingsRefresh.refreshingKind)
              : null;
            return kind ? `Live Refreshing · ${kind}` : "Live Refreshing";
          })()
        : (() => {
            const kind = siteUnlocked
              ? formatListingsRefreshKind(listingsRefresh.lastKind)
              : null;
            const syncSegment =
              syncPhraseAnimDoneRef.current === liveSyncIso
                ? null
                : syncPhraseDisplay != null
                  ? syncPhraseDisplay.length > 0
                    ? syncPhraseDisplay
                    : null
                  : liveSyncedAt
                    ? `synced ${liveSyncedAt}`
                    : null;
            const parts = ["Live"];
            if (syncSegment) parts.push(syncSegment);
            if (kind) parts.push(kind);
            return parts.join(" · ");
          })()
      : state === "fallback"
        ? "Cached · feed offline"
        : "Loading…";

  const liveStatusDotClass =
    state === "ready" && listingsRefresh.refreshing
      ? "bg-gold animate-pulse-dot"
      : state === "ready"
        ? "bg-sage animate-pulse-dot"
        : state === "fallback"
          ? "bg-coral"
          : "bg-gold animate-pulse-dot";

  const liveStatusChip = (
    <div className="flex items-center gap-2 font-mono text-xs leading-none">
      <span className={`w-1.5 h-1.5 rounded-full ${liveStatusDotClass}`} />
      <span>{liveStatusLabel}</span>
    </div>
  );

  const mobileLivePortal =
    mobileLiveRoot != null
      ? createPortal(
          <div className="flex items-center justify-end gap-1.5 font-mono text-[10px] leading-tight tracking-[0.04em] text-white/80">
            <span
              className={`w-1.5 h-1.5 shrink-0 rounded-full ${liveStatusDotClass}`}
            />
            <span className="text-right">{liveStatusLabel}</span>
          </div>,
          mobileLiveRoot,
        )
      : null;

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

  const renderVintageStatsPanel = (hidePanelTitle = false) =>
    showVintageStats ? (
      <IntelligenceVintageStats
        title={vintageStatsTitle}
        listings={vintageListingRows}
        tx={tx}
        city={active === "All" ? "All" : active}
        collapsible
        expandedKeys={expandedSnapshotKeys}
        onToggleExpanded={toggleSnapshotExpanded}
        hidePanelTitle={hidePanelTitle}
        onVintageListingsClick={(bucketId) => {
          closeTownStats();
          closeVintageStats();
          selectVintageListings(bucketId);
        }}
      />
    ) : null;

  const vintageStatsPanel = renderVintageStatsPanel(false);

  const desktopShowStatsTab = liveSnapshots.length > 0;
  const desktopShowVintageTab = showVintageStats;
  const desktopStatsFolderTabs =
    desktopShowStatsTab && desktopShowVintageTab;
  const desktopSidebarTab: "stats" | "vintage" = desktopStatsFolderTabs
    ? desktopStatsTab
    : desktopShowVintageTab
      ? "vintage"
      : "stats";
  const vintageFolderTabLabel =
    tx === "rental" ? "Rentals by vintage" : "Sales by vintage";
  /** folder-comps-mobile look, adapted for cream sidebar (inactive wasn’t white). */
  const desktopStatsFolderTabClass = (active: boolean) => {
    const base =
      "relative min-w-0 flex-1 whitespace-normal px-1.5 py-1.5 font-mono text-[8px] font-bold leading-tight tracking-[0.08em] uppercase transition-colors rounded-t-md border -mb-px text-left";
    if (active) {
      return `${base} z-[1] border-gold border-b-transparent bg-gold text-navy`;
    }
    return `${base} border-transparent text-charcoal/40 hover:text-navy`;
  };

  const boardStickyTopBasePx = descriptorsPinned
    ? navOffsetPx + pinnedBarHeightPx
    : undefined;
  /** Matches DealBoardList's own `?? 80` fallback so map and toolbar agree. */
  const boardChromeStickyTopPx = boardStickyTopBasePx ?? 80;
  /** Hoisted toolbar pins first, so the map pins directly beneath it. */
  const stickyTopMapOffsetPx =
    boardChromeStickyTopPx + (hoistBoardToolbar ? boardToolbarHeightPx : 0);
  const boardToolbarStickyTopPx = stickyTopMapActive
    ? boardChromeStickyTopPx + stickyTopMapHeightPx
    : boardStickyTopBasePx;

  const pinnedDescriptorBar =
    descriptorsPinned && typeof document !== "undefined" ? (
      <div
        ref={pinnedDescriptorBarRef}
        className="fixed inset-x-0 z-40 max-h-[min(70vh,36rem)] overflow-y-auto border-b border-white/10 bg-[#1B2A4A]/95 shadow-[0_8px_24px_-12px_rgba(0,0,0,0.65)] backdrop-blur-md"
        style={{ top: navOffsetPx }}
        data-intel-slider-context-blurb-pinned
        data-intel-pinned-filter-panel
        onPointerDownCapture={() => bumpFilterPeekActivity()}
      >
        <div className="mx-auto max-w-7xl xl:max-w-[90rem] px-6 lg:px-10 py-2">
          <p
            className={`flex flex-wrap items-baseline gap-x-2 w-full min-w-0 font-mono tracking-wide ${INTEL_DESCRIPTOR_IDLE_TEXT}`}
          >
            {descriptorSearchControl}
            {filterDescriptorLeading}
            {sliderDescriptorLabels}
            {descriptorEditAllControl}
          </p>
          {/* Peeked pill / slider chrome portals here so it stays clickable. */}
          <div
            ref={setPinnedFilterChromeHost}
            className="mt-2 flex flex-col gap-1.5 empty:mt-0 empty:hidden"
          />
        </div>
      </div>
    ) : null;

  return (
    <div
      style={descriptorSizeStyle}
      className="[--intel-desc-idle:var(--intel-desc-mobile)] lg:[--intel-desc-idle:var(--intel-desc-desktop)]"
    >
      {pinnedDescriptorBar}
      <section
        style={
          heroPaddingTopPx != null ? { paddingTop: heroPaddingTopPx } : undefined
        }
        className={`navy-gradient text-white relative overflow-hidden transition-[padding] duration-300 ease-out ${
          heroPaddingTopPx != null ? "" : "pt-28 lg:pt-32"
        } ${filtersExpanded ? "pb-1 lg:pb-1" : "pb-1"}`}
      >
        <div
          className="pointer-events-none absolute inset-0 hero-grid opacity-40"
          aria-hidden
        />
        {/*
          Same max-width + board|248px grid as the cream results section so
          desktop DOTD’s right edge lines up with the deal-board column (Live/Share).
        */}
        <div className="relative mx-auto max-w-7xl xl:max-w-[90rem] px-6 lg:px-10">
          <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_248px] lg:gap-5 lg:items-start">
          <div
            className={`flex min-w-0 flex-col transition-[gap] duration-300 ease-out lg:flex-row lg:items-start lg:gap-x-5 ${
              compactHeroTop ? "gap-y-1" : "gap-y-2"
            }`}
          >
            <div
              className="min-w-0 flex-1"
              onPointerDownCapture={() => bumpFilterPeekActivity()}
            >
              {showMarketIntelChrome ? (
              <div className="flex items-center gap-3 min-w-0">
                <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold animate-fade-up">
                  Market Intelligence
                </p>
                <button
                  type="button"
                  onClick={toggleFilterChrome}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center text-white/70 hover:text-gold transition-colors"
                  aria-expanded={!filterChromeCollapsed}
                  aria-label={
                    filterChromeCollapsed
                      ? "Show town, sale, and slider filters"
                      : "Hide town, sale, and slider filters"
                  }
                  title={
                    filterChromeCollapsed ? "Show filters" : "Minimize filters"
                  }
                >
                  <svg
                    viewBox="0 0 12 12"
                    className="h-5 w-5"
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
              ) : null}
              <div
                className={`grid transition-[grid-template-rows] duration-700 ease-in-out ${
                  heroIntroDismissed ? "grid-rows-[0fr]" : "grid-rows-[1fr]"
                } ${heroIntroDismissed ? "pointer-events-none" : ""}`}
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
              {/*
                Order (collapsed + expanded): descriptor → towns → cls → tx →
                slider labels → slider chrome. Towns above Sale/Residential on
                desktop (matches mobile).
              */}
              <div className="flex flex-col items-start min-w-0 w-full gap-1.5">
              {/* Slider range labels; pin under the nav on scroll. */}
              <div
                className={`w-full min-w-0 ${
                  filterChromeCollapsed ? "order-5" : "order-4"
                }`}
              >
              <div ref={descriptorSentinelRef} className="h-0 w-full" aria-hidden />
              <p
                className={`flex flex-wrap items-baseline gap-x-2 w-full min-w-0 font-mono tracking-wide mt-0.5 ${INTEL_DESCRIPTOR_IDLE_TEXT} ${
                  descriptorsPinned
                    ? "invisible pointer-events-none"
                    : ""
                }`}
                data-intel-slider-context-blurb
                aria-hidden={descriptorsPinned || undefined}
              >
                {descriptorSearchControl}
                {sliderDescriptorLabels}
                {descriptorEditAllControl}
              </p>
              </div>

                {showTxChrome || showConstructionChrome ? (
                  <IntelChromePortal
                    pin={pinFilterChromeToNav}
                    host={pinnedFilterChromeHost}
                  >
                  <div
                    data-intel-tx-filter-chrome
                    className={`flex flex-wrap items-center gap-2 min-w-0 self-start w-full ${
                      filterChromeCollapsed ? "order-4" : "order-3"
                    }`}
                  >
                    {showTxChrome ? (
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
                    ) : null}
                    {/*
                      Show property-type pills whenever tx chrome is open —
                      including descriptor peek (collapsed) — so Homes / Rentals
                      descriptor clicks actually reveal their filter group.
                    */}
                    {showTxChrome && tx !== "rental" ? (
                      <>
                        <IntelFilterSep />
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
                    {showConstructionChrome ? (
                      <>
                        {showTxChrome ? <IntelFilterSep /> : null}
                        <FilterGroup
                          label=""
                          value={newConstructionFilter}
                          onChange={setNewConstructionFilter}
                          options={[
                            { value: "all", label: "Any" },
                            { value: "new", label: "New Construction" },
                            {
                              value: "not-new",
                              label: "Not New Construction",
                            },
                          ]}
                        />
                      </>
                    ) : null}
                    {!filterChromeCollapsed ? (
                      <IntelFiltersToggle
                        expanded={filtersExpanded}
                        filtersActive={slidersCustomized}
                        onToggle={() => setFiltersExpanded(!filtersExpanded)}
                      />
                    ) : null}
                  </div>
                  </IntelChromePortal>
                ) : null}

              {/* Price/slider filter chrome */}
              {showSliderChrome ? (
                  <IntelChromePortal
                    pin={pinFilterChromeToNav}
                    host={pinnedFilterChromeHost}
                  >
                <div
                  className={`w-full min-w-0 ${
                    filterChromeCollapsed ? "order-6" : "order-5"
                  }`}
                >
                <IntelFilterControlsRow
                  filtersExpanded={filtersExpanded}
                  showPriceFilter={showPriceFilter}
                  cls={cls}
                  collapsedSlidersOpen={collapsedSlidersOpen}
                  exposedSliders={exposedSliders}
                  boardPriceSteps={boardPriceSteps}
                  minPriceIndex={minPriceIndex}
                  maxPriceIndex={maxPriceIndex}
                  onMinPriceIndexChange={(index) => {
                    priceRangeCustomizedRef.current = true;
                    setActivePriceBandId(null);
                    setActiveLuxuryPriceBandId(null);
                    setMinPriceIndex(index);
                  }}
                  onMaxPriceIndexChange={(index) => {
                    priceRangeCustomizedRef.current = true;
                    setActivePriceBandId(null);
                    setActiveLuxuryPriceBandId(null);
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
                  underContractPref={underContractPref}
                  onUnderContractPrefChange={(value) => {
                    setUnderContractPref(value);
                    // Enlarge the descriptor chip briefly, like a slider drag.
                    setUnderContractSliderActive(true);
                    setUnderContractSliderActive(false);
                  }}
                  onResetSliders={resetSliders}
                  onResetSliderKind={resetSliderKind}
                  isSliderKindCustomized={isSliderKindCustomized}
                  slidersCustomized={slidersCustomized}
                />
                </div>
                  </IntelChromePortal>
              ) : null}
              <div
                className={`w-full min-w-0 ${
                  filterChromeCollapsed ? "order-1" : "order-6"
                } ${
                  descriptorsPinned ? "invisible pointer-events-none" : ""
                }`}
                aria-hidden={descriptorsPinned || undefined}
              >
              {active === "All" ? (
                <AllTownsDescriptor
                  className={
                    filterChromeCollapsed
                      ? "mt-0"
                      : filtersExpanded
                        ? "mt-0 lg:mt-3"
                        : "mt-0 lg:mt-1"
                  }
                  towns={allTownsDescriptorStats}
                  aggregateMonthsSupply={aggregateAllTownsMonthsSupply}
                  monthlySalesLoaded={monthlySalesLoaded}
                  filterContext={allTownsFilterContext}
                  contextLeading={filterDescriptorLeading}
                  hideMonthsSupply={mobileHeroCompactChrome}
                  trailing={
                    showSliderChrome &&
                    collapsedSlidersOpen &&
                    (!filtersExpanded || isPartialDescriptorPeek) ? (
                      <>
                        <IntelFilterDescriptorDot />
                        <button
                          type="button"
                          onClick={hideCollapsedSliders}
                          className={`font-mono ${INTEL_DESCRIPTOR_IDLE_TEXT} tracking-[0.12em] uppercase text-white/50 hover:text-gold underline underline-offset-2 decoration-white/20 hover:decoration-gold/50 transition-colors shrink-0 whitespace-nowrap`}
                        >
                          Hide sliders
                        </button>
                      </>
                    ) : null
                  }
                />
              ) : (
                <p
                  className={`flex flex-wrap items-baseline gap-x-2 font-mono tracking-wide transition-[margin] duration-300 ease-out ${INTEL_DESCRIPTOR_IDLE_TEXT} ${
                    filterChromeCollapsed
                      ? "mt-0"
                      : filtersExpanded
                        ? "mt-0 lg:mt-3"
                        : "mt-0 lg:mt-1"
                  }`}
                >
                  {filterDescriptorLeading}
                  {(!isMobileViewport || showMobileTownTagline) &&
                  TOWN_TAGLINES[active] ? (
                    <span className="text-white/45">{TOWN_TAGLINES[active]}</span>
                  ) : null}
                  {!mobileHeroCompactChrome ? (
                    <>
                      <IntelFilterDescriptorDot />
                      <IntelMonthsSupplyInline
                        monthsSupply={activeTownMonthsSupply}
                        monthlySalesLoaded={monthlySalesLoaded}
                      />
                    </>
                  ) : null}
                  {showSliderChrome &&
                  collapsedSlidersOpen &&
                  (!filtersExpanded || isPartialDescriptorPeek) ? (
                    <>
                      <IntelFilterDescriptorDot />
                      <button
                        type="button"
                        onClick={hideCollapsedSliders}
                        className={`font-mono ${INTEL_DESCRIPTOR_IDLE_TEXT} tracking-[0.12em] uppercase text-white/50 hover:text-gold underline underline-offset-2 decoration-white/20 hover:decoration-gold/50 transition-colors shrink-0 whitespace-nowrap`}
                      >
                        Hide sliders
                      </button>
                    </>
                  ) : null}
                </p>
              )}
              </div>

                {showClsChrome ? (
                  <IntelChromePortal
                    pin={pinFilterChromeToNav}
                    host={pinnedFilterChromeHost}
                  >
                    <div
                      className={`flex flex-wrap items-center gap-1.5 min-w-0 w-full self-start ${
                        filterChromeCollapsed ? "order-3" : "order-2"
                      }`}
                    >
                      <div data-intel-cls-filter-chrome>
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
                      </div>
                    </div>
                  </IntelChromePortal>
                ) : null}

                {showTownChrome &&
                (showMobileTownPills || showMobileZipPills) ? (
                  <IntelChromePortal
                    pin={pinFilterChromeToNav}
                    host={pinnedFilterChromeHost}
                  >
                    <div
                      className={`flex flex-col gap-1.5 items-start min-w-0 w-full ${
                        filterChromeCollapsed ? "order-2" : "order-1"
                      }`}
                    >
                      <div
                        className={
                          inlineTownZip
                            ? "flex flex-wrap items-center gap-x-3 gap-y-1 w-full min-w-0"
                            : "w-full min-w-0"
                        }
                      >
                        {showMobileTownPills ? (
                          <div
                            ref={bindTownFilterAnchor}
                            className={
                              inlineTownZip
                                ? "min-w-0 shrink-0"
                                : "flex flex-wrap gap-1 self-start w-full min-w-0"
                            }
                          >
                            <TownFilterPills
                              towns={orderedCities}
                              selected={active}
                              onSelect={(city) => applyTownFilter(city)}
                              onTownMouseEnter={(town, el) => {
                                if (!prefersFineHover()) return;
                                if (townHoverClearTimer.current) {
                                  clearTimeout(townHoverClearTimer.current);
                                  townHoverClearTimer.current = null;
                                }
                                clearZipMapFlashTimer();
                                clearBoundaryMapFadeTimer();
                                setBoundaryMapExiting(false);
                                setFlashedZip(null);
                                prefetchTownBoundaries(town);
                                setHoveredZip(null);
                                setHoveredZipEl(null);
                                setHoveredTown(town);
                                setHoveredTownEl(el);
                              }}
                              onAllMouseEnter={(el) => {
                                if (!prefersFineHover()) return;
                                if (townHoverClearTimer.current) {
                                  clearTimeout(townHoverClearTimer.current);
                                  townHoverClearTimer.current = null;
                                }
                                clearZipMapFlashTimer();
                                clearBoundaryMapFadeTimer();
                                setBoundaryMapExiting(false);
                                setFlashedZip(null);
                                prefetchAllTownBoundaries();
                                setHoveredZip(null);
                                setHoveredZipEl(null);
                                setHoveredTown("All");
                                setHoveredTownEl(el);
                              }}
                              onTownMouseLeave={() => {
                                if (!prefersFineHover()) return;
                                if (townHoverClearTimer.current) {
                                  clearTimeout(townHoverClearTimer.current);
                                }
                                townHoverClearTimer.current = setTimeout(() => {
                                  townHoverClearTimer.current = null;
                                  fadeClearBoundaryMaps(() => {
                                    setHoveredTown(null);
                                    setHoveredTownEl(null);
                                  });
                                }, 120);
                              }}
                              counts={townCounts}
                              allLabel="All Towns"
                              appearance="zip"
                              layout="promoted"
                              townLinksExpanded={townLinksOpen}
                              onTownLinksExpandedChange={(expanded) => {
                                setTownLinksExpanded(expanded);
                                if (expanded) bumpFilterPeekActivity();
                              }}
                              size="compact"
                              className={
                                inlineTownZip ? "min-w-0" : "w-full min-w-0"
                              }
                              promotedInline={inlineTownZip}
                            />
                          </div>
                        ) : null}

                        {showMobileZipPills && inlineTownZip ? (
                          <div
                            ref={bindZipFilterAnchor}
                            className="min-w-0 shrink-0"
                          >
                            <ZipFilterPills
                              zips={availableZips}
                              selected={zip}
                              onSelect={(next) => {
                                setZip(next);
                                setMobileZipConfirmed(true);
                                setZipLinksExpanded(false);
                                if (isMobileViewport) {
                                  setFilterChromeCollapsed(true);
                                  setFilterChromePeeks([]);
                                }
                                flashZipMapOnSelect(next);
                              }}
                              counts={zipCounts}
                              allCount={zipAllCount}
                              allLabel="All zips"
                              townName={active}
                              zipLinksExpanded={zipLinksExpanded}
                              onZipLinksExpandedChange={setZipLinksExpanded}
                              onZipMouseEnter={(z, el) => {
                                if (!prefersFineHover()) return;
                                clearZipMapFlashTimer();
                                clearBoundaryMapFadeTimer();
                                setBoundaryMapExiting(false);
                                setFlashedZip(null);
                                clearTownMapFlashTimer();
                                setFlashedTown(null);
                                setHoveredTown(null);
                                setHoveredTownEl(null);
                                prefetchZipBoundaries([
                                  z,
                                  ...availableZips.filter(
                                    (zipCode) => zipCode !== z,
                                  ),
                                ]);
                                setHoveredZip(z);
                                setHoveredZipEl(el);
                              }}
                              onZipMouseLeave={() => {
                                if (!prefersFineHover()) return;
                                fadeClearBoundaryMaps(() => {
                                  setHoveredZip(null);
                                  setHoveredZipEl(null);
                                });
                              }}
                              className="min-w-0"
                              promotedInline
                            />
                          </div>
                        ) : null}
                      </div>

                      {showMobileZipPills &&
                      showZipFilters &&
                      !inlineTownZip ? (
                        <div
                          ref={bindZipFilterAnchor}
                          className="self-start w-full min-w-0"
                        >
                          <ZipFilterPills
                            zips={availableZips}
                            selected={zip}
                            onSelect={(next) => {
                              setZip(next);
                              setMobileZipConfirmed(true);
                              setZipLinksExpanded(false);
                              if (isMobileViewport) {
                                setFilterChromeCollapsed(true);
                                setFilterChromePeeks([]);
                              }
                              flashZipMapOnSelect(next);
                            }}
                            counts={zipCounts}
                            allCount={zipAllCount}
                            allLabel="All zips"
                            townName={active}
                            zipLinksExpanded={zipLinksExpanded}
                            onZipLinksExpandedChange={setZipLinksExpanded}
                            onZipMouseEnter={(z, el) => {
                              if (!prefersFineHover()) return;
                              clearZipMapFlashTimer();
                              clearBoundaryMapFadeTimer();
                              setBoundaryMapExiting(false);
                              setFlashedZip(null);
                              clearTownMapFlashTimer();
                              setFlashedTown(null);
                              setHoveredTown(null);
                              setHoveredTownEl(null);
                              prefetchZipBoundaries([
                                z,
                                ...availableZips.filter(
                                  (zipCode) => zipCode !== z,
                                ),
                              ]);
                              setHoveredZip(z);
                              setHoveredZipEl(el);
                            }}
                            onZipMouseLeave={() => {
                              if (!prefersFineHover()) return;
                              fadeClearBoundaryMaps(() => {
                                setHoveredZip(null);
                                setHoveredZipEl(null);
                              });
                            }}
                            className="w-full min-w-0"
                          />
                        </div>
                      ) : null}
                    </div>
                  </IntelChromePortal>
                ) : null}
              </div>
              </div>
            </div>
            {mobileHeroCompactChrome ? (
              <div className="flex w-full items-baseline justify-between gap-x-4 lg:hidden">
                <button
                  type="button"
                  onClick={() => {
                    setMobileHeroCompactChrome(false);
                    setMobileHeroCompactSuspended(true);
                  }}
                  className={`shrink-0 font-mono tracking-wide text-gold underline underline-offset-2 decoration-gold/45 transition-colors hover:text-gold-light hover:decoration-gold ${INTEL_DESCRIPTOR_IDLE_TEXT}`}
                >
                  Deal of the Day
                </button>
                <span
                  className={`min-w-0 text-right font-mono tracking-wide ${INTEL_DESCRIPTOR_IDLE_TEXT}`}
                >
                  <IntelMonthsSupplyInline
                    monthsSupply={
                      active === "All"
                        ? aggregateAllTownsMonthsSupply
                        : activeTownMonthsSupply
                    }
                    monthlySalesLoaded={monthlySalesLoaded}
                  />
                </span>
              </div>
            ) : null}
            <div
              className={
                mobileHeroCompactChrome
                  ? "hidden lg:block lg:w-[17rem] lg:max-w-[17rem] lg:shrink-0 lg:self-start"
                  : "w-full lg:w-[17rem] lg:max-w-[17rem] lg:shrink-0 lg:self-start"
              }
            >
              <DealOfTheDayFrame
                key={`intel-dotd-${active}-${dotdKind}-${dotdPropertyClass}`}
                city={active}
                theme="hero"
                rotateTowns={active === "All"}
                transactionFilter={dotdKind}
                propertyClass={dotdPropertyClass}
                initialDealsByTown={
                  dotdKind === "sale" && dotdPropertyClass === "homes"
                    ? initialDotdDealsByTown
                    : null
                }
                initialKind={dotdKind}
                initialPropertyClass={dotdPropertyClass}
                hideUntilReady
                surfaceAnyPick
                desktopSingleLine={desktopDotdSingleLine}
                onDesktopSingleLineExpand={() => setDotdForceExpanded(true)}
                className="w-full shrink-0 animate-fade-up"
              />
            </div>
          </div>
          {/* Matches town-stats rail width so DOTD aligns with the results board. */}
          <div className="hidden lg:block" aria-hidden />
          </div>
        </div>
      </section>

      <section
        className={`bg-cream pb-10 lg:pb-14 transition-[padding] duration-300 ease-out ${
          filtersExpanded ? "pt-4 lg:pt-5" : "pt-2 lg:pt-3"
        }`}
      >
        {mobileLivePortal}
        <div className="mx-auto max-w-7xl xl:max-w-[90rem] px-6 lg:px-10">
          {/*
            Match board + sidebar columns so Live/share share the same right edge
            (board column), not the full page including the town-stats rail.
          */}
          <div className="mb-2 lg:mb-3 lg:grid lg:grid-cols-[minmax(0,1fr)_248px] lg:gap-5 lg:items-start">
            <div className="flex flex-col gap-2 min-w-0">
              {/*
                Desktop: listings headline left, Live top-right (aligns with Share).
              */}
              <div className="hidden lg:flex items-start justify-between gap-x-4 gap-y-1 min-w-0">
                <div className="flex flex-wrap items-end gap-x-4 gap-y-1 min-w-0">
                  {(() => {
                    const erasing = listingsBlurbFrozen != null;
                    const erased =
                      erasing &&
                      listingsBlurbCharsRemoved >= listingsBlurbFrozen.length;
                    if (erased) return null;
                    const erasingText =
                      erasing && listingsBlurbFrozen
                        ? listingsBlurbFrozen.slice(listingsBlurbCharsRemoved)
                        : null;
                    return (
                      <h2 className="font-serif text-[22px] sm:text-[28px] lg:text-[30px] text-navy leading-tight">
                        {erasingText != null ? (
                          erasingText
                        ) : state === "loading" && liveListings === null ? (
                          <>Loading your listings…</>
                        ) : resultCount === 0 ? (
                          <>No listings match your filters</>
                        ) : (
                          <>
                            {filteredCount.toLocaleString()} of{" "}
                            {poolCount.toLocaleString()} of your listings
                            {active === "All" ? "" : ` in ${active}`}
                            {sortKey === "score" ? (
                              <>
                                , <span className="italic">scored.</span>
                              </>
                            ) : (
                              "."
                            )}
                          </>
                        )}
                      </h2>
                    );
                  })()}
                  <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold pb-0.5">
                    Intelligence
                  </p>
                </div>
                <div className="shrink-0 pt-1 text-right text-slate">
                  {liveStatusChip}
                </div>
              </div>

              {/* md-only Live (no desktop headline on this breakpoint). */}
              <div className="hidden md:flex lg:hidden items-center justify-end">
                <div className="text-slate">{liveStatusChip}</div>
              </div>

              {/*
                Mobile board chrome (cream section, not hero header):
                Share left; Town stats · Vintages right — same row.
              */}
              <div className="flex w-full items-center justify-between gap-x-3 gap-y-1 lg:hidden">
                <ListingShareButton
                  href={intelligenceShareHref}
                  title={intelligenceShareTitle}
                  className="!h-12 !w-12 shrink-0 text-navy hover:text-navy hover:bg-navy/[0.06]"
                  iconClassName="h-7 w-7"
                  strokeWidth={1.25}
                />
                <div className="inline-flex items-center gap-x-3">
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
            </div>
            {/* Sidebar column spacer — keeps Live/share aligned to the board edge. */}
            <div className="hidden lg:block" aria-hidden />
          </div>

          <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_248px] lg:gap-5 lg:items-start">

            {/* Deal board */}
            <div
              ref={boardRef}
              id="deal-board"
              className={`min-w-0 scroll-mt-36 transition-opacity duration-150 ${
                boardSortPending ? "opacity-60" : "opacity-100"
              }`}
              aria-busy={boardSortPending || undefined}
            >
          {/*
            Mobile: minigraphs + labels first, then Show graphs + Sorted by.
            Share sits with Town stats / Vintages above (mobile) or right here
            (desktop, above board Reset).
            When graphs are unavailable, keep the Sorted by / share row;
            Sorted by stays mobile-only.
          */}
          <div className="flex flex-col">
            <div className="mb-0.5 flex items-center justify-between gap-3 order-2 lg:order-1">
              {graphsAvailable ? (
                <button
                  type="button"
                  className="font-mono text-[9px] tracking-[0.12em] uppercase text-navy/55 underline decoration-navy/25 underline-offset-2 transition-colors hover:text-navy hover:decoration-gold"
                  onClick={() => {
                    if (mapGraphsSuppressed) {
                      setMapGraphsRevealed(true);
                      setMiniGraphsHiddenPref(false, {
                        suspendAutoHide: true,
                      });
                      return;
                    }
                    if (showMap) setMapGraphsRevealed(false);
                    if (miniGraphsHidden) {
                      setMiniGraphsHiddenPref(false, {
                        suspendAutoHide: true,
                      });
                    } else {
                      setMiniGraphsHiddenPref(true);
                    }
                  }}
                  aria-pressed={graphsHidden}
                >
                  {graphsHidden ? "Show graphs" : "Hide graphs"}
                </button>
              ) : (
                <span />
              )}
              <div className="ml-auto inline-flex items-center gap-1.5">
                <div className="inline-flex items-center gap-1.5 lg:hidden">
                  {/* Map on: the toggle moves here, left of Sorted by, because the
                      map fills the phone viewport and hides the board toolbar. */}
                  {showMap ? (
                    <>
                      <DealBoardCardViewButton
                        view={dealBoardCardView(boardView)}
                        onClick={() => {
                          setMapFullscreen(false);
                          setMapOnPref("off");
                        }}
                        className="lg:hidden"
                        label="Show listings"
                      />
                      <DealBoardMapToggleButton
                        mapOn={showMap}
                        onToggle={() => {
                          setMapFullscreen(false);
                          setMapOnPref("off");
                        }}
                        className="lg:hidden"
                      />
                    </>
                  ) : null}
                  <span className="shrink-0 font-mono text-[10px] tracking-[0.14em] uppercase text-navy/55">
                    Sorted by:
                  </span>
                  <button
                    type="button"
                    className="font-mono text-[10px] tracking-[0.14em] uppercase text-navy/65 underline underline-offset-2 decoration-navy/35 hover:text-navy transition-colors"
                    onClick={() => setSortFieldDrawerOpen(true)}
                    aria-expanded={sortFieldDrawerOpen}
                    aria-controls="intel-sort-drawer"
                  >
                    {dealBoardSortLabel(sortKey)}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSort(sortKey)}
                    className="inline-flex shrink-0 items-center justify-center font-mono text-[15px] font-bold leading-none text-navy hover:text-gold transition-colors"
                    title={
                      sortDir === "asc" ? "Sort descending" : "Sort ascending"
                    }
                    aria-label={
                      sortDir === "asc"
                        ? "Flip sort to descending"
                        : "Flip sort to ascending"
                    }
                  >
                    {sortDir === "asc" ? "↑" : "↓"}
                  </button>
                </div>
                <ListingShareButton
                  href={intelligenceShareHref}
                  title={intelligenceShareTitle}
                  className="!hidden lg:!inline-flex !h-8 !w-8 shrink-0 text-navy hover:text-navy hover:bg-navy/[0.06]"
                  iconClassName="h-4 w-4"
                  strokeWidth={1.5}
                />
              </div>
            </div>
            {graphsAvailable && !mapGraphsSuppressed ? (
              <div className="order-1 lg:order-2">
                <IntelligenceMiniGraphsStrip
                  onInteractRef={miniGraphsInteractRef}
                  showHideToggle={false}
                  hidden={miniGraphsHidden}
                  onHiddenChange={(hidden) => setMiniGraphsHiddenPref(hidden)}
                  autoHideSuspended={miniGraphsAutoHideSuspended}
                  onAutoHideSuspendedChange={setMiniGraphsAutoHideSuspended}
                  slots={[
                    {
                      key: "vintage",
                      node:
                        vintageChartListingRows.length > 0 ? (
                          <IntelligenceVintageMedianMiniChart
                            listings={vintageChartListingRows}
                            kind={tx === "rental" ? "rental" : "sale"}
                            activeBucketId={activeVintageChartBucketId}
                            filterActive={vintageFilterActive(
                              minVintage,
                              maxVintage,
                            )}
                            onInteract={pauseMiniGraphsRotation}
                            onBucketClick={(bucketId) => {
                              selectVintageListings(bucketId);
                              // Enlarge matching criteria descriptor (pinned + in-flow) for 10s.
                              setVintageSliderActive(true);
                              setVintageSliderActive(false);
                            }}
                            onResetFilter={() => {
                              setMinVintageFilter("0");
                              setMaxVintageFilter(
                                String(VINTAGE_FILTER_MAX) as VintageIndexFilter,
                              );
                              setBoardPage(1);
                            }}
                          />
                        ) : null,
                    },
                    {
                      key: "inventory-price",
                      node: showPriceFilter ? (
                        <IntelligencePriceBandMiniChart
                          city={active === "All" ? "All" : active}
                          kind={tx === "rental" ? "rental" : "sale"}
                          listings={priceMiniGraphListings}
                          activeBucketId={activePriceBandId}
                          filterActive={
                            priceFilterActive && !activeLuxuryPriceBandId
                          }
                          onInteract={pauseMiniGraphsRotation}
                          onBucketClick={(bucket) => {
                            priceRangeCustomizedRef.current = true;
                            setActivePriceBandId(bucket.id);
                            setActiveLuxuryPriceBandId(null);
                            setMinPriceIndex(
                              minPriceToStepIndex(bucket.min, boardPriceSteps),
                            );
                            setMaxPriceIndex(
                              bucket.max == null
                                ? boardPriceMaxIdx
                                : maxPriceToStepIndex(bucket.max, boardPriceSteps),
                            );
                            setBoardPage(1);
                            // Enlarge matching criteria descriptor (pinned + in-flow) for 10s.
                            setPriceSliderActive(true);
                            setPriceSliderActive(false);
                          }}
                          onResetFilter={() => {
                            priceRangeCustomizedRef.current = false;
                            setActivePriceBandId(null);
                            setActiveLuxuryPriceBandId(null);
                            setMinPriceIndex(0);
                            setMaxPriceIndex(boardPriceMaxIdx);
                            setBoardPage(1);
                          }}
                        />
                      ) : null,
                    },
                    {
                      key: "inventory-dom",
                      node: (
                        <IntelligenceDomBandMiniChart
                          city={active === "All" ? "All" : active}
                          kind={tx === "rental" ? "rental" : "sale"}
                          listings={domMiniGraphListings}
                          activeBucketId={activeDomBandId}
                          filterActive={activeDomBandId != null}
                          onInteract={pauseMiniGraphsRotation}
                          onBucketClick={(bucket) => {
                            setActiveDomBandId(bucket.id);
                            setDomBandMinDays(bucket.minDays);
                            setDomBandMaxDays(bucket.maxDays);
                            setBoardPage(1);
                          }}
                          onResetFilter={() => {
                            setActiveDomBandId(null);
                            setDomBandMinDays(null);
                            setDomBandMaxDays(null);
                            setBoardPage(1);
                          }}
                        />
                      ),
                    },
                    {
                      // Graph #4 — Luxury / Mid-market / Value / Discount.
                      key: "luxury-inventory-price",
                      // Mobile: hold this slide through Luxury → Mid → Value → Discount.
                      carouselDwellSteps: 4,
                      node:
                        showPriceFilter && tx !== "rental" ? (
                          <IntelligenceLuxuryPriceBandMiniChart
                            city={active === "All" ? "All" : active}
                            listings={priceMiniGraphListings}
                            initialSeed={
                              (active === "All" || !active
                                ? initialInventorySegmentChart
                                : null) ?? null
                            }
                            activeBucketId={activeLuxuryPriceBandId}
                            filterActive={
                              priceFilterActive &&
                              Boolean(activeLuxuryPriceBandId)
                            }
                            onInteract={pauseMiniGraphsRotation}
                            onBucketClick={(bucket) => {
                              priceRangeCustomizedRef.current = true;
                              setActiveLuxuryPriceBandId(bucket.id);
                              setActivePriceBandId(null);
                              setMinPriceIndex(
                                minPriceToStepIndex(bucket.min, boardPriceSteps),
                              );
                              setMaxPriceIndex(
                                bucket.max == null
                                  ? boardPriceMaxIdx
                                  : maxPriceToStepIndex(
                                      bucket.max,
                                      boardPriceSteps,
                                    ),
                              );
                              setBoardPage(1);
                              // Enlarge matching criteria descriptor (pinned + in-flow) for 10s.
                              setPriceSliderActive(true);
                              setPriceSliderActive(false);
                            }}
                            onResetFilter={() => {
                              priceRangeCustomizedRef.current = false;
                              setActiveLuxuryPriceBandId(null);
                              setActivePriceBandId(null);
                              setMinPriceIndex(0);
                              setMaxPriceIndex(boardPriceMaxIdx);
                              setBoardPage(1);
                            }}
                          />
                        ) : null,
                    },
                  ]}
                />
              </div>
            ) : null}
          </div>
          <div className={showMap ? "flex flex-col gap-2 md:gap-3" : "contents"}>
            {hoistBoardToolbar ? (
              <div
                ref={setBoardToolbarHost}
                className="sticky z-30 overflow-hidden rounded-2xl border border-charcoal/[0.08] bg-white shadow-[0_4px_16px_-8px_rgba(26,35,50,0.18)] empty:hidden"
                style={{ top: boardChromeStickyTopPx }}
              />
            ) : null}
          <div
            className={
              showMap
                ? mapBeside
                  ? // The map is first in the DOM, so Right reverses the row.
                    `flex flex-col gap-2 lg:flex lg:items-start lg:gap-4 ${
                      mapLayout === "left" ? "lg:flex-row" : "lg:flex-row-reverse"
                    }`
                  : "flex flex-col gap-2 md:gap-4"
                : "contents"
            }
          >
            {showMap ? (
              <div
                ref={stickyTopMapRef}
                className={
                  mapFullscreen
                    ? "fixed inset-0 z-[70] bg-navy"
                    : mapBeside
                      ? "relative lg:sticky lg:top-[var(--intel-map-top,6rem)] lg:w-[min(48vw,40rem)] lg:shrink-0"
                      : stickyTopMapActive
                        ? "sticky z-30 w-full"
                        : "relative w-full"
                }
                style={
                  mapBeside
                    ? ({
                        "--intel-map-top": `${stickyTopMapOffsetPx}px`,
                      } as CSSProperties)
                    : stickyTopMapActive
                      ? { top: stickyTopMapOffsetPx }
                      : undefined
                }
              >
                <DealBoardMap
                  listings={boardListings}
                  boundZips={mapBoundZips}
                  scopeLabel={
                    zip?.trim()
                      ? zip.trim()
                      : active === "All"
                        ? "all towns"
                        : active
                  }
                  // Hover / tap flash, or the zip that is actually selected.
                  highlightZip={hoveredZip ?? flashedZip ?? zip}
                  activeKey={mapActiveKey}
                  onSelect={(key) => setMapActiveKey(key)}
                  hrefFor={(l) =>
                    listingDetailHrefForListing({
                      mlsId: l.key,
                      listingKey:
                        boardListings.find((r) => r.key === l.key)?.listingKey ??
                        null,
                      address: { street: l.address, full: l.address },
                      city: l.city ?? null,
                    })
                  }
                  heightClass={
                    mapFullscreen
                      ? "h-[100dvh]"
                      : mapBeside
                        ? "h-[min(44vh,22rem)] md:h-[70vh] lg:h-[calc(100dvh_-_var(--intel-map-top,6rem)_-_0.5rem)]"
                        : "h-[min(44vh,22rem)] md:h-[26rem]"
                  }
                  fullscreen={mapFullscreen}
                  fitInset={mapFitInset}
                  onFullscreenToggle={() => setMapFullscreen((on) => !on)}
                  onExitToGrid={() => {
                    setMapFullscreen(false);
                    setMapOnPref("off");
                    setBoardView("grid");
                  }}
                />
                <DealBoardMapMobileChrome
                  rootRef={mapChromeRef}
                  page={boardPage}
                  totalPages={totalBoardPages}
                  pageStart={boardPageStart}
                  pageEnd={boardPageEnd}
                  totalCount={filteredCount}
                  onPageChange={(page) => {
                    setBoardPage(page);
                  }}
                  boardStatusFilter={boardStatusFilter}
                  onBoardStatusFilterChange={(value) => {
                    setBoardStatusFilter(value);
                    setBoardPage(1);
                  }}
                  onResetSliders={resetSliders}
                  slidersCustomized={slidersCustomized}
                  fullscreen={mapFullscreen}
                  cardView={dealBoardCardView(boardView)}
                  onExitToListings={() => {
                    setMapFullscreen(false);
                    setMapOnPref("off");
                  }}
                />
                <div className="absolute right-2 top-2 z-20 hidden items-center gap-1 rounded-md border border-white/15 bg-navy/80 px-1 py-0.5 shadow-lg backdrop-blur-sm md:flex">
                  <span className="pl-0.5 font-mono text-[9px] tracking-wide text-white/45">
                    Map on
                  </span>
                  {DEAL_BOARD_MAP_LAYOUT_VALUES.map((option, index) => (
                    <Fragment key={option}>
                      {index > 0 ? (
                        <span
                          aria-hidden
                          className="font-mono text-[9px] leading-none text-white/25"
                        >
                          |
                        </span>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => setMapLayout(option)}
                        aria-pressed={mapLayout === option}
                        aria-label={DEAL_BOARD_MAP_LAYOUT_LABELS[option]}
                        title={DEAL_BOARD_MAP_LAYOUT_LABELS[option]}
                        className={`rounded px-1.5 py-0.5 font-mono text-[9px] tracking-wide transition-colors ${
                          mapLayout === option
                            ? "bg-white/15 text-white"
                            : "text-white/55 hover:text-gold"
                        }`}
                      >
                        {DEAL_BOARD_MAP_LAYOUT_SHORT_LABELS[option]}
                      </button>
                    </Fragment>
                  ))}
                </div>
              </div>
            ) : null}
            <div
              className={showMap ? "hidden min-w-0 flex-1 md:block" : "contents"}
            >
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
            progressivePhotoBatches
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
              setActiveDomBandId(null);
              setDomBandMinDays(null);
              setDomBandMaxDays(null);
            }}
            onHoverListing={
              showMap ? (key) => setMapActiveKey(key) : undefined
            }
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
            onSortDir={handleSortDir}
            sortFieldPickerInToolbar={false}
            sortFieldDrawerOpen={sortFieldDrawerOpen}
            onSortFieldDrawerOpenChange={setSortFieldDrawerOpen}
            toolbarStickyTopPx={boardToolbarStickyTopPx}
            toolbarHost={hoistBoardToolbar ? boardToolbarHost : null}
            boardView={boardView}
            onBoardViewChange={setBoardView}
            mapOn={showMap}
            onMapToggle={() => setMapOnPref(showMap ? "off" : "on")}
            rowsHiddenBelowMd={showMap}
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
              ) : showMap ? (
                <p className="font-mono text-[10px] tracking-[0.12em] uppercase text-slate">
                  Showing{" "}
                  <span className="tabular-nums text-navy">
                    {boardPageStart.toLocaleString()}–{boardPageEnd.toLocaleString()}
                  </span>{" "}
                  of{" "}
                  <span className="tabular-nums text-navy">
                    {filteredCount.toLocaleString()}
                  </span>{" "}
                  {filteredCount === 1 ? "listing" : "listings"}
                </p>
              ) : (
                <p className="font-mono text-[10px] tracking-[0.12em] uppercase text-slate">
                  {filteredCount.toLocaleString()} of{" "}
                  {poolCount.toLocaleString()}
                  {sortKey === "score" ? (
                    <span className="italic normal-case tracking-normal">
                      , scored
                    </span>
                  ) : null}
                </p>
              )
            }
            footer={
              <div className="border-t border-charcoal/[0.12] bg-cream/60 px-5 py-3 font-mono text-[10px] tracking-[0.12em] uppercase text-slate">
                {visibleCount.toLocaleString()} of {resultCount.toLocaleString()}{" "}
                {resultCount === 1 ? "listing" : "listings"} in this view
                {showBoardPagination
                  ? ` · page ${boardPage}/${totalBoardPages} · ${boardPageStart.toLocaleString()}–${boardPageEnd.toLocaleString()} of ${filteredCount.toLocaleString()}`
                  : ""}
              </div>
            }
          />
            </div>
          </div>
          </div>
          {showBoardPagination && (
            <div className={showMap ? "hidden md:block" : undefined}>
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
            </div>
          )}
            </div>{/* end deal board */}

            <aside
              className={`hidden lg:flex lg:flex-col lg:mt-0 lg:w-[248px] lg:justify-self-end lg:shrink-0 lg:self-start ${
                anySnapshotExpanded ? "gap-4" : "gap-2"
              }`}
            >
              {desktopShowStatsTab || desktopShowVintageTab ? (
                <div id="intel-stats-panel" className="min-w-0">
                  {desktopStatsFolderTabs ? (
                    <div
                      role="tablist"
                      aria-label="Stats panels"
                      className="flex w-full items-end gap-0.5"
                    >
                      <button
                        type="button"
                        role="tab"
                        aria-selected={desktopSidebarTab === "stats"}
                        className={desktopStatsFolderTabClass(
                          desktopSidebarTab === "stats",
                        )}
                        onClick={() => setDesktopStatsTab("stats")}
                      >
                        Stats
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={desktopSidebarTab === "vintage"}
                        className={desktopStatsFolderTabClass(
                          desktopSidebarTab === "vintage",
                        )}
                        onClick={() => setDesktopStatsTab("vintage")}
                      >
                        {vintageFolderTabLabel}
                      </button>
                    </div>
                  ) : (
                    <p className="shrink-0 text-left font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
                      {desktopShowStatsTab ? "Stats" : vintageFolderTabLabel}
                    </p>
                  )}
                  <div
                    className={`${
                      desktopStatsFolderTabs
                        ? "rounded-b-md rounded-tr-md border border-charcoal/[0.1] border-t-0 bg-white/70 px-2 pt-2 pb-2"
                        : ""
                    } ${anySnapshotExpanded ? "space-y-4" : "space-y-2"}`}
                  >
                    {desktopSidebarTab === "stats"
                      ? townSnapshotPanels
                      : renderVintageStatsPanel(desktopStatsFolderTabs)}
                  </div>
                </div>
              ) : null}
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
            placeBelowEl={townFilterAnchorEl}
            onSelectTown={
              fineHoverPointer ? selectTownFromBoundaryMap : undefined
            }
            onPointerStay={holdBoundaryMapOpen}
            onPointerAway={releaseBoundaryMap}
            exiting={boundaryMapExiting}
          />
        ) : (
          <ZipBoundaryPopover
            highlightTown={hoveredTown}
            anchorEl={hoveredTownEl}
            placeBelowEl={townFilterAnchorEl}
            onSelectTown={
              fineHoverPointer ? selectTownFromBoundaryMap : undefined
            }
            onPointerStay={holdBoundaryMapOpen}
            onPointerAway={releaseBoundaryMap}
            exiting={boundaryMapExiting}
          />
        )
      ) : flashedTown && !showMap ? (
        // Phone keeps this up until the next town/zip tap. Desktop still
        // flashes. Do not gate on the pill-row ref — that row remounts
        // after a town tap and left Fairfield with no map.
        flashedTown === "All" ? (
          <ZipBoundaryPopover
            highlightAllTowns
            anchorEl={townFilterAnchorEl}
            placeBelowEl={townFilterAnchorEl}
            exiting={boundaryMapExiting}
            onSettled={onTownMapSettled}
          />
        ) : (
          <ZipBoundaryPopover
            highlightTown={flashedTown}
            anchorEl={townFilterAnchorEl}
            placeBelowEl={townFilterAnchorEl}
            exiting={boundaryMapExiting}
            onSettled={onTownMapSettled}
          />
        )
      ) : null}
      {/* With the board map open it carries the blue highlight itself, so the
          floating mini-map would only compete with it. */}
      {showMap ? null : hoveredZip && hoveredZipEl ? (
        <ZipBoundaryPopover
          highlightZip={hoveredZip}
          contextZips={availableZips.filter((z) => z !== hoveredZip)}
          anchorEl={hoveredZipEl}
          placeBelowEl={zipFilterAnchorEl}
          exiting={boundaryMapExiting}
        />
      ) : flashedZip ? (
        <ZipBoundaryPopover
          highlightZip={flashedZip}
          contextZips={availableZips.filter((z) => z !== flashedZip)}
          anchorEl={zipFilterAnchorEl}
          placeBelowEl={zipFilterAnchorEl}
          exiting={boundaryMapExiting}
        />
      ) : null}
    </div>
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
function SliderKindResetButton({
  kind,
  onReset,
  label,
}: {
  kind: IntelSliderKind;
  onReset: (kind: IntelSliderKind) => void;
  label: string;
}) {
  return (
    <FilterResetButton
      onClick={() => onReset(kind)}
      label={label}
    />
  );
}

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
  visibleKinds = "all",
  showPerKindReset = false,
  onResetSliderKind,
  isSliderKindCustomized,
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
  visibleKinds?: "all" | readonly IntelSliderKind[];
  showPerKindReset?: boolean;
  onResetSliderKind?: (kind: IntelSliderKind) => void;
  isSliderKindCustomized?: (kind: IntelSliderKind) => boolean;
}) {
  const show = (kind: IntelSliderKind) =>
    visibleKinds === "all" || visibleKinds.includes(kind);
  const showBed = show("bed");
  const showBath = show("bath");
  const showVintage = show("vintage");
  const showSqft = show("sqft");
  const showFurnish = showFurnished && show("furnished");
  const kindReset = (kind: IntelSliderKind, label: string) =>
    showPerKindReset &&
    onResetSliderKind &&
    isSliderKindCustomized?.(kind) ? (
      <SliderKindResetButton
        kind={kind}
        onReset={onResetSliderKind}
        label={label}
      />
    ) : null;
  if (!showBed && !showBath && !showVintage && !showSqft && !showFurnish) {
    return null;
  }

  return (
    <>
      {showBed || showBath ? (
      <div className="flex items-center gap-1 shrink-0 w-fit">
        {showBed ? (
        <>
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
        {kindReset("bed", "Reset beds")}
        </>
        ) : null}
        {showBath ? (
        <>
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
        {kindReset("bath", "Reset baths")}
        </>
        ) : null}
      </div>
      ) : null}
      {showVintage || showSqft || showFurnish ? (
      <div className="flex items-start gap-1 shrink-0 w-fit">
        <div className="flex flex-col gap-1">
          {showVintage ? (
          <div className="flex items-center gap-1">
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
          {kindReset("vintage", "Reset year built")}
          </div>
          ) : null}
          {showFurnish ? (
            <div className="flex items-center gap-1">
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
            {kindReset("furnished", "Reset furnished")}
            </div>
          ) : null}
        </div>
        {showSqft ? (
          <div className="flex items-center gap-1">
          <SqftRangeSlider
            label="Sq feet"
            steps={boardSqftSteps}
            minIndex={minSqftIndex}
            maxIndex={maxSqftIndex}
            onMinIndexChange={onMinSqftIndexChange}
            onMaxIndexChange={onMaxSqftIndexChange}
            onActiveChange={onSqftSliderActiveChange}
          />
          {kindReset("sqft", "Reset square feet")}
          </div>
        ) : null}
      </div>
      ) : null}
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
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 self-center transition-[margin] duration-300 ease-out ${
        active ? "mr-3 sm:mr-4" : "mr-2 sm:mr-2.5"
      }`}
    >
      <button
        type="button"
        onClick={onClick}
        aria-label="Open filter sliders"
        className={`inline-flex text-gold drop-shadow-sm transition-all duration-300 ease-out ${
          active ? "opacity-100 scale-110" : "opacity-95 scale-100"
        } cursor-pointer hover:text-gold-light`}
      >
        <DescriptorSearchIcon className={active ? "h-5 w-5" : "h-3.5 w-3.5"} />
      </button>
    </span>
  );
}

/** Sits inline after the last slider descriptor (typically sqft). */
function DescriptorEditAllControl({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: "Edit all" | "More filters";
}) {
  const editAll = label === "Edit all";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={
        editAll
          ? "Edit all filters — scroll to top and show filter controls"
          : "Show more filters still at their default"
      }
      title={label}
      className={`shrink-0 self-center font-mono font-bold tracking-[0.14em] uppercase text-gold leading-none origin-left transition-all duration-300 ease-out hover:text-gold-light underline-offset-2 hover:underline ${
        active ? "text-lg scale-110" : `${INTEL_DESCRIPTOR_IDLE_TEXT} scale-100`
      }`}
    >
      {label}
    </button>
  );
}

function IntelFilterDescriptorDot() {
  return (
    <span
      className={`shrink-0 self-center font-mono ${INTEL_DESCRIPTOR_IDLE_TEXT} font-bold leading-none text-gold/65`}
      aria-hidden
    >
      •
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

function UnderContractLabel({
  active,
  onClick,
}: {
  active: boolean;
  onClick?: () => void;
}) {
  const interactive = onClick != null;
  const className = descriptorLabelClass(active, interactive);
  const label = "Incl. under contract";

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
  underContractSliderActive?: boolean;
  isSliderKindCustomized: (kind: IntelSliderKind) => boolean;
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
  underContractSliderActive = false,
  isSliderKindCustomized,
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
  const showResidentialSliders = cls !== "commercial";
  const nodes: { kind: IntelSliderKind; node: ReactNode }[] = [];

  if (showPriceFilter && isSliderKindCustomized("price")) {
    nodes.push({
      kind: "price",
      node: (
        <PriceRangeLabel
          steps={boardPriceSteps}
          minIndex={minPriceIndex}
          maxIndex={maxPriceIndex}
          active={priceSliderActive}
          onClick={() => onDescriptorClick("price")}
        />
      ),
    });
  }
  if (showResidentialSliders && isSliderKindCustomized("bed")) {
    nodes.push({
      kind: "bed",
      node: (
        <BedroomLabel
          min={minBedrooms}
          max={maxBedrooms}
          active={bedSliderActive}
          onClick={() => onDescriptorClick("bed")}
        />
      ),
    });
  }
  if (showResidentialSliders && isSliderKindCustomized("bath")) {
    nodes.push({
      kind: "bath",
      node: (
        <BathroomLabel
          min={minBathrooms}
          max={maxBathrooms}
          active={bathSliderActive}
          onClick={() => onDescriptorClick("bath")}
        />
      ),
    });
  }
  if (showResidentialSliders && isSliderKindCustomized("vintage")) {
    nodes.push({
      kind: "vintage",
      node: (
        <VintageLabel
          min={minVintage}
          max={maxVintage}
          active={vintageSliderActive}
          onClick={() => onDescriptorClick("vintage")}
        />
      ),
    });
  }
  if (showResidentialSliders && isSliderKindCustomized("sqft")) {
    nodes.push({
      kind: "sqft",
      node: (
        <SqftRangeLabel
          steps={boardSqftSteps}
          minIndex={minSqftIndex}
          maxIndex={maxSqftIndex}
          active={sqftSliderActive}
          onClick={() => onDescriptorClick("sqft")}
        />
      ),
    });
  }
  if (showFurnished && isSliderKindCustomized("furnished")) {
    nodes.push({
      kind: "furnished",
      node: (
        <FurnishedLabel
          value={furnishedFilter}
          active={furnishedSliderActive}
          onClick={() => onDescriptorClick("furnished")}
        />
      ),
    });
  }
  if (isSliderKindCustomized("undercontract")) {
    nodes.push({
      kind: "undercontract",
      node: (
        <UnderContractLabel
          active={underContractSliderActive}
          onClick={() => onDescriptorClick("undercontract")}
        />
      ),
    });
  }

  if (nodes.length === 0) return null;

  return (
    <>
      {nodes.map((item, i) => (
        <Fragment key={item.kind}>
          {withLeadingSeparator || i > 0 ? <IntelFilterDescriptorDot /> : null}
          {item.node}
        </Fragment>
      ))}
    </>
  );
}

function IntelFilterControlsRow({
  filtersExpanded,
  showPriceFilter,
  cls,
  collapsedSlidersOpen,
  exposedSliders,
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
  underContractPref,
  onUnderContractPrefChange,
  onResetSliders,
  onResetSliderKind,
  isSliderKindCustomized,
  slidersCustomized,
}: {
  filtersExpanded: boolean;
  showPriceFilter: boolean;
  cls: ClsFilter;
  collapsedSlidersOpen: boolean;
  exposedSliders: ExposedIntelSliders;
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
  underContractPref: UnderContractPref;
  onUnderContractPrefChange: (value: UnderContractPref) => void;
  onResetSliders: () => void;
  onResetSliderKind: (kind: IntelSliderKind) => void;
  isSliderKindCustomized: (kind: IntelSliderKind) => boolean;
  slidersCustomized: boolean;
}) {
  const rowClass = `flex flex-wrap items-start gap-2 w-full min-w-0 self-start font-mono text-xs tracking-wide ${
    filtersExpanded ? "mt-1.5" : "mt-1"
  }`;

  // Accumulated descriptor peeks win over Edit-all expanded.
  const isPartialPeek = isPartialSliderPeek(exposedSliders);
  const visibleKinds: "all" | readonly IntelSliderKind[] =
    Array.isArray(exposedSliders) && exposedSliders.length > 0
      ? exposedSliders
      : "all";
  const showKind = (kind: IntelSliderKind) =>
    visibleKinds === "all" || visibleKinds.includes(kind);
  const showPriceControls = showPriceFilter && showKind("price");
  const showResidentialRow =
    cls !== "commercial" &&
    (visibleKinds === "all" ||
      visibleKinds.some((k) =>
        k === "bed" ||
        k === "bath" ||
        k === "vintage" ||
        k === "sqft" ||
        k === "furnished",
      ));
  const showCommercialFurnished =
    cls === "commercial" && showFurnished && showKind("furnished");
  const showUnderContractToggle = showKind("undercontract");
  if (
    !showPriceFilter &&
    cls === "commercial" &&
    !showFurnished &&
    !showUnderContractToggle
  ) {
    return null;
  }
  // Full set (mag glass / every descriptor) → one reset; partial peeks → per kind.
  // Hide reset until a slider is dirty — a pristine track has nothing to undo.
  const showConsolidatedReset = visibleKinds === "all" && slidersCustomized;
  const showPerKindReset = isPartialPeek;

  const sliderPanel = (
    <div className="flex flex-col gap-y-1">
      {showPriceControls || showConsolidatedReset ? (
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {showPriceControls ? (
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
            {showPerKindReset && isSliderKindCustomized("price") ? (
              <SliderKindResetButton
                kind="price"
                onReset={onResetSliderKind}
                label="Reset price"
              />
            ) : null}
          </div>
        ) : null}
        {showConsolidatedReset ? (
        <FilterResetButton
          onClick={onResetSliders}
          label="Reset sliders"
        />
        ) : null}
      </div>
      ) : null}
      {showResidentialRow ? (
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
          visibleKinds={visibleKinds}
          showPerKindReset={showPerKindReset}
          onResetSliderKind={onResetSliderKind}
          isSliderKindCustomized={isSliderKindCustomized}
        />
      ) : showCommercialFurnished ? (
        <div className="flex items-center gap-1">
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
        {showPerKindReset && isSliderKindCustomized("furnished") ? (
          <SliderKindResetButton
            kind="furnished"
            onReset={onResetSliderKind}
            label="Reset furnished"
          />
        ) : null}
        </div>
      ) : null}
      {showUnderContractToggle ? (
        <div className="flex items-center gap-1 shrink-0 w-fit">
          <FilterGroup
            label="Under contract"
            value={underContractPref}
            onChange={onUnderContractPrefChange}
            options={[
              { value: "off", label: "Hide" },
              { value: "on", label: "Show" },
            ]}
          />
          {showPerKindReset && isSliderKindCustomized("undercontract") ? (
            <SliderKindResetButton
              kind="undercontract"
              onReset={onResetSliderKind}
              label="Reset under contract"
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );

  // Edit-all shows the full set unless descriptors are peeking a subset.
  if (filtersExpanded && !isPartialPeek) {
    return <div className={rowClass}>{sliderPanel}</div>;
  }

  if (!collapsedSlidersOpen && !isPartialPeek) return null;

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

  // Keep the category label on the bar while thumbs move so the control stays
  // identifiable (Price / Beds / Baths / Vintage / Sqft).
  const { thumbLo, thumbHi } = dualSliderThumbValues(lo, hi, maxIndex);
  return (
    <div className="flex items-center shrink-0">
      <div className={`relative h-6 ${widthClass} shrink-0`}>
        <div
          aria-hidden
          className="pointer-events-none absolute left-0 right-0 top-1/2 h-2.5 -translate-y-1/2 rounded-full bg-white/20"
        />
        {label ? (
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
          value={thumbLo}
          disabled={disabled}
          onChange={(e) => {
            const next = Number(e.target.value);
            // Stacked / equal bounds: upper input sits on top — route a left drag to min.
            if (lo === hi && next < lo) {
              const clamped = clampDualSliderMin(next, hi, maxIndex);
              if (clamped !== lo) setSliderActive(true);
              onMinChange(clamped);
              return;
            }
            const clamped = clampDualSliderMin(next, hi, maxIndex);
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
          value={thumbHi}
          disabled={disabled}
          onChange={(e) => {
            const next = Number(e.target.value);
            if (lo === hi && next < lo) {
              const clamped = clampDualSliderMin(next, hi, maxIndex);
              if (clamped !== lo) setSliderActive(true);
              onMinChange(clamped);
              return;
            }
            const clamped = clampDualSliderMax(next, lo, maxIndex);
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

  const { thumbLo, thumbHi } = dualSliderThumbValues(lo, hi, maxStepIndex);
  return (
    <div className="flex flex-col items-stretch shrink-0">
      <div className={`relative h-6 ${INTEL_SLIDER_WIDTH_CLASS} shrink-0`}>
        <div
          aria-hidden
          className="pointer-events-none absolute left-0 right-0 top-1/2 h-2.5 -translate-y-1/2 rounded-full bg-white/20"
        />
        {label ? (
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
          value={thumbLo}
          disabled={disabled}
          onChange={(e) => {
            const next = Number(e.target.value);
            if (lo === hi && next < lo) {
              const clamped = clampDualSliderMin(next, hi, maxStepIndex);
              if (clamped !== lo) setSliderActive(true);
              onMinIndexChange(clamped);
              return;
            }
            const clamped = clampDualSliderMin(next, hi, maxStepIndex);
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
          value={thumbHi}
          disabled={disabled}
          onChange={(e) => {
            const next = Number(e.target.value);
            if (lo === hi && next < lo) {
              const clamped = clampDualSliderMin(next, hi, maxStepIndex);
              if (clamped !== lo) setSliderActive(true);
              onMinIndexChange(clamped);
              return;
            }
            const clamped = clampDualSliderMax(next, lo, maxStepIndex);
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

  const { thumbLo, thumbHi } = dualSliderThumbValues(lo, hi, maxStepIndex);
  return (
    <div className="flex flex-col items-stretch shrink-0">
      <div className={`relative h-6 ${INTEL_SLIDER_WIDTH_CLASS} shrink-0`}>
        <div
          aria-hidden
          className="pointer-events-none absolute left-0 right-0 top-1/2 h-2.5 -translate-y-1/2 rounded-full bg-white/20"
        />
        {label ? (
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
          value={thumbLo}
          disabled={disabled}
          onChange={(e) => {
            const next = Number(e.target.value);
            if (lo === hi && next < lo) {
              const clamped = clampDualSliderMin(next, hi, maxStepIndex);
              if (clamped !== lo) setSliderActive(true);
              onMinIndexChange(clamped);
              return;
            }
            const clamped = clampDualSliderMin(next, hi, maxStepIndex);
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
          value={thumbHi}
          disabled={disabled}
          onChange={(e) => {
            const next = Number(e.target.value);
            if (lo === hi && next < lo) {
              const clamped = clampDualSliderMin(next, hi, maxStepIndex);
              if (clamped !== lo) setSliderActive(true);
              onMinIndexChange(clamped);
              return;
            }
            const clamped = clampDualSliderMax(next, lo, maxStepIndex);
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

/**
 * Digits + one decimal; optional trailing k/m only (never first / mid-string).
 * Other letters are stripped.
 */
function sanitizeIntelPriceDraft(raw: string): string {
  const cleaned = raw.replace(/[^0-9.kKmM]/g, "");
  const hasTrailingSuffix = /[kKmM]$/.test(cleaned);
  const suffixChar = hasTrailingSuffix ? cleaned.slice(-1) : "";
  let body = hasTrailingSuffix ? cleaned.slice(0, -1) : cleaned;
  body = body.replace(/[kKmM]/g, "");
  const dot = body.indexOf(".");
  const normalized =
    dot === -1
      ? body
      : `${body.slice(0, dot + 1)}${body.slice(dot + 1).replace(/\./g, "")}`;
  // k/m cannot be the first character — require a numeric body.
  if (suffixChar && normalized.length > 0) {
    return `${normalized}${suffixChar}`;
  }
  return normalized;
}

function intelPriceDraftHasSuffix(raw: string): boolean {
  return /[kKmM]$/.test(raw.trim()) && raw.trim().length > 1;
}

/**
 * Thousands separators once the whole-dollar part passes four digits, so a typed
 * 1250000 reads as 1,250,000. K/M shorthand is already short — left alone.
 */
function groupIntelPriceDraft(draft: string): string {
  const parts = draft.match(/^(\d*)(\.\d*)?$/);
  if (!parts) return draft;
  const digits = parts[1] ?? "";
  if (digits.length <= 4) return draft;
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${grouped}${parts[2] ?? ""}`;
}

/** Sanitize a keystroke, then re-apply comma grouping for the display value. */
function formatIntelPriceDraft(raw: string): string {
  return groupIntelPriceDraft(sanitizeIntelPriceDraft(raw));
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
  const minInputRef = useRef<HTMLInputElement>(null);
  const maxInputRef = useRef<HTMLInputElement>(null);
  /** Skip the blur commit that follows an Enter / trailing K·M commit. */
  const skipBlurCommitRef = useRef<"min" | "max" | null>(null);
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

  const blurBound = (bound: "min" | "max") => {
    skipBlurCommitRef.current = bound;
    const el = bound === "min" ? minInputRef.current : maxInputRef.current;
    el?.blur();
  };

  const commitMinPrice = (raw: string, opts?: { blur?: boolean }) => {
    setMinDraft(null);
    const trimmed = raw.trim();
    // Left empty → the visitor wants everything from the bottom of the board up.
    if (!trimmed) {
      clearBoundNoteTimer();
      setBoundNote(null);
      if (lo !== 0) {
        setSliderActive(true);
        onMinIndexChange(0);
      }
      if (opts?.blur !== false) blurBound("min");
      return;
    }
    const parsed = parseIntelPriceInput(raw);
    if (parsed == null) {
      showBoundNote(
        "Lower price isn’t valid — use dollars, or a number with K/M (e.g. 750k or 1.2m).",
      );
      blurBound("min");
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
    if (opts?.blur !== false) blurBound("min");
  };

  const commitMaxPrice = (raw: string, opts?: { blur?: boolean }) => {
    setMaxDraft(null);
    const trimmed = raw.trim();
    // Left empty → the visitor wants everything up to the top of the board.
    if (!trimmed) {
      clearBoundNoteTimer();
      setBoundNote(null);
      if (hi !== maxStepIndex) {
        setSliderActive(true);
        onMaxIndexChange(maxStepIndex);
      }
      if (opts?.blur !== false) blurBound("max");
      return;
    }
    const parsed = parseIntelPriceInput(raw);
    if (parsed == null) {
      showBoundNote(
        "Upper price isn’t valid — use dollars, or a number with K/M (e.g. 750k or 1.2m).",
      );
      blurBound("max");
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
    if (opts?.blur !== false) blurBound("max");
  };

  /**
   * Tapping outside the sliders panel unmounts these inputs without firing a
   * blur, so a typed amount would be dropped. Commit typed text on the way out;
   * an untouched empty box is left alone — only tabbing off means "no bound".
   */
  const commitOnUnmountRef = useRef<() => void>(() => {});
  commitOnUnmountRef.current = () => {
    if (minDraft?.trim()) commitMinPrice(minDraft, { blur: false });
    if (maxDraft?.trim()) commitMaxPrice(maxDraft, { blur: false });
  };
  useEffect(() => () => commitOnUnmountRef.current(), []);

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

  // Either bound focused → enlarge both upper and lower (same scale as before)
  // and widen the pair, so a comma-grouped 1,250,000 is readable while typing.
  const priceInputsEnlarged = focusedBound != null;
  const priceInputClass = (bound: "min" | "max") =>
    [
      "w-0 min-w-0 rounded border border-white/20 bg-white/5 font-mono tabular-nums text-gold placeholder:text-white/30 focus:border-gold/50 focus:outline-none disabled:opacity-40 overflow-y-auto transition-[font-size,padding,flex-grow] duration-150",
      priceInputsEnlarged
        ? "px-1.5 py-1 text-[14px] leading-tight"
        : "px-1 py-0.5 text-[9px]",
      // The bound being typed into takes the larger share of a fixed pair width.
      focusedBound === bound ? "flex-[2]" : "flex-1",
    ].join(" ");
  const priceInputHelp =
    "Type dollars (commas added past 4 digits) or shorthand like 750k / 1.2m. Enter or K/M commits; leave empty to take the board's own bound. Scroll: $500K steps ($1M above $4M).";

  return (
    <div
      className={`flex flex-col gap-0.5 shrink-0 transition-[width] duration-150 ${
        priceInputsEnlarged
          ? "w-[10rem] sm:w-[11rem]"
          : INTEL_SLIDER_WIDTH_CLASS
      }`}
    >
      <div className="flex gap-1">
        <input
          ref={minInputRef}
          type="text"
          // Letters must be reachable on phones for the K/M shorthand, which a
          // numeric inputMode hides; the field sanitizes anything else away.
          inputMode="text"
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="done"
          disabled={disabled}
          value={minDraft ?? formatIntelPriceStep(minPrice)}
          placeholder={formatIntelPriceStep(minPrice)}
          onChange={(e) => {
            const next = formatIntelPriceDraft(e.target.value);
            setMinDraft(next);
            if (intelPriceDraftHasSuffix(next)) {
              commitMinPrice(next);
            }
          }}
          onFocus={() => {
            setFocusedBound("min");
            // Clear so typing 750k isn’t “$1.5M” + edits.
            setMinDraft("");
          }}
          onBlur={(e) => {
            setFocusedBound((prev) => (prev === "min" ? null : prev));
            if (skipBlurCommitRef.current === "min") {
              skipBlurCommitRef.current = null;
              return;
            }
            commitMinPrice(e.target.value, { blur: false });
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitMinPrice((e.target as HTMLInputElement).value);
            }
          }}
          onWheel={(e) => {
            e.preventDefault();
            applyMinWheel(e.deltaY);
          }}
          title={priceInputHelp}
          aria-label="Minimum price amount"
          className={priceInputClass("min")}
        />
        <input
          ref={maxInputRef}
          type="text"
          inputMode="text"
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="done"
          disabled={disabled}
          value={maxDraft ?? formatIntelPriceStep(maxPrice)}
          placeholder={formatIntelPriceStep(maxPrice)}
          onChange={(e) => {
            const next = formatIntelPriceDraft(e.target.value);
            setMaxDraft(next);
            if (intelPriceDraftHasSuffix(next)) {
              commitMaxPrice(next);
            }
          }}
          onFocus={() => {
            setFocusedBound("max");
            setMaxDraft("");
          }}
          onBlur={(e) => {
            setFocusedBound((prev) => (prev === "max" ? null : prev));
            if (skipBlurCommitRef.current === "max") {
              skipBlurCommitRef.current = null;
              return;
            }
            commitMaxPrice(e.target.value, { blur: false });
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitMaxPrice((e.target as HTMLInputElement).value);
            }
          }}
          onWheel={(e) => {
            e.preventDefault();
            applyMaxWheel(e.deltaY);
          }}
          title={priceInputHelp}
          aria-label="Maximum price amount"
          className={priceInputClass("max")}
        />
      </div>
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

function IntelFilterSep() {
  const sepKit = useTabKitSegmentedStyle("pill-seg-dark-compact-sep");
  if (!sepKit.withSep) return null;
  return (
    <div
      className={`hidden sm:block ${sepKit.separatorClass()}`}
      aria-hidden
    />
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
  const tabKit = useTabKitSegmentedStyle("pill-seg-dark-compact");
  return (
    <div className="flex items-center gap-3">
      {label && (
        <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-white/45">
          {label}
        </span>
      )}
      <div className={tabKit.containerClass({ wrap: false })}>
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            aria-pressed={value === opt.value}
            className={tabKit.buttonClass(value === opt.value)}
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
    action: "new" | "reduced" | "closed" | "to-contract",
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
          className={`flex-1 min-w-0 text-center font-mono uppercase text-gold font-bold leading-snug break-words whitespace-normal ${
            showExpanded
              ? "text-[10px] tracking-[0.2em]"
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
    action: "new" | "reduced" | "closed" | "to-contract",
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
                      : m.action === "to-contract"
                        ? `View ${place} listings that went to contract this week`
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

function DealBoardMapMobileChrome({
  rootRef,
  page,
  totalPages,
  pageStart,
  pageEnd,
  totalCount,
  onPageChange,
  boardStatusFilter,
  onBoardStatusFilterChange,
  onResetSliders,
  slidersCustomized,
  fullscreen = false,
  cardView,
  onExitToListings,
}: {
  rootRef?: Ref<HTMLDivElement>;
  page: number;
  totalPages: number;
  pageStart: number;
  pageEnd: number;
  totalCount: number;
  onPageChange: (page: number) => void;
  boardStatusFilter: DealBoardStatusFilter;
  onBoardStatusFilterChange: (value: DealBoardStatusFilter) => void;
  onResetSliders: () => void;
  slidersCustomized: boolean;
  /** Full screen sits over the home bar, so the row needs the inset. */
  fullscreen?: boolean;
  cardView: DealBoardCardView;
  onExitToListings: () => void;
}) {
  return (
    <div
      ref={rootRef}
      className="absolute inset-x-0 bottom-0 z-20 md:hidden"
    >
      <div
        className="border-t border-charcoal/10 bg-white/95 px-2 py-1.5 backdrop-blur-sm"
        style={
          fullscreen
            ? { paddingBottom: "max(0.375rem, env(safe-area-inset-bottom))" }
            : undefined
        }
      >
        <div className="flex items-center justify-between gap-2">
          <p className="min-w-0 truncate font-mono text-[10px] tracking-[0.12em] uppercase text-slate">
            Showing{" "}
            <span className="tabular-nums text-navy">
              {pageStart.toLocaleString()}–{pageEnd.toLocaleString()}
            </span>{" "}
            of{" "}
            <span className="tabular-nums text-navy">
              {totalCount.toLocaleString()}
            </span>
          </p>
          <div className="flex shrink-0 items-center gap-1">
            <DealBoardCardViewButton
              view={cardView}
              onClick={onExitToListings}
              label="Show listings"
            />
            <DealBoardMapToggleButton mapOn onToggle={onExitToListings} />
            {slidersCustomized ? (
            <FilterResetButton
              onClick={onResetSliders}
              label="Reset sliders"
              tone="onLight"
            />
            ) : null}
          </div>
        </div>
        {totalPages > 1 ? (
          <div
            className="mt-1 flex items-center gap-0.5 overflow-x-auto"
            role="navigation"
            aria-label="Listing groups"
          >
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => {
              const isActive = pageNum === page;
              const groupStart = (pageNum - 1) * BOARD_MAP_LISTING_LIMIT + 1;
              const groupEnd = Math.min(pageNum * BOARD_MAP_LISTING_LIMIT, totalCount);
              return (
                <button
                  key={pageNum}
                  type="button"
                  onClick={() => onPageChange(pageNum)}
                  disabled={isActive}
                  aria-current={isActive ? "page" : undefined}
                  aria-label={`Listings ${groupStart}–${groupEnd}`}
                  className={`inline-flex min-w-7 shrink-0 items-center justify-center rounded px-1.5 py-0.5 font-mono text-[9px] tabular-nums ${
                    isActive
                      ? "bg-navy text-white"
                      : "text-slate hover:bg-charcoal/[0.06] hover:text-navy"
                  }`}
                >
                  {groupStart}–{groupEnd}
                </button>
              );
            })}
          </div>
        ) : null}
        <div className="mt-1">
          <DealBoardStatusFilterPills
            value={boardStatusFilter}
            onChange={onBoardStatusFilterChange}
            compact
          />
        </div>
      </div>
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
