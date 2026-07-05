"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ZipBoundaryPopover, { prefetchTownBoundaries, prefetchZipBoundaries } from "./ZipBoundaryPopover";
import { usePersonalizedTowns } from "@/hooks/usePersonalizedTowns";
import AllTownsDescriptor from "@/components/AllTownsDescriptor";
import IntelligenceVintageStats from "@/components/IntelligenceVintageStats";
import SnapshotCollapseToggle from "@/components/SnapshotCollapseToggle";
import type { VintageListingRow } from "@/lib/intelligence-vintage-stats";
import type { VintageBucketId } from "@/lib/vintage-buckets";
import DealOfTheDayFrame from "./DealOfTheDayFrame";
import DealBoardList from "@/components/intelligence/deal-board/DealBoardList";
import {
  DEAL_BOARD_VIEW_DEFAULT,
  DEAL_BOARD_VIEW_PREF_KEY,
  DEAL_BOARD_VIEW_VALUES,
  type DealBoardView,
} from "@/lib/deal-board-view";
import type { TownDescriptorStats } from "@/lib/intelligence-all-towns-descriptor";
import ListingScoreBreakdownModal from "./ListingScoreBreakdownModal";
import ListingHistoryModal from "./ListingHistoryModal";
import TownFilterPills from "./TownFilterPills";
import {
  filterPillButtonClass,
  filterPillContainerClass,
  filterPillSeparatorClass,
} from "@/lib/filter-pill-styles";
import { formatTownZipPlace, formatTownZipTagline, normalizeTownName, TMRE_TOWNS, listingZipMatchesTown, zipAreaNickname, type TmreTown, zipsForTown } from "@/lib/tmre-towns";
import { TOWN_MARKET_TAGLINES } from "@/lib/intelligence-town-taglines";
import { listingDetailHrefForListing } from "@/lib/listing-url";
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
import {
  INTEL_PRICE_MAX_INDEX,
  boardPriceMaxIndex,
  defaultPriceIndicesFromBoard,
  formatIntelPriceRangeLabelFromSteps,
  intelPriceFilterActiveOnBoard,
  intelPriceStepsForBoard,
  listingMatchesIntelPriceRange,
  resolveIntelPriceRangeFromSteps,
} from "@/lib/intel-price-filter";
import {
  formatVintageRangeLabel,
  listingMatchesVintageFilter,
  VINTAGE_FILTER_MAX,
  VINTAGE_INDEX_VALUES,
  vintageBucketFilterIndex,
  vintageFilterActive,
  type VintageIndexFilter,
} from "@/lib/intelligence-vintage-filter";
import { readClientPref, writeClientPref } from "@/lib/client-prefs";

type TxFilter = "all" | "sale" | "rental";
type ClsFilter = "all" | "residential" | "commercial";
type SalePropertyFilter = "all" | "homes" | "multi" | "condos";
type BoardStatusFilter = "all" | "new" | "reduced";

const TX_VALUES = ["all", "sale", "rental"] as const;
const CLS_VALUES = ["all", "residential", "commercial"] as const;
const MIN_BED_VALUES = ["0", "1", "2", "3", "4", "5", "6"] as const;
const MIN_BATH_VALUES = ["0", "1", "2", "3", "4", "5", "6"] as const;
const SALE_PROPERTY_VALUES = ["all", "homes", "multi", "condos"] as const;
const NEW_CONSTRUCTION_VALUES = ["all", "new"] as const;
const STATS_EXPANDED_PREF = "tmre_intel_stats_expanded_towns";
type MinBedFilter = (typeof MIN_BED_VALUES)[number];
type MinBathFilter = (typeof MIN_BATH_VALUES)[number];
type NewConstructionFilter = (typeof NEW_CONSTRUCTION_VALUES)[number];
const INTEL_CITIES = ["All", ...TMRE_TOWNS] as const;
type IntelCity = (typeof INTEL_CITIES)[number];

/** Market positioning copy — separate from offline mock data. */
const TOWN_TAGLINES = TOWN_MARKET_TAGLINES;

function formatTownTagline(town: TmreTown, zip?: string | null): string {
  return formatTownZipTagline(town, zip, TOWN_TAGLINES[town]);
}

function computeMonthsSupply(
  listingCount: number,
  avgMonthlySales: number | null | undefined,
): number | null {
  if (!avgMonthlySales || avgMonthlySales <= 0) return null;
  return listingCount / avgMonthlySales;
}

/** ≤2 seller's (coral), ≤4 balanced (gold), >4 buyer's (sage) — matches stats & new construction. */
function monthsSupplyColorClass(monthsSupply: number | null): string {
  if (monthsSupply == null) return "text-white/40";
  if (monthsSupply <= 2) return "text-coral";
  if (monthsSupply <= 4) return "text-gold";
  return "text-sage";
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
  isRental: boolean;
  isCommercial: boolean;
  propertyType?: string;
  yearBuilt?: number | null;
  beds?: number | null;
  baths?: number | null;
  headline: string;
  zip: string | null;
  photoCount?: number | null;
};

type InsightCandidate = {
  phrase: string;
  family: string;
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
  exactBeds = false,
  minPrice = 0,
  maxPrice: number | null = null,
  minVintage = 0,
  maxVintage = VINTAGE_FILTER_MAX,
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
      label: "Reduced",
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
  monthsSupplyClass: string;
} {
  const { stats } = snapshot;
  return {
    listings: String(stats.listingCount),
    medianPrice: formatSnapshotPrice(stats.medianPrice),
    monthsSupply:
      stats.monthsSupply != null ? `${stats.monthsSupply.toFixed(1)} mo` : "—",
    medianDom:
      stats.medianDom != null ? `${Math.round(stats.medianDom)}d DOM` : "— DOM",
    monthsSupplyClass: monthsSupplyColorClass(stats.monthsSupply),
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

type InsightInput = {
  address: string;
  propertyType: string;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  yearBuilt: number | null;
  dom: number | null;
  status: RowStatus;
  isRental: boolean;
  isCommercial: boolean;
  zip: string | null;
  price: number;
  score: number;
};

function streetCue(address: string): string | null {
  const cleaned = address.replace(/^\d+\s*/, "").trim();
  if (!cleaned) return null;
  const withoutSuffix = cleaned.replace(
    /\s+(Dr|Rd|St|Ave|Ln|Ct|Pl|Tpke|Hwy|Hill|Ridge|Beach|Way|Cir|Ter|Blvd)\.?$/i,
    "",
  );
  const words = withoutSuffix.split(/\s+/).slice(0, 2);
  return words.length ? words.join(" ") : cleaned.split(/\s+/)[0] ?? null;
}

function formatCompactSqft(sqft: number): string {
  if (sqft >= 1000) return `${(sqft / 1000).toFixed(1).replace(/\.0$/, "")}K sqft`;
  return `${sqft.toLocaleString()} sqft`;
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

function generateInsightCandidates(input: InsightInput): InsightCandidate[] {
  const {
    address,
    propertyType,
    beds,
    baths,
    sqft,
    yearBuilt,
    dom,
    status,
    isRental,
    isCommercial,
    zip,
    price,
    score,
  } = input;
  const street = streetCue(address);
  const isMulti = /multi/i.test(propertyType);
  const isCondo = /condo|co-op/i.test(propertyType);
  const isNewBuild = yearBuilt != null && yearBuilt >= 2020;
  const isRecentBuild = yearBuilt != null && yearBuilt >= 2015;
  const isVintage = yearBuilt != null && yearBuilt <= 1940;
  const layout =
    beds != null && baths != null ? `${beds}bd/${baths}ba` : beds != null ? `${beds}-bed` : null;
  const candidates: InsightCandidate[] = [];
  const seenPhrases = new Set<string>();

  // Each call passes alternating (family, phrase) pairs.
  const push = (...entries: (string | null | undefined)[]) => {
    for (let i = 0; i + 1 < entries.length; i += 2) {
      const family = entries[i];
      const phrase = entries[i + 1];
      if (family && phrase && !seenPhrases.has(phrase)) {
        seenPhrases.add(phrase);
        candidates.push({ phrase, family });
      }
    }
  };

  if (status === "Reduced") {
    push(
      "price-reduced-reset",
      street ? `Price reset on ${street} — seller re-engaging` : "Price reset — motivated seller signal",
      "price-reduced-ask",
      street ? `Reduced ask on ${street}` : "Fresh price cut — worth a second look",
      "price-reduced-traction",
      layout && street ? `${layout} on ${street} · newly priced` : "Re-priced for faster traction",
      "price-reduced-signal",
      layout && zip ? `${layout} · price just adjusted in ${zip}` : "Seller signal — fresh price adjustment",
    );
  }

  if (dom != null && dom <= 3) {
    push(
      "fresh-listed-timing",
      dom === 0 ? "Listed today — earliest look" : `Listed ${dom} day${dom === 1 ? "" : "s"} ago — still fresh`,
      "fresh-listed-street",
      street ? `New to market on ${street}` : "Just hit the market — fresh listing",
      "fresh-listed-zip",
      zip ? `Fresh ${zip} listing` : null,
      "fresh-listed-window",
      dom != null && dom <= 1 ? "First-look window — still early" : "Early days on market",
    );
  }

  if (isNewBuild && !isRental) {
    push(
      "new-build-year",
      yearBuilt && street ? `${yearBuilt} build on ${street}` : yearBuilt ? `${yearBuilt} new construction` : null,
      "new-build-layout",
      layout && yearBuilt ? `${layout} · ${yearBuilt} build` : null,
      "new-build-ready",
      street ? `Move-in ready new build on ${street}` : "New construction with modern finishes",
      "new-build-sqft",
      sqft ? `New build · ${formatCompactSqft(sqft)}` : null,
      "new-build-zip",
      yearBuilt && zip ? `${yearBuilt} delivery in ${zip}` : null,
      "new-build-modern",
      sqft && zip ? `Modern ${formatCompactSqft(sqft)} in ${zip}` : "Current-era build — minimal deferred maintenance",
    );
  }

  if (isNewBuild && isRental) {
    push(
      "rental-new-build",
      yearBuilt && street ? `${yearBuilt} rental on ${street}` : "Modern build · turn-key rental",
      "rental-designer",
      layout && street ? `${layout} lease on ${street}` : "Designer finishes · rental ready",
    );
  }

  if (isMulti && !isRental) {
    push(
      "multi-income",
      street ? `Income-producing units on ${street}` : "Multi-family with income-producing units",
      "multi-house-hack",
      layout && street ? `${layout} multi on ${street}` : "House-hack or investor-friendly layout",
      "multi-cashflow",
      zip ? `Multi-unit cash-flow play in ${zip}` : "Multi-unit with rental upside",
    );
  }

  if (sqft != null && sqft >= 4500) {
    push(
      "estate-scale",
      street ? `Estate-scale living on ${street}` : "Grand scale with exceptional living space",
      "estate-footprint",
      `${formatCompactSqft(sqft)}${layout ? ` · ${layout}` : ""}`,
      "estate-volume",
      street ? `${formatCompactSqft(sqft)} footprint on ${street}` : null,
      "estate-compound",
      "Private-compound proportions — room to spread out",
      "estate-rare-scale",
      zip ? `Rare ${formatCompactSqft(sqft)} for ${zip}` : "Rare scale for the neighborhood",
      "estate-expansive",
      layout ? `Expansive ${layout} · ${formatCompactSqft(sqft)}` : `Expansive ${formatCompactSqft(sqft)} layout`,
      "estate-wing",
      "Room for guest wing, office, or gym",
    );
  } else if (sqft != null && sqft >= 3500) {
    push(
      "oversized-layout",
      street ? `Oversized ${formatCompactSqft(sqft)} on ${street}` : "Oversized layout, rare for the street",
      "oversized-generous",
      layout && street ? `${layout} · generous ${formatCompactSqft(sqft)}` : null,
      "oversized-spread",
      zip ? `${formatCompactSqft(sqft)} with space to spread out · ${zip}` : "Above-average footprint for the area",
      "oversized-family",
      layout ? `Family-scale ${layout} · ${formatCompactSqft(sqft)}` : `Generous ${formatCompactSqft(sqft)} floor plan`,
    );
  } else if (sqft != null && sqft >= 2500) {
    push(
      "generous-layout",
      street ? `Room to spread out on ${street}` : "Generously proportioned throughout",
      "generous-sqft",
      `${formatCompactSqft(sqft)}${zip ? ` in ${zip}` : ""}`,
      "generous-flow",
      layout && street ? `${layout} with easy flow on ${street}` : "Open flow — more space than typical",
      "generous-comfort",
      zip ? `Comfortably sized for ${zip}` : "Comfortably sized for everyday living",
    );
  }

  if (isRecentBuild && !isNewBuild) {
    push(
      "recent-contemporary",
      yearBuilt && street ? `${yearBuilt} contemporary on ${street}` : "Contemporary design, recently updated",
      "recent-updates",
      yearBuilt && layout ? `${yearBuilt} ${layout} with modern updates` : null,
      "recent-turnkey",
      yearBuilt && zip ? `${yearBuilt} turn-key in ${zip}` : "Recent vintage with modern systems",
    );
  }

  if (beds != null && beds >= 5) {
    push(
      "five-bed-rare",
      street ? `Rare five-bed layout on ${street}` : "Rare five-bedroom layout",
      "five-bed-uncommon",
      layout && zip ? `${layout} · uncommon for ${zip}` : null,
      "five-bed-scale",
      sqft ? `Five-bedroom scale · ${formatCompactSqft(sqft)}` : "Five-bedroom scale — hard to find",
    );
  } else if (beds != null && beds >= 4) {
    push(
      "four-bed-family",
      street ? `Family-sized ${layout} on ${street}` : "Four-bedroom layout, ideal for families",
      "four-bed-sqft",
      layout && sqft ? `${layout} · ${formatCompactSqft(sqft)}` : null,
      "four-bed-flex",
      zip ? `${layout ?? "Four-bed"} with flex space · ${zip}` : "Four-bed with flex space",
    );
  }

  if (isCondo) {
    push(
      "condo-low-maint",
      street ? `Low-maintenance condo on ${street}` : "Low-maintenance living in prime location",
      "condo-lock-leave",
      zip ? `Lock-and-leave living in ${zip}` : null,
      "condo-amenity",
      layout ? `${layout} condo — minimal upkeep` : "Condo ease — minimal upkeep",
    );
  }

  if (isVintage) {
    push(
      "vintage-character",
      yearBuilt && street ? `${yearBuilt} character home on ${street}` : "Classic character with thoughtful updates",
      "vintage-detail",
      yearBuilt && layout ? `${yearBuilt} ${layout} with original detail` : null,
      "vintage-charm",
      yearBuilt && zip ? `${yearBuilt} charm in ${zip}` : "Period detail with livable updates",
    );
  }

  if (isRental && sqft != null && sqft >= 2200) {
    push(
      "rental-spacious",
      street ? `Spacious rental on ${street}` : "Exceptionally spacious for the neighborhood",
      "rental-lease-zip",
      layout && zip ? `${layout} lease · ${zip}` : null,
    );
  }

  if (isRental) {
    push(
      "rental-turnkey",
      street ? `Turn-key rental on ${street}` : "Turn-key rental in high-demand corridor",
      "rental-lease",
      zip ? `Lease opportunity in ${zip}` : null,
      "rental-demand",
      layout && zip ? `${layout} rental demand · ${zip}` : "Strong rental demand corridor",
    );
  }

  if (isCommercial) {
    push(
      "commercial-opportunity",
      street ? `Commercial opportunity on ${street}` : "Commercial footprint with operator upside",
      "commercial-ready",
      zip ? `Business-ready space in ${zip}` : null,
    );
  }

  if (dom != null && dom <= 14) {
    push(
      "demand-block",
      street ? `High-demand block — ${street}` : "High-demand street — rarely available",
      "demand-scarce",
      zip ? `Scarce inventory in ${zip}` : null,
      "demand-velocity",
      dom <= 7 ? "Fast-moving segment — limited supply" : "Active buyer interest in this pocket",
    );
  }

  if (score >= 85) {
    push(
      "top-scored",
      street ? `Top-scored pick on ${street}` : "Top-scored against the deal model",
      "top-scored-layout",
      layout && street ? `Strong ${layout} fit on ${street}` : null,
      "top-scored-signal",
      zip ? `Top-tier score signal · ${zip}` : "Top-tier score against peers",
    );
  }

  if (price >= 2_000_000) {
    push(
      "trophy-price",
      street ? `Trophy-tier ask on ${street}` : "Trophy-tier price point",
      "trophy-segment",
      zip ? `Trophy segment listing · ${zip}` : "Upper-tier market positioning",
    );
  } else if (price >= 1_000_000) {
    push(
      "premium-price",
      street ? `Premium ${zip ?? "town"} positioning on ${street}` : "Premium market positioning",
      "premium-band",
      layout && zip ? `${layout} in the premium ${zip} band` : "Premium price band for the area",
    );
  }

  push(
    "standout-inventory",
    street ? `Standout inventory on ${street}` : null,
    "standout-layout",
    layout && street ? `${layout} opportunity on ${street}` : null,
    "standout-zip-signal",
    zip && street ? `${street} · ${zip} value signal` : null,
    "standout-layout-zip",
    layout && zip ? `${layout} in ${zip}` : null,
    "standout-street",
    street ? `${street} — worth a closer look` : null,
    "standout-zip",
    zip ? `Notable ${zip} listing` : null,
    "standout-class",
    "Standout pick in its class",
  );

  return candidates;
}

function generateSecondaryInsightCandidates(input: InsightInput): InsightCandidate[] {
  const street = streetCue(input.address);
  const layout =
    input.beds != null && input.baths != null
      ? `${input.beds}bd/${input.baths}ba`
      : input.beds != null
        ? `${input.beds}-bed`
        : null;
  const sqftLabel = input.sqft != null ? formatCompactSqft(input.sqft) : null;

  const push = (family: string, phrase: string | null | undefined): InsightCandidate | null => {
    if (!phrase) return null;
    return { phrase, family: `secondary-${family}` };
  };

  return [
    push("address-zip", input.zip ? `${input.address} · ${input.zip}` : null),
    push("layout-price", layout && input.price ? `${layout} · $${input.price.toLocaleString()}` : null),
    push("sqft-dom", sqftLabel && input.dom != null ? `${sqftLabel} · ${input.dom}d on market` : null),
    push("score-street", street ? `Score ${input.score.toFixed(0)} pick · ${street}` : null),
    push("street-sqft", street && sqftLabel ? `${street} · ${sqftLabel}` : null),
    push("zip-score", input.zip ? `${input.zip} · score ${input.score.toFixed(0)}` : null),
    push("dom-street", street && input.dom != null ? `${input.dom}d on market · ${street}` : null),
    push(
      "price-sqft",
      sqftLabel && input.sqft
        ? `$${Math.round(input.price / input.sqft).toLocaleString()}/sqft effective · ${sqftLabel}`
        : null,
    ),
  ].filter((c): c is InsightCandidate => c != null);
}

function insightHeadline(value: string | InsightCandidate): string {
  return typeof value === "string" ? value : value.phrase;
}

function pickUniqueInsight(
  input: InsightInput,
  usedPhrases: Set<string> = new Set(),
  usedFamilies: Set<string> = new Set(),
): string {
  const street = streetCue(input.address);
  const candidates = generateInsightCandidates(input);

  const claim = (phrase: string, family: string): string => {
    usedPhrases.add(phrase);
    usedFamilies.add(family);
    return phrase;
  };

  for (const { phrase, family } of candidates) {
    if (!usedPhrases.has(phrase) && !usedFamilies.has(family)) {
      return claim(phrase, family);
    }
  }

  for (const { phrase, family } of candidates) {
    if (!usedPhrases.has(phrase)) {
      return claim(phrase, family);
    }
  }

  const augmentations = [
    street,
    input.zip,
    input.beds != null ? `${input.beds}-bed` : null,
    input.sqft != null ? formatCompactSqft(input.sqft) : null,
    input.yearBuilt != null ? `built ${input.yearBuilt}` : null,
    input.dom != null ? `${input.dom}d DOM` : null,
    `$${input.price.toLocaleString()}`,
  ].filter(Boolean) as string[];

  for (const { phrase, family } of candidates) {
    for (const tag of augmentations) {
      const variant = `${phrase} · ${tag}`;
      if (!usedPhrases.has(variant)) {
        return claim(variant, `${family}-tagged`);
      }
    }
  }

  for (const { phrase, family } of generateSecondaryInsightCandidates(input)) {
    if (!usedPhrases.has(phrase) && !usedFamilies.has(family)) {
      return claim(phrase, family);
    }
  }

  for (const { phrase, family } of generateSecondaryInsightCandidates(input)) {
    if (!usedPhrases.has(phrase)) {
      return claim(phrase, family);
    }
  }

  let fallback = street
    ? `${street} — ${input.address}`
    : input.zip
      ? `${input.address} · ${input.zip}`
      : input.address;
  let suffix = 2;
  while (usedPhrases.has(fallback)) {
    fallback = `${input.address} · insight ${suffix}`;
    suffix += 1;
  }
  return claim(fallback, "fallback-address");
}

function insightInputFromListing(l: DisplayListing): InsightInput {
  const bedMatch = l.type.match(/(\d+)bd/);
  const bathMatch = l.type.match(/(\d+)ba/);
  const propertyType = l.propertyType ?? l.type.split(" · ")[0] ?? l.type;
  return {
    address: l.address,
    propertyType,
    beds: bedMatch ? Number(bedMatch[1]) : l.beds ?? null,
    baths: bathMatch ? Number(bathMatch[1]) : l.baths ?? null,
    sqft: l.sqft,
    yearBuilt: l.yearBuilt ?? null,
    dom: l.dom,
    status: l.status,
    isRental: l.isRental,
    isCommercial: l.isCommercial,
    zip: l.zip,
    price: l.price,
    score: l.score,
  };
}

function dedupeListingHeadlines(listings: DisplayListing[]): DisplayListing[] {
  const usedPhrases = new Set<string>();
  const usedFamilies = new Set<string>();
  const ordered = [...listings].sort((a, b) => b.score - a.score);
  const headlines = new Map<string, string>();
  for (const listing of ordered) {
    headlines.set(
      listing.key,
      insightHeadline(
        pickUniqueInsight(insightInputFromListing(listing), usedPhrases, usedFamilies),
      ),
    );
  }
  return listings.map((listing) => ({
    ...listing,
    headline: insightHeadline(headlines.get(listing.key) ?? listing.headline),
  }));
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

async function fetchCity(city: TmreTown): Promise<DisplayListing[]> {
  const res = await fetch(`/api/listings?city=${city}&status=Active&limit=250`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = (await res.json()) as ApiResponse;
  return mapListings(body.listings, city);
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
  const showPriceFilter = cls !== "commercial" && tx !== "rental";
  const [minPriceIndex, setMinPriceIndex] = useState(0);
  const [maxPriceIndex, setMaxPriceIndex] = useState(INTEL_PRICE_MAX_INDEX);
  const [priceSliderActive, setPriceSliderActive] = useState(false);
  const [bedSliderActive, setBedSliderActive] = useState(false);
  const [bathSliderActive, setBathSliderActive] = useState(false);
  const [vintageSliderActive, setVintageSliderActive] = useState(false);
  const priceRangeCustomizedRef = useRef(false);
  const priceFilterContextRef = useRef("");
  const [newConstructionFilter, setNewConstructionFilter] =
    usePersistedFilter<NewConstructionFilter>(
      "tmre_intel_new_construction",
      "all",
      NEW_CONSTRUCTION_VALUES,
    );
  const newConstructionOnly = newConstructionFilter === "new";
  const [zip, setZip] = usePersistedNullableFilter("tmre_intel_zip");
  const [boardStatusFilter, setBoardStatusFilter] = useState<BoardStatusFilter>("all");
  const [hoveredZip, setHoveredZip] = useState<string | null>(null);
  const [hoveredZipEl, setHoveredZipEl] = useState<HTMLElement | null>(null);
  const [hoveredTown, setHoveredTown] = useState<TmreTown | null>(null);
  const [hoveredTownEl, setHoveredTownEl] = useState<HTMLElement | null>(null);
  const townHoverClearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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
  );
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

  const orderedCities = usePersonalizedTowns(TMRE_TOWNS);

  useEffect(() => {
    setExpandedSnapshotKeys(readExpandedSnapshotKeys());
    setExpandedSnapshotsHydrated(true);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setHeroIntroDismissed(true), 30_000);
    return () => window.clearTimeout(timer);
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
                for (const city of TMRE_TOWNS) {
                  try {
                    const listings = await fetchCity(city);
                    setByCity((prev) => ({ ...prev, [city]: listings }));
                  } catch (err) {
                    console.warn(`[intelligence] ${city} soft reload failed`, err);
                  }
                  await new Promise((resolve) => window.setTimeout(resolve, 200));
                }
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
  }, [sqliteRefresh.refreshing]);

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

  useEffect(() => {
    return () => {
      if (townHoverClearTimer.current) clearTimeout(townHoverClearTimer.current);
    };
  }, []);

  // Fetch monthly sales + closed-this-week counts for all cities
  useEffect(() => {
    const cities = [...TMRE_TOWNS];
    const kinds = salesByMonthKinds(tx);
    setMonthlySalesLoaded(false);

    Promise.all(
      cities.flatMap((city) =>
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
    ).then((results) => {
      const now = new Date();
      const sales: Record<string, number> = {};
      const closed: Record<string, number> = {};
      const closedByZip: Record<string, Record<string, number>> = {};

      for (const city of cities) {
        sales[city] = 0;
        closed[city] = 0;
        closedByZip[city] = {};
      }

      results.forEach(({ city, d }) => {
        if (!d?.data) return;
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
      });

      setMonthlySales(sales);
      setClosedThisWeekByTown(closed);
      setClosedThisWeekByTownZip(closedByZip);
      setMonthlySalesLoaded(true);
    });
  }, [tx]);

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    Promise.allSettled(TMRE_TOWNS.map((city) => fetchCity(city)))
      .then((results) => {
        if (cancelled) return;
        let anyLive = false;
        const next = Object.fromEntries(
          TMRE_TOWNS.map((town, i) => {
            const result = results[i];
            if (result.status === "fulfilled") {
              anyLive = true;
              return [town, result.value];
            }
            console.warn(`[intelligence] ${town} fetch failed`, result.reason);
            const mock = MOCK_FALLBACK.find((d) => d.city === town);
            return [town, mock?.listings ?? []];
          }),
        ) as Record<TmreTown, DisplayListing[]>;
        bumpIntelligenceSnapshotGeneration();
        setByCity(next);
        setState(anyLive ? "ready" : "fallback");
      });
    return () => {
      cancelled = true;
    };
  }, []);

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

  const { availableZips, zipMedianPrice } = useMemo(() => {
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

    const availableZips = Array.from(byZip.keys()).sort(
      (a, b) => (zipMedianPrice.get(b) ?? 0) - (zipMedianPrice.get(a) ?? 0),
    );

    return { availableZips, zipMedianPrice };
  }, [allListings, active]);

  useEffect(() => {
    if (active !== "All" && availableZips.length <= 1) setZip(null);
  }, [active, availableZips.length, setZip]);

  useEffect(() => {
    if (active !== "All" && availableZips.length > 1) {
      prefetchZipBoundaries(availableZips);
    }
  }, [active, availableZips]);

  useEffect(() => {
    if (tx === "rental" && saleProperty !== "all") setSaleProperty("all");
  }, [tx, saleProperty, setSaleProperty]);

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
        false,
        0,
        null,
        minVintage,
        maxVintage,
      ),
    [allListings, tx, cls, zip, boardStatusFilter, saleProperty, minBedrooms, maxBedrooms, minBathrooms, maxBathrooms, newConstructionOnly, minVintage, maxVintage],
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

  useEffect(() => {
    setMiddleTierExpanded(false);
    setBoardPage(1);
  }, [active, tx, cls, saleProperty, zip, boardStatusFilter, minBedrooms, maxBedrooms, minBathrooms, maxBathrooms, minVintage, maxVintage, newConstructionOnly, minPriceIndex, maxPriceIndex, sortKey, sortDir]);

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
        false,
        minPrice,
        maxPrice,
        minVintage,
        maxVintage,
      ),
    [allListings, tx, cls, zip, boardStatusFilter, saleProperty, minBedrooms, maxBedrooms, minBathrooms, maxBathrooms, newConstructionOnly, minPrice, maxPrice, minVintage, maxVintage],
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
    const deduped = dedupeListingHeadlines(boardListings);
    if (sortKey !== "score") {
      return { top: deduped, middle: [], bottom: [], canTier: false };
    }
    const tiers = splitBoardByScoreTier(deduped);
    return {
      ...tiers,
      top: sortListings(tiers.top, sortKey, sortDir),
      middle: sortListings(tiers.middle, sortKey, sortDir),
      bottom: sortListings(tiers.bottom, sortKey, sortDir),
    };
  }, [boardListings, sortKey, sortDir]);

  const filteredCount = listings.length;
  const resultCount = boardListings.length;
  const totalBoardPages = Math.max(1, Math.ceil(filteredCount / BOARD_LISTING_LIMIT));
  const boardPageStart =
    filteredCount === 0 ? 0 : (boardPage - 1) * BOARD_LISTING_LIMIT + 1;
  const boardPageEnd = Math.min(boardPage * BOARD_LISTING_LIMIT, filteredCount);
  const showBoardPagination = filteredCount > BOARD_LISTING_LIMIT;

  useEffect(() => {
    if (boardPage > totalBoardPages) setBoardPage(totalBoardPages);
  }, [boardPage, totalBoardPages]);
  const middleHidden =
    boardTiers.canTier && boardTiers.middle.length > 0 && !middleTierExpanded;
  const visibleCount = middleHidden
    ? boardTiers.top.length + boardTiers.bottom.length
    : resultCount;
  const poolCount = allListings.length;

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
        false,
        minPrice,
        maxPrice,
        minVintage,
        maxVintage,
      ).length;
      counts[town] = n;
      all += n;
    }
    return { ...counts, All: all };
  }, [byCity, state, tx, cls, boardStatusFilter, saleProperty, minBedrooms, maxBedrooms, minBathrooms, maxBathrooms, newConstructionOnly, minPrice, maxPrice, minVintage, maxVintage]);

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
      false,
      minPrice,
      maxPrice,
      minVintage,
      maxVintage,
    );
    const zipCounts = new Map<string, number>();
    filtered.forEach((l) => {
      if (!l.zip || !allowedZips.has(l.zip)) return;
      zipCounts.set(l.zip, (zipCounts.get(l.zip) ?? 0) + 1);
    });
    return { zipCounts, zipAllCount: filtered.length };
  }, [allListings, active, tx, cls, boardStatusFilter, saleProperty, minBedrooms, maxBedrooms, minBathrooms, maxBathrooms, newConstructionOnly, minPrice, maxPrice, minVintage, maxVintage]);

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
    newConstructionOnly ||
    zip != null ||
    boardStatusFilter !== "all" ||
    priceFilterActive;
  const showZipFilters = active !== "All" && availableZips.length > 1;

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
    priceFilterActive;

  function resetSliders() {
    setMinBedsFilter("0");
    setMaxBedsFilter("6");
    setMinBathsFilter("0");
    setMaxBathsFilter("6");
    setMinVintageFilter("0");
    setMaxVintageFilter("6");
    priceRangeCustomizedRef.current = false;
    setMinPriceIndex(0);
    setMaxPriceIndex(showPriceFilter ? boardPriceMaxIdx : INTEL_PRICE_MAX_INDEX);
  }

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
      false,
      minPrice,
      maxPrice,
      minVintage,
      maxVintage,
    ).length;
    return computeMonthsSupply(count, monthlySales[active]);
  }, [active, byCity, tx, cls, zip, boardStatusFilter, saleProperty, minBedrooms, maxBedrooms, minBathrooms, maxBathrooms, newConstructionOnly, minPrice, maxPrice, minVintage, maxVintage, monthlySales]);

  const showVintageStats = listings.length > 0;
  const vintageStatsTitle =
    active === "All" ? "All towns" : formatTownZipPlace(active, zip);
  const vintageListingRows = useMemo(
    () => toVintageListingRows(listings),
    [listings],
  );

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
      minPrice,
      maxPrice,
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
        false,
        minPrice,
        maxPrice,
        minVintage,
        maxVintage,
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
    minPrice,
    maxPrice,
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
    ],
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

  return (
    <>
      <section className="navy-gradient text-white pt-20 pb-1 lg:pt-24 lg:pb-1 relative overflow-hidden">
        <div className="absolute inset-0 hero-grid opacity-40" aria-hidden />
        <div className="relative mx-auto max-w-7xl px-6 lg:px-10">
          <div className="flex flex-col lg:flex-row lg:items-start lg:gap-x-5 gap-y-2">
            <div className="min-w-0 flex-1">
              <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold animate-fade-up">
                Market Intelligence
              </p>
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
                <div className="flex flex-col gap-1.5 items-start min-w-0 w-full">
                  <div className="flex flex-wrap items-center gap-2 self-start min-w-0">
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
                {cls !== "commercial" && (
                  <BedBathFilterRow
                    showPriceFilter={showPriceFilter}
                    priceSteps={boardPriceSteps}
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
                    onBedSliderActiveChange={setBedSliderActive}
                    onBathSliderActiveChange={setBathSliderActive}
                    minBedrooms={minBedrooms}
                    maxBedrooms={maxBedrooms}
                    onMinBedroomsChange={(n) => setMinBedsFilter(String(n) as MinBedFilter)}
                    onMaxBedroomsChange={(n) => setMaxBedsFilter(String(n) as MinBedFilter)}
                    minBathrooms={minBathrooms}
                    maxBathrooms={maxBathrooms}
                    onMinBathroomsChange={(n) => setMinBathsFilter(String(n) as MinBathFilter)}
                    onMaxBathroomsChange={(n) => setMaxBathsFilter(String(n) as MinBathFilter)}
                    minVintage={minVintage}
                    maxVintage={maxVintage}
                    onMinVintageChange={(n) =>
                      setMinVintageFilter(String(n) as VintageIndexFilter)
                    }
                    onMaxVintageChange={(n) =>
                      setMaxVintageFilter(String(n) as VintageIndexFilter)
                    }
                    onVintageSliderActiveChange={setVintageSliderActive}
                    onResetSliders={resetSliders}
                    slidersCustomized={slidersCustomized}
                  />
                )}
              </div>

              <TownFilterPills
                towns={orderedCities}
                selected={active}
                onSelect={(city) => {
                  setActive(city);
                  setZip(null);
                  setBoardStatusFilter("all");
                  if (city === "All") {
                    setExpandedSnapshotKeys(new Set());
                  }
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
                onTownMouseLeave={() => {
                  if (townHoverClearTimer.current) clearTimeout(townHoverClearTimer.current);
                  townHoverClearTimer.current = setTimeout(() => {
                    setHoveredTown(null);
                    setHoveredTownEl(null);
                    townHoverClearTimer.current = null;
                  }, 120);
                }}
                counts={townCounts}
                allLabel="All"
                showSeparatorAfterAll
                size="compact"
                scrollable
                className="w-full min-w-0"
              />

              {showZipFilters && (() => {
                const prices = availableZips.map((z) => zipMedianPrice.get(z) ?? 0);
                const maxP = Math.max(...prices);
                const minP = Math.min(...prices);
                const range = maxP - minP || 1;
                return (
                  <div className="flex flex-wrap gap-1 self-start w-full min-w-0">
                    <button
                      type="button"
                      onClick={() => setZip(null)}
                      aria-pressed={zip === null}
                      className={`font-mono text-[10px] tracking-[0.15em] uppercase px-3 py-1.5 rounded-full border transition-all ${
                        zip === null
                          ? "bg-white text-navy border-white shadow-md"
                          : "border-white/20 text-white/55 hover:border-white/50 hover:text-white"
                      }`}
                    >
                      All
                      <span
                        className={`ml-1 tabular-nums text-[9px] ${
                          zip === null ? "text-navy/55" : "text-white/40"
                        }`}
                        aria-label={`${zipAllCount.toLocaleString()} listings`}
                      >
                        {zipAllCount.toLocaleString()}
                      </span>
                    </button>
                    {availableZips.map((z) => {
                      const price = zipMedianPrice.get(z) ?? minP;
                      const count = zipCounts.get(z) ?? 0;
                      const areaName = zipAreaNickname(z);
                      const t = (price - minP) / range;
                      const isActive = zip === z;
                      const r = Math.round(186 - t * 149);
                      const g = Math.round(230 - t * 131);
                      const b = Math.round(253 - t * 18);
                      const alpha = 0.22 + t * 0.60;
                      const borderAlpha = 0.35 + t * 0.50;
                      const inactiveStyle = {
                        backgroundColor: `rgba(${r},${g},${b},${alpha.toFixed(2)})`,
                        borderColor: `rgba(${r},${g},${b},${borderAlpha.toFixed(2)})`,
                        color: "rgba(255,255,255,0.92)",
                      };
                      return (
                        <button
                          key={z}
                          type="button"
                          onClick={() => setZip(zip === z ? null : z)}
                          onMouseEnter={(e) => {
                            setHoveredTown(null);
                            setHoveredTownEl(null);
                            setHoveredZip(z);
                            setHoveredZipEl(e.currentTarget);
                          }}
                          onMouseLeave={() => { setHoveredZip(null); setHoveredZipEl(null); }}
                          aria-pressed={isActive}
                          style={isActive ? undefined : inactiveStyle}
                          className={`font-mono text-[10px] tracking-[0.15em] uppercase px-3 py-1.5 rounded-full border transition-all ${
                            isActive
                              ? "bg-gold text-navy border-gold shadow-md shadow-gold/20"
                              : "hover:brightness-110"
                          }`}
                        >
                          {z}
                          {areaName ? (
                            <span
                              className={`ml-1 normal-case tracking-normal ${
                                isActive ? "text-navy/70" : "text-white/75"
                              }`}
                            >
                              · {areaName}
                            </span>
                          ) : null}
                          <span
                            className={`ml-1 tabular-nums text-[9px] ${
                              isActive ? "text-navy/55" : "text-white/40"
                            }`}
                            aria-label={`${count.toLocaleString()} listings`}
                          >
                            {count.toLocaleString()}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                );
              })()}

                  <div className="flex flex-wrap items-center gap-2 min-w-0 self-start">
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
                    {tx === "sale" && (
                      <>
                        <div className={`hidden sm:block ${filterPillSeparatorClass("compact")}`} aria-hidden />
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
                    )}
                    <div className={`hidden sm:block ${filterPillSeparatorClass("compact")}`} aria-hidden />
                    <FilterGroup
                      label=""
                      value={newConstructionFilter}
                      onChange={setNewConstructionFilter}
                      options={[
                        { value: "all", label: "Any age" },
                        { value: "new", label: "New construction" },
                      ]}
                    />
                  </div>
                </div>
              </div>
              {active === "All" ? (
                <AllTownsDescriptor
                  towns={allTownsDescriptorStats}
                  aggregateMonthsSupply={aggregateAllTownsMonthsSupply}
                  monthlySalesLoaded={monthlySalesLoaded}
                  filterContext={allTownsFilterContext}
                  priceLabel={
                    showPriceFilter ? (
                      <PriceRangeLabel
                        steps={boardPriceSteps}
                        minIndex={minPriceIndex}
                        maxIndex={maxPriceIndex}
                        active={priceSliderActive}
                      />
                    ) : null
                  }
                  bedLabel={
                    cls !== "commercial" ? (
                      <BedroomLabel
                        min={minBedrooms}
                        max={maxBedrooms}
                        active={bedSliderActive}
                      />
                    ) : null
                  }
                  bathLabel={
                    cls !== "commercial" ? (
                      <BathroomLabel
                        min={minBathrooms}
                        max={maxBathrooms}
                        active={bathSliderActive}
                      />
                    ) : null
                  }
                  vintageLabel={
                    cls !== "commercial" ? (
                      <VintageLabel
                        min={minVintage}
                        max={maxVintage}
                        active={vintageSliderActive}
                      />
                    ) : null
                  }
                />
              ) : (
                <p className="mt-3 flex flex-wrap items-baseline gap-x-2 font-mono text-xs tracking-wide">
                  <span className="text-white/45">{formatTownTagline(active, zip)}</span>
                  <span className="text-white/25" aria-hidden>
                    ·
                  </span>
                  <span
                    className={monthsSupplyColorClass(activeTownMonthsSupply)}
                    aria-label={
                      !monthlySalesLoaded
                        ? "Months supply loading"
                        : activeTownMonthsSupply != null
                          ? `${activeTownMonthsSupply.toFixed(1)} months supply`
                          : "Months supply unavailable"
                    }
                  >
                    Months supply{" "}
                    <span className="tabular-nums font-medium">
                      {!monthlySalesLoaded
                        ? "…"
                        : activeTownMonthsSupply != null
                          ? activeTownMonthsSupply.toFixed(1)
                          : "—"}
                    </span>
                  </span>
                  {showPriceFilter && (
                    <>
                      <span className="text-white/25" aria-hidden>
                        ·
                      </span>
                      <PriceRangeLabel
                        steps={boardPriceSteps}
                        minIndex={minPriceIndex}
                        maxIndex={maxPriceIndex}
                        active={priceSliderActive}
                      />
                    </>
                  )}
                  {cls !== "commercial" && (
                    <>
                      <span className="text-white/25" aria-hidden>
                        ·
                      </span>
                      <BedroomLabel
                        min={minBedrooms}
                        max={maxBedrooms}
                        active={bedSliderActive}
                      />
                    </>
                  )}
                  {cls !== "commercial" && (
                    <>
                      <span className="text-white/25" aria-hidden>
                        ·
                      </span>
                      <BathroomLabel
                        min={minBathrooms}
                        max={maxBathrooms}
                        active={bathSliderActive}
                      />
                    </>
                  )}
                  {cls !== "commercial" && (
                    <>
                      <span className="text-white/25" aria-hidden>
                        ·
                      </span>
                      <VintageLabel
                        min={minVintage}
                        max={maxVintage}
                        active={vintageSliderActive}
                      />
                    </>
                  )}
                </p>
              )}
            </div>
            <DealOfTheDayFrame
              city={active}
              theme="hero"
              rotateTowns={active === "All"}
              transactionFilter={tx}
              className="w-full lg:w-[17rem] lg:max-w-[17rem] shrink-0 animate-fade-up"
            />
          </div>
        </div>
      </section>

      <section className="bg-cream pt-4 pb-10 lg:pt-5 lg:pb-14">
        <div className="mx-auto max-w-7xl xl:max-w-[90rem] px-6 lg:px-10">
          <div className="mb-4 lg:mb-5 flex items-end justify-between gap-4">
            <div className="flex flex-wrap items-end gap-x-4 gap-y-1.5 min-w-0">
              <h2 className="font-serif text-2xl sm:text-3xl lg:text-[2rem] text-navy leading-tight">
                Your {filteredCount.toLocaleString()}{" "}
                {filteredCount === 1 ? "listing" : "listings"},{" "}
                <span className="italic">scored.</span>
              </h2>
              <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold pb-0.5">
                Intelligent Deals
              </p>
            </div>
            <div className="flex items-center gap-2 font-mono text-xs shrink-0">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  state === "ready" && sqliteRefresh.refreshing
                    ? "bg-gold animate-pulse-dot"
                    : state === "ready"
                    ? "bg-sage animate-pulse-dot"
                    : state === "fallback"
                    ? "bg-coral"
                    : "bg-gold animate-pulse-dot"
                }`}
              />
              <span className="text-slate">
                {state === "ready"
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
                  : "Loading…"}
              </span>
            </div>
          </div>

          <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_248px] lg:gap-5 lg:items-start">

            {/* Deal board */}
            <div ref={boardRef} id="deal-board" className="min-w-0 scroll-mt-24">
          <DealBoardList
            topRows={boardTiers.top}
            middleRows={boardTiers.middle}
            bottomRows={boardTiers.bottom}
            canTier={boardTiers.canTier}
            middleTierExpanded={middleTierExpanded}
            onMiddleTierToggle={() => setMiddleTierExpanded((v) => !v)}
            resultCount={resultCount}
            scoreRankByKey={scoreRankByKey}
            rankTotal={filteredCount}
            isLive={state === "ready"}
            showTown={active === "All"}
            loading={state === "loading" && liveListings === null}
            loadingLabel={`Loading ${active}…`}
            emptyLabel={`No ${active === "All" ? "" : `${active} `}${
              boardStatusFilter === "new"
                ? "new "
                : boardStatusFilter === "reduced"
                  ? "reduced "
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
            scoreInfoButton={
              <ScoreInfoButton onInfoClick={() => setScoreInfoOpen(true)} />
            }
            resultsSummary={
              <p className="font-mono text-[10px] tracking-[0.12em] uppercase text-slate">
                {state === "loading" && liveListings === null ? (
                  "Loading results…"
                ) : resultCount === 0 ? (
                  "No results match your filters"
                ) : (
                  <>
                    Showing{" "}
                    <span className="text-navy font-medium tabular-nums">
                      {visibleCount.toLocaleString()}
                    </span>
                    {middleHidden ? (
                      <>
                        {" "}
                        of{" "}
                        <span className="text-navy font-medium tabular-nums">
                          {resultCount.toLocaleString()}
                        </span>
                      </>
                    ) : null}{" "}
                    {visibleCount === 1 ? "listing" : "listings"}
                    {middleHidden ? (
                      <span className="text-slate/55 normal-case tracking-normal">
                        {" "}
                        · middle tier collapsed (
                        {boardTiers.middle.length.toLocaleString()} hidden)
                      </span>
                    ) : filtersActive && poolCount > filteredCount ? (
                      <span className="text-slate/55 normal-case tracking-normal">
                        {" "}
                        (of {poolCount.toLocaleString()} in{" "}
                        {active === "All" ? "selected towns" : active})
                      </span>
                    ) : showBoardPagination ? (
                      <span className="text-slate/55 normal-case tracking-normal">
                        {" "}
                        · page {boardPage} of {totalBoardPages} (
                        {boardPageStart.toLocaleString()}–
                        {boardPageEnd.toLocaleString()} of{" "}
                        {filteredCount.toLocaleString()})
                      </span>
                    ) : null}
                  </>
                )}
              </p>
            }
            footer={
              <div className="border-t border-charcoal/[0.12] bg-cream/60 px-5 py-3 font-mono text-[10px] tracking-[0.12em] uppercase text-slate">
                {visibleCount.toLocaleString()} of {resultCount.toLocaleString()}{" "}
                {resultCount === 1 ? "listing" : "listings"} in this view
                {middleHidden
                  ? ` · ${boardTiers.middle.length} in middle tier hidden`
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
              className={`mt-8 lg:mt-0 lg:shrink-0 ${
                anySnapshotExpanded ? "space-y-4" : "space-y-2"
              }`}
            >
              {liveSnapshots.length > 0 && (
                <div className="pb-1 shrink-0">
                  <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
                    Stats
                  </p>
                </div>
              )}
              <div id="intel-stats-panel" className={anySnapshotExpanded ? "space-y-4" : "space-y-2"}>
                {liveSnapshots.map((snap) => {
                  const panelKey = snapshotPanelKey(snap);
                  const collapsible = active === "All";
                  const expanded =
                    !collapsible || expandedSnapshotKeys.has(panelKey);
                  return (
                    <TownSnapshotPanel
                      key={panelKey}
                      snapshot={snap}
                      tx={tx}
                      expanded={expanded}
                      collapsible={collapsible}
                      onToggleExpanded={() => toggleSnapshotExpanded(panelKey)}
                      onListingsClick={(town, zipFilter) =>
                        selectTownListings(town, "all", zipFilter)
                      }
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
                      onMedianHref={(snap) =>
                        snap.metrics.some((m) => m.label === "Median price" && m.linkMedian)
                          ? statsMedianListingsHref({
                              city: snap.town,
                              kind: tx === "rental" ? "rental" : "sale",
                              pool: "active",
                              zip: snap.zip,
                              tx,
                              cls,
                              saleProperty,
                            })
                          : null
                      }
                    />
                  );
                })}
                {showVintageStats ? (
                  <IntelligenceVintageStats
                    title={vintageStatsTitle}
                    listings={vintageListingRows}
                    tx={tx}
                    collapsible
                    expandedKeys={expandedSnapshotKeys}
                    onToggleExpanded={toggleSnapshotExpanded}
                    onVintageListingsClick={selectVintageListings}
                  />
                ) : null}
              </div>
            </aside>
          </div>{/* end grid */}
        </div>
      </section>
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
      {scoreInfoOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center px-4"
          role="dialog"
          aria-modal="true"
          aria-label="Score methodology"
        >
          <div
            className="absolute inset-0 bg-navy/70 backdrop-blur-sm"
            onClick={() => setScoreInfoOpen(false)}
          />
          <div className="relative bg-white rounded-3xl shadow-2xl shadow-navy/20 max-w-md w-full p-8">
            <div className="flex items-start justify-between mb-6">
              <div>
                <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-gold mb-1">
                  Methodology
                </p>
                <h2 className="font-serif text-2xl text-navy">How scores work</h2>
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
        </div>
      )}
      {hoveredTown && (
        <ZipBoundaryPopover
          highlightTown={hoveredTown}
          anchorEl={hoveredTownEl}
        />
      )}
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
  const [tipPos, setTipPos] = useState<{ x: number; y: number } | null>(null);
  const ref = useRef<HTMLSpanElement>(null);

  function showTip() {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setTipPos({ x: r.left + r.width / 2, y: r.top + window.scrollY });
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
            left: tipPos.x,
            top: tipPos.y - 8,
            transform: "translate(-50%, -100%)",
          }}
        >
          A 0–100 Goldilocks composite — age, condition, finishes, PPSF fit, layout, and schools — ranked against peers in each town.
          <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-navy" />
        </div>,
        document.body,
      )}
    </span>
  );
}

function BedBathFilterRow({
  showPriceFilter,
  priceSteps,
  minPriceIndex,
  maxPriceIndex,
  onMinPriceIndexChange,
  onMaxPriceIndexChange,
  onPriceSliderActiveChange,
  onBedSliderActiveChange,
  onBathSliderActiveChange,
  onVintageSliderActiveChange,
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
  onResetSliders,
  slidersCustomized,
}: {
  showPriceFilter: boolean;
  priceSteps: readonly number[];
  minPriceIndex: number;
  maxPriceIndex: number;
  onMinPriceIndexChange: (value: number) => void;
  onMaxPriceIndexChange: (value: number) => void;
  onPriceSliderActiveChange: (active: boolean) => void;
  onBedSliderActiveChange: (active: boolean) => void;
  onBathSliderActiveChange: (active: boolean) => void;
  onVintageSliderActiveChange: (active: boolean) => void;
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
  onResetSliders: () => void;
  slidersCustomized: boolean;
}) {
  return (
    <div className="flex items-center gap-2 shrink-0">
      {showPriceFilter ? (
        <>
          <div className={`hidden sm:block ${filterPillSeparatorClass("compact")}`} aria-hidden />
          <PriceRangeSlider
            steps={priceSteps}
            minIndex={minPriceIndex}
            maxIndex={maxPriceIndex}
            onMinIndexChange={onMinPriceIndexChange}
            onMaxIndexChange={onMaxPriceIndexChange}
            onActiveChange={onPriceSliderActiveChange}
          />
        </>
      ) : null}
      <div className={`hidden sm:block ${filterPillSeparatorClass("compact")}`} aria-hidden />
      <IntelDualSlider
        maxIndex={BED_BATH_MAX}
        minValue={minBedrooms}
        maxValue={maxBedrooms}
        onMinChange={onMinBedroomsChange}
        onMaxChange={onMaxBedroomsChange}
        onActiveChange={onBedSliderActiveChange}
        minAriaLabel="Minimum bedrooms"
        maxAriaLabel="Maximum bedrooms"
      />
      <div className={`hidden sm:block ${filterPillSeparatorClass("compact")}`} aria-hidden />
      <IntelDualSlider
        maxIndex={BED_BATH_MAX}
        minValue={minBathrooms}
        maxValue={maxBathrooms}
        onMinChange={onMinBathroomsChange}
        onMaxChange={onMaxBathroomsChange}
        onActiveChange={onBathSliderActiveChange}
        minAriaLabel="Minimum bathrooms"
        maxAriaLabel="Maximum bathrooms"
      />
      <div className={`hidden sm:block ${filterPillSeparatorClass("compact")}`} aria-hidden />
      <IntelDualSlider
        maxIndex={VINTAGE_FILTER_MAX}
        minValue={minVintage}
        maxValue={maxVintage}
        onMinChange={onMinVintageChange}
        onMaxChange={onMaxVintageChange}
        onActiveChange={onVintageSliderActiveChange}
        minAriaLabel="Minimum vintage era"
        maxAriaLabel="Maximum vintage era"
      />
      <div className={`hidden sm:block ${filterPillSeparatorClass("compact")}`} aria-hidden />
      <button
        type="button"
        onClick={onResetSliders}
        disabled={!slidersCustomized}
        className="font-mono text-[9px] tracking-[0.12em] uppercase text-white/50 hover:text-gold underline underline-offset-2 decoration-white/20 hover:decoration-gold/50 transition-colors shrink-0 whitespace-nowrap disabled:opacity-35 disabled:pointer-events-none disabled:no-underline"
      >
        Reset sliders
      </button>
    </div>
  );
}

function PriceRangeLabel({
  steps,
  minIndex,
  maxIndex,
  active,
}: {
  steps: readonly number[];
  minIndex: number;
  maxIndex: number;
  active: boolean;
}) {
  const lo = Math.min(minIndex, maxIndex);
  const hi = Math.max(minIndex, maxIndex);

  return (
    <span
      className={`font-mono tabular-nums text-gold leading-none origin-left transition-all duration-300 ease-out shrink-0 ${
        active ? "text-lg font-medium scale-110" : "text-[9px] scale-100"
      }`}
    >
      {formatIntelPriceRangeLabelFromSteps(steps, lo, hi)}
    </span>
  );
}

function BedroomLabel({
  min,
  max,
  active,
}: {
  min: number;
  max: number;
  active: boolean;
}) {
  return (
    <span
      className={`font-mono tabular-nums text-gold leading-none origin-left transition-all duration-300 ease-out shrink-0 ${
        active ? "text-lg font-medium scale-110" : "text-[9px] scale-100"
      }`}
    >
      {formatBedBathRangeLabel(min, max, "Bed")}
    </span>
  );
}

function BathroomLabel({
  min,
  max,
  active,
}: {
  min: number;
  max: number;
  active: boolean;
}) {
  return (
    <span
      className={`font-mono tabular-nums text-gold leading-none origin-left transition-all duration-300 ease-out shrink-0 ${
        active ? "text-lg font-medium scale-110" : "text-[9px] scale-100"
      }`}
    >
      {formatBedBathRangeLabel(min, max, "Bath")}
    </span>
  );
}

function VintageLabel({
  min,
  max,
  active,
}: {
  min: number;
  max: number;
  active: boolean;
}) {
  return (
    <span
      className={`font-mono tabular-nums text-gold leading-none origin-left transition-all duration-300 ease-out shrink-0 ${
        active ? "text-lg font-medium scale-110" : "text-[9px] scale-100"
      }`}
    >
      {formatVintageRangeLabel(min, max)}
    </span>
  );
}

function IntelDualSlider({
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

  return (
    <div className="flex items-center shrink-0">
      <div className={`relative h-4 ${widthClass} shrink-0`}>
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
          className="intel-price-range absolute inset-0 z-20 h-4 w-full cursor-pointer appearance-none bg-transparent accent-[#C8A951] disabled:opacity-40"
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
          className="intel-price-range absolute inset-0 z-30 h-4 w-full cursor-pointer appearance-none bg-transparent accent-[#C8A951] disabled:opacity-40"
          aria-label={maxAriaLabel}
          aria-valuemin={0}
          aria-valuemax={maxIndex}
          aria-valuenow={hi}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute left-0 right-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-white/15"
        />
      </div>
    </div>
  );
}

function PriceRangeSlider({
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

  return (
    <div className="flex items-center shrink-0">
      <div className={`relative h-4 ${INTEL_SLIDER_WIDTH_CLASS} shrink-0`}>
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
          className="intel-price-range absolute inset-0 z-20 h-4 w-full cursor-pointer appearance-none bg-transparent accent-[#C8A951] disabled:opacity-40"
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
          className="intel-price-range absolute inset-0 z-30 h-4 w-full cursor-pointer appearance-none bg-transparent accent-[#C8A951] disabled:opacity-40"
          aria-label="Maximum price"
          aria-valuemin={0}
          aria-valuemax={maxStepIndex}
          aria-valuenow={hi}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute left-0 right-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-white/15"
        />
      </div>
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
            className={filterPillButtonClass(value === opt.value, "compact")}
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
        <span className={summary.monthsSupplyClass}>{summary.monthsSupply}</span>
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
        const valueColor = snapshotValueColorClass(m.valueSignal);
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
              <p className={`font-mono text-sm tabular-nums leading-tight ${valueColor}`}>
                {m.value}
              </p>
            )}
            {m.action && onSnapshotAction ? (
              <Link
                href={onSnapshotAction(snapshot.town, m.action!, snapshot.zip)}
                className={`font-mono text-[9px] leading-tight mt-0.5 underline underline-offset-2 transition-colors hover:opacity-80 ${valueColor}`}
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
              <p className={`font-mono text-[9px] leading-tight mt-0.5 ${valueColor}`}>
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
