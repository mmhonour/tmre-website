"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ZipBoundaryPopover, { prefetchTownBoundaries, prefetchZipBoundaries } from "./ZipBoundaryPopover";
import { usePersonalizedTowns } from "@/hooks/usePersonalizedTowns";
import DealOfTheDayFrame from "./DealOfTheDayFrame";
import ListingScoreBreakdownModal from "./ListingScoreBreakdownModal";
import TownFilterPills from "./TownFilterPills";
import {
  filterPillButtonClass,
  filterPillContainerClass,
  filterPillSeparatorClass,
} from "@/lib/filter-pill-styles";
import { formatTownList, formatTownZipPlace, formatTownZipTagline, normalizeTownName, TMRE_TOWNS, listingZipMatchesTown, zipAreaNickname, type TmreTown, zipsForTown } from "@/lib/tmre-towns";
import { listingDetailHrefForListing } from "@/lib/listing-url";
import { intelligenceListingsHref } from "@/lib/intelligence-url";
import { matchesNewConstruction } from "@/lib/new-construction";
import { statsMedianListingsHref } from "@/lib/stats-url";
import type { ScoreBreakdown } from "@/lib/goldilocks-score-info";
import type { TownCountMap } from "@/lib/town-listing-counts";
import {
  usePersistedFilter,
  usePersistedNullableFilter,
} from "@/hooks/usePersistedFilter";

type TxFilter = "all" | "sale" | "rental";
type ClsFilter = "all" | "residential" | "commercial";
type SalePropertyFilter = "all" | "homes" | "multi" | "condos";
type BoardStatusFilter = "all" | "new" | "reduced";

const TX_VALUES = ["all", "sale", "rental"] as const;
const CLS_VALUES = ["all", "residential", "commercial"] as const;
const MIN_BED_VALUES = ["0", "1", "2", "3", "4", "5", "6"] as const;
const SALE_PROPERTY_VALUES = ["all", "homes", "multi", "condos"] as const;
const NEW_CONSTRUCTION_VALUES = ["all", "new"] as const;
type MinBedFilter = (typeof MIN_BED_VALUES)[number];
type NewConstructionFilter = (typeof NEW_CONSTRUCTION_VALUES)[number];
const INTEL_CITIES = ["All", ...TMRE_TOWNS] as const;
type IntelCity = (typeof INTEL_CITIES)[number];

/** Market positioning copy — separate from offline mock data. */
const TOWN_TAGLINES: Record<TmreTown, string> = {
  Norwalk: "Premium-velocity market",
  "New Canaan": "Premier Fairfield County address",
  Westport: "Trophy-tier inventory",
  Wilton: "Upscale residential enclave",
  Weston: "Quiet luxury enclave",
  Fairfield: "Balanced Fairfield County market",
  Ridgefield: "Historic charm, upscale inventory",
};

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

type SortKey = "score" | "address" | "town" | "price" | "ppsf" | "sqft" | "dom" | "status";
type SortDir = "asc" | "desc";

const STATUS_SORT_ORDER: Record<RowStatus, number> = {
  New: 0,
  Reduced: 1,
  Active: 2,
  Pending: 3,
};

function compareNullable(a: number | null, b: number | null, dir: SortDir): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return dir === "asc" ? a - b : b - a;
}

function formatBoardAddress(l: DisplayListing, allTowns: boolean): string {
  if (!allTowns) return l.address;
  return l.zip ? `${l.address}, ${l.zip}` : l.address;
}

function sortListings(
  rows: DisplayListing[],
  sortKey: SortKey,
  sortDir: SortDir,
  includeTownAndZipInAddress = false,
): DisplayListing[] {
  const sorted = [...rows];
  sorted.sort((a, b) => {
    let cmp = 0;
    switch (sortKey) {
      case "score":
        cmp = a.score - b.score;
        break;
      case "address":
        cmp = formatBoardAddress(a, includeTownAndZipInAddress).localeCompare(
          formatBoardAddress(b, includeTownAndZipInAddress),
          undefined,
          { sensitivity: "base" },
        );
        break;
      case "town": {
        const townName = (l: DisplayListing) =>
          (l.city ? normalizeTownName(l.city) : "") ?? "";
        cmp = townName(a).localeCompare(townName(b), undefined, { sensitivity: "base" });
        break;
      }
      case "price":
        cmp = a.price - b.price;
        break;
      case "ppsf":
        return compareNullable(a.pricePerSqft, b.pricePerSqft, sortDir);
      case "sqft":
        return compareNullable(a.sqft, b.sqft, sortDir);
      case "dom":
        return compareNullable(a.dom, b.dom, sortDir);
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

const RANK_COLOR_SAGE = { r: 74, g: 124, b: 111 };
const RANK_COLOR_NEUTRAL = { r: 220, g: 220, b: 216 };
const RANK_COLOR_CORAL = { r: 200, g: 90, b: 58 };

function lerpChannel(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

function rgbString(rgb: { r: number; g: number; b: number }): string {
  return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
}

function lerpRgb(
  from: { r: number; g: number; b: number },
  to: { r: number; g: number; b: number },
  t: number,
): string {
  return rgbString({
    r: lerpChannel(from.r, to.r, t),
    g: lerpChannel(from.g, to.g, t),
    b: lerpChannel(from.b, to.b, t),
  });
}

/** Green at top rank → neutral by 20th percentile; neutral until 80th; → red at bottom. */
function boardRankColor(scoreRank: number, total: number): string {
  if (total <= 1) return rgbString(RANK_COLOR_SAGE);
  const percentile = scoreRank / (total - 1);

  if (percentile <= 0.2) {
    return lerpRgb(RANK_COLOR_SAGE, RANK_COLOR_NEUTRAL, percentile / 0.2);
  }
  if (percentile >= 0.8) {
    return lerpRgb(RANK_COLOR_NEUTRAL, RANK_COLOR_CORAL, (percentile - 0.8) / 0.2);
  }
  return rgbString(RANK_COLOR_NEUTRAL);
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
  dom: number | null;
  status: RowStatus;
  isRental: boolean;
  isCommercial: boolean;
  propertyType?: string;
  yearBuilt?: number | null;
  beds?: number | null;
  headline: string;
  zip: string | null;
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
  action?: "new" | "reduced";
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
};

function snapshotBenchmarks(rows: DisplayListing[]): SnapshotBenchmarks {
  const prices = rows.map((l) => l.price).filter((p): p is number => p > 0);
  const ppsfs = rows
    .filter((l) => !l.isRental)
    .map((l) => l.pricePerSqft)
    .filter((p): p is number => p != null && p > 0);
  return {
    medianPrice: median(prices),
    avgPpsf: average(ppsfs),
  };
}

function isNewThisWeek(l: DisplayListing): boolean {
  return l.dom != null && l.dom <= 7;
}

type TownSnapshot = {
  town: string;
  zip?: string | null;
  metrics: SnapshotMetric[];
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
  newConstructionOnly = false,
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
    if (minBeds > 0 && (l.beds == null || l.beds < minBeds)) return false;
    if (newConstructionOnly && !matchesNewConstruction(l.yearBuilt, l.propertyType)) return false;
    if (zip && l.zip !== zip) return false;
    if (statusFilter === "new" && !isNewThisWeek(l)) return false;
    if (statusFilter === "reduced" && l.status !== "Reduced") return false;
    return true;
  });
}

function buildTownSnapshot(
  townListings: DisplayListing[],
  town: string,
  monthlySales: Record<string, number>,
  zip?: string | null,
  benchmarks: SnapshotBenchmarks = { medianPrice: null, avgPpsf: null },
): TownSnapshot {
  const prices = townListings.map((l) => l.price).filter((p): p is number => p > 0);
  const doms = townListings.map((l) => l.dom).filter((d): d is number => d != null && d >= 0);
  const ppsfs = townListings
    .filter((l) => !l.isRental)
    .map((l) => l.pricePerSqft)
    .filter((p): p is number => p != null && p > 0);
  const bedCounts = townListings
    .filter((l) => !l.isCommercial && l.beds != null && l.beds > 0)
    .map((l) => l.beds as number);
  const newListings = townListings.filter(isNewThisWeek).length;
  const reduced = townListings.filter((l) => l.status === "Reduced").length;

  const medPrice = median(prices);
  const medDom = median(doms);
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
      label: "Median price",
      value: formatSnapshotPrice(medPrice),
      trend: medPrice ? `${formatSnapshotPrice(medPrice)} median` : "—",
      tone: "flat",
      valueSignal: priceSignal,
      linkMedian: medPrice != null && townListings.length > 0,
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

  return { town, zip: zip ?? null, metrics };
}

function snapshotHeading(snapshot: TownSnapshot): string {
  return formatTownZipPlace(snapshot.town, snapshot.zip);
}

function snapshotCardTitle(snapshot: TownSnapshot, tx: TxFilter): string {
  const place = snapshotHeading(snapshot);
  if (tx === "rental") return `${place} Rental Snapshot`;
  if (tx === "sale") return `${place} Sale Snapshot`;
  return `${place} Snapshot`;
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
  calculated: {
    pricePerSqft: number | null;
    daysOnMarket: number | null;
    priceReductionPercent: number | null;
    goldilocksScore: number | null;
    goldilocksBreakdown: ScoreBreakdown | null;
  };
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
    beds: bedMatch ? Number(bedMatch[1]) : null,
    baths: bathMatch ? Number(bathMatch[1]) : null,
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
        type: [shortType(l.propertyType), l.beds && l.baths ? `${l.beds}bd/${l.baths}ba` : null]
          .filter(Boolean)
          .join(" · "),
        price: l.price!,
        pricePerSqft: rental ? null : l.calculated.pricePerSqft,
        sqft: l.sqft,
        dom: l.calculated.daysOnMarket,
        status,
        isRental: rental,
        isCommercial: commercial,
        propertyType: l.propertyType,
        yearBuilt: l.yearBuilt,
        beds: l.beds,
        headline: "",
        zip: l.address.postalCode ?? null,
      };
    })
    .sort((a, b) => b.score - a.score);

  if (!townName) return mapped;
  return mapped.filter((l) => listingZipMatchesTown(l.zip, townName));
}

async function fetchCity(city: TmreTown): Promise<DisplayListing[]> {
  const res = await fetch(`/api/listings?city=${city}&status=Active&limit=250`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = (await res.json()) as ApiResponse;
  return mapListings(body.listings, city);
}

type LoadState = "loading" | "ready" | "fallback";

export default function IntelligenceClient() {
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
  const minBedrooms = Number(minBedsFilter);
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
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [middleTierExpanded, setMiddleTierExpanded] = useState(false);
  const boardRef = useRef<HTMLDivElement>(null);
  // Monthly sales counts per city for months-of-supply calculation
  const [monthlySales, setMonthlySales] = useState<Record<string, number>>({});
  const [monthlySalesLoaded, setMonthlySalesLoaded] = useState(false);

  const orderedCities = usePersonalizedTowns(TMRE_TOWNS);

  useEffect(() => {
    return () => {
      if (townHoverClearTimer.current) clearTimeout(townHoverClearTimer.current);
    };
  }, []);

  // Fetch monthly sales for all cities to compute months-of-supply
  useEffect(() => {
    const cities = [...TMRE_TOWNS];
    Promise.all(
      cities.map((city) =>
        fetch(`/api/sales-by-month?city=${city}`, { cache: "no-store" })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
      ),
    ).then((results) => {
      const now = new Date();
      const sales: Record<string, number> = {};
      results.forEach((d, i) => {
        if (!d?.data) return;
        // Average monthly closings over the last 3 completed months
        const recentMonths: number[] = [];
        for (let offset = 1; offset <= 3; offset++) {
          const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
          const yr = date.getFullYear();
          const mo = date.getMonth() + 1;
          const entry = d.data.find((e: { year: number; month: number; count: number }) => e.year === yr && e.month === mo);
          if (entry) recentMonths.push(entry.count);
        }
        if (recentMonths.length) {
          sales[cities[i]] = recentMonths.reduce((a: number, b: number) => a + b, 0) / recentMonths.length;
        }
      });
      setMonthlySales(sales);
      setMonthlySalesLoaded(true);
    });
  }, []);

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
    if (cls === "commercial" && minBedsFilter !== "0") setMinBedsFilter("0");
  }, [cls, minBedsFilter, setMinBedsFilter]);

  useEffect(() => {
    setMiddleTierExpanded(false);
  }, [active, tx, cls, saleProperty, zip, boardStatusFilter, minBedrooms, newConstructionOnly]);

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
        newConstructionOnly,
      ),
    [allListings, tx, cls, zip, boardStatusFilter, saleProperty, minBedrooms, newConstructionOnly],
  );

  const boardTiers = useMemo(() => {
    const deduped = dedupeListingHeadlines(listings);
    const tiers = splitBoardByScoreTier(deduped);
    const allTowns = active === "All";
    return {
      ...tiers,
      top: sortListings(tiers.top, sortKey, sortDir, allTowns),
      middle: sortListings(tiers.middle, sortKey, sortDir, allTowns),
      bottom: sortListings(tiers.bottom, sortKey, sortDir, allTowns),
    };
  }, [listings, sortKey, sortDir, active]);

  const boardColSpan = active === "All" ? 10 : 9;
  const resultCount = listings.length;
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
        newConstructionOnly,
      ).length;
      counts[town] = n;
      all += n;
    }
    return { ...counts, All: all };
  }, [byCity, state, tx, cls, boardStatusFilter, saleProperty, minBedrooms, newConstructionOnly]);

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
      newConstructionOnly,
    );
    const zipCounts = new Map<string, number>();
    filtered.forEach((l) => {
      if (!l.zip || !allowedZips.has(l.zip)) return;
      zipCounts.set(l.zip, (zipCounts.get(l.zip) ?? 0) + 1);
    });
    return { zipCounts, zipAllCount: filtered.length };
  }, [allListings, active, tx, cls, boardStatusFilter, saleProperty, minBedrooms, newConstructionOnly]);

  const scoreRankByKey = useMemo(() => buildScoreRankMap(listings), [listings]);
  const filtersActive =
    tx !== "all" ||
    cls !== "all" ||
    saleProperty !== "all" ||
    minBedrooms > 0 ||
    newConstructionOnly ||
    zip != null ||
    boardStatusFilter !== "all";
  const showZipFilters = active !== "All" && availableZips.length > 1;

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir(key === "address" || key === "status" || key === "town" ? "asc" : "desc");
  }

  function renderBoardRows(rows: DisplayListing[]) {
    const isLive = state === "ready";
    return rows.map((l) => (
      <BoardListingRow
        key={l.key}
        listing={l}
        scoreRank={scoreRankByKey.get(l.key) ?? 0}
        rankTotal={resultCount}
        isLive={isLive}
        showTown={active === "All"}
        allTowns={active === "All"}
        onScoreClick={(listing) => {
          if (listing.scoreBreakdown) {
            setScoreBreakdownListing(listing);
            return;
          }
          setScoreInfoOpen(true);
        }}
      />
    ));
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
      newConstructionOnly,
    ).length;
    return computeMonthsSupply(count, monthlySales[active]);
  }, [active, byCity, tx, cls, zip, boardStatusFilter, saleProperty, minBedrooms, newConstructionOnly, monthlySales]);

  const liveSnapshots = useMemo((): TownSnapshot[] => {
    const filterTown = (city: TmreTown) =>
      filterBoardListings(
        byCity[city] ?? [],
        tx,
        cls,
        zip,
        boardStatusFilter,
        saleProperty,
        minBedrooms,
        newConstructionOnly,
      );
    const benchmarks = snapshotBenchmarks(
      orderedCities.flatMap((city) => filterTown(city)),
    );

    if (active === "All") {
      return orderedCities.map((city) =>
        buildTownSnapshot(filterTown(city), city, monthlySales, zip, benchmarks),
      );
    }

    if (!listings.length) return [];
    return [buildTownSnapshot(listings, active, monthlySales, zip, benchmarks)];
  }, [listings, active, monthlySales, orderedCities, byCity, tx, cls, saleProperty, zip, boardStatusFilter, minBedrooms, newConstructionOnly]);

  const scrollToBoard = () => {
    requestAnimationFrame(() => {
      boardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
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
              <div className="flex flex-col gap-y-1.5 animate-fade-up">
                <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
                  Market Intelligence
                </p>
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

              <div className="mt-1 flex flex-col gap-1.5 items-start min-w-0 w-full animate-fade-up-delay-2">
                <div className="flex flex-col gap-1.5 items-start min-w-0 w-full">
                  <div className="flex flex-wrap items-end gap-2 self-start min-w-0">
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
                  <>
                    <div className={`hidden sm:block ${filterPillSeparatorClass("compact")}`} aria-hidden />
                    <BedroomSlider
                      value={minBedrooms}
                      onChange={(n) => setMinBedsFilter(String(n) as MinBedFilter)}
                    />
                  </>
                )}
              </div>

              <TownFilterPills
                towns={orderedCities}
                selected={active}
                onSelect={(city) => {
                  setActive(city);
                  setZip(null);
                  setBoardStatusFilter("all");
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
              {active !== "All" && (
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
            <div>
              <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold mb-1.5">
                Intelligent Deals
              </p>
              <h2 className="font-serif text-2xl sm:text-3xl lg:text-[2rem] text-navy leading-tight">
                Your {resultCount}{" "}
                {resultCount === 1 ? "listing" : "listings"},{" "}
                <span className="italic">scored.</span>
              </h2>
            </div>
            <div className="flex items-center gap-2 font-mono text-xs shrink-0">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  state === "ready"
                    ? "bg-sage animate-pulse-dot"
                    : state === "fallback"
                    ? "bg-coral"
                    : "bg-gold animate-pulse-dot"
                }`}
              />
              <span className="text-slate">
                {state === "ready"
                  ? "Live"
                  : state === "fallback"
                  ? "Cached · feed offline"
                  : "Loading…"}
              </span>
            </div>
          </div>

          <div className={`lg:grid lg:gap-5 lg:items-start ${active === "All" ? "lg:grid-cols-[minmax(0,1fr)_268px]" : "lg:grid-cols-[minmax(0,1fr)_248px]"}`}>

            {/* Deal board */}
            <div ref={boardRef} id="deal-board" className="min-w-0 scroll-mt-24">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-charcoal/[0.08] bg-white px-4 py-2.5">
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
                  ) : filtersActive && poolCount > resultCount ? (
                    <>
                      {" "}
                      <span className="text-slate/55 normal-case tracking-normal">
                        (of {poolCount.toLocaleString()} in{" "}
                        {active === "All" ? "selected towns" : active})
                      </span>
                    </>
                  ) : null}
                </>
              )}
            </p>
            {resultCount > 0 && (
              <p className="font-mono text-[10px] tracking-[0.12em] uppercase text-slate/55">
                Sorted by {sortKey === "ppsf" ? "$ / sqft" : sortKey === "dom" ? "DOM" : sortKey}
                {sortDir === "asc" ? " ↑" : " ↓"}
              </p>
            )}
          </div>
          <div className="overflow-x-auto rounded-2xl border border-charcoal/[0.08] bg-white">
            <table className="w-full text-left min-w-[780px]">
              <thead>
                <tr className="border-b border-charcoal/[0.12] bg-cream">
                  <th className="px-3 py-3 font-mono text-[9px] tracking-[0.16em] uppercase text-slate text-right w-10">
                    #
                  </th>
                  <th className="px-5 py-3 text-left">
                    <span className="inline-flex items-center gap-0.5">
                      <SortHeaderControl
                        sortKey="score"
                        label="Score"
                        activeKey={sortKey}
                        direction={sortDir}
                        onSort={handleSort}
                      />
                      <ScoreInfoButton onInfoClick={() => setScoreInfoOpen(true)} />
                      <Link
                        href="/score"
                        className="font-mono text-[8px] text-slate/45 hover:text-gold normal-case tracking-normal"
                      >
                        →
                      </Link>
                    </span>
                  </th>
                  <Th>Photos</Th>
                  <SortableTh
                    label="Address"
                    sortKey="address"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={handleSort}
                  />
                  {active === "All" && (
                    <SortableTh
                      label="Town"
                      sortKey="town"
                      activeKey={sortKey}
                      direction={sortDir}
                      onSort={handleSort}
                    />
                  )}
                  <SortableTh
                    label="Price"
                    sortKey="price"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={handleSort}
                    align="right"
                  />
                  <SortableTh
                    label="$ / sqft"
                    sortKey="ppsf"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={handleSort}
                    align="right"
                  />
                  <SortableTh
                    label="Sqft"
                    sortKey="sqft"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={handleSort}
                    align="right"
                  />
                  <SortableTh
                    label="DOM"
                    sortKey="dom"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={handleSort}
                    align="right"
                  />
                  <SortableTh
                    label="Status / Insight"
                    sortKey="status"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={handleSort}
                  />
                </tr>
              </thead>
              <tbody>
                {state === "loading" && liveListings === null && (
                  <tr>
                    <td colSpan={boardColSpan} className="px-5 py-16 text-center text-slate">
                      <span className="inline-flex items-center gap-2 font-mono text-xs">
                        <span className="w-1.5 h-1.5 rounded-full bg-gold animate-pulse-dot" />
                        Loading {active}…
                      </span>
                    </td>
                  </tr>
                )}
                {(state !== "loading" || liveListings !== null) &&
                  listings.length === 0 && (
                    <tr>
                      <td colSpan={boardColSpan} className="px-5 py-16 text-center">
                        <p className="text-slate text-sm">
                          No {active === "All" ? "" : `${active} `}
                          {boardStatusFilter === "new"
                            ? "new "
                            : boardStatusFilter === "reduced"
                              ? "reduced "
                              : ""}
                          listings match your current filters.
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setTx("all");
                            setCls("all");
                            setSaleProperty("all");
                            setZip(null);
                            setBoardStatusFilter("all");
                          }}
                          className="mt-3 font-mono text-[11px] tracking-[0.15em] uppercase text-gold hover:text-navy transition-colors"
                        >
                          Reset filters →
                        </button>
                      </td>
                    </tr>
                  )}
                {(state !== "loading" || liveListings !== null) &&
                  resultCount > 0 && (
                    <>
                      {renderBoardRows(boardTiers.top)}
                      {boardTiers.canTier && boardTiers.middle.length > 0 && (
                        <tr className="border-b border-charcoal/[0.10] bg-cream/50">
                          <td colSpan={boardColSpan} className="px-5 py-3">
                            <button
                              type="button"
                              onClick={() => setMiddleTierExpanded((v) => !v)}
                              className="w-full flex items-center justify-center gap-2 font-mono text-[10px] tracking-[0.14em] uppercase text-gold hover:text-navy transition-colors py-1"
                              aria-expanded={middleTierExpanded}
                            >
                              {middleTierExpanded ? (
                                <>Hide middle tier · {boardTiers.middle.length} listings ↑</>
                              ) : (
                                <>
                                  Show middle tier · {boardTiers.middle.length} listings (
                                  {Math.round((boardTiers.middle.length / resultCount) * 100)}%)
                                  ↓
                                </>
                              )}
                            </button>
                          </td>
                        </tr>
                      )}
                      {middleTierExpanded && renderBoardRows(boardTiers.middle)}
                      {renderBoardRows(boardTiers.bottom)}
                    </>
                  )}
              </tbody>
              {resultCount > 0 && (
                <tfoot>
                  <tr className="border-t border-charcoal/[0.12] bg-cream/60">
                    <td
                      colSpan={boardColSpan}
                      className="px-5 py-3 font-mono text-[10px] tracking-[0.12em] uppercase text-slate"
                    >
                      {visibleCount.toLocaleString()} of {resultCount.toLocaleString()}{" "}
                      {resultCount === 1 ? "listing" : "listings"} in this view
                      {middleHidden
                        ? ` · ${boardTiers.middle.length} in middle tier hidden`
                        : ""}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
            </div>{/* end deal board */}

            <aside className={`mt-8 lg:mt-0 lg:sticky lg:top-20 lg:shrink-0 space-y-4 ${active === "All" ? "max-h-[calc(100vh-6rem)] overflow-y-auto pr-1" : ""}`}>
              {liveSnapshots.map((snap) => (
                <SnapshotCard
                  key={`${snap.town}-${snap.zip ?? "all"}`}
                  snapshot={snap}
                  tx={tx}
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
              ))}
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
                { label: "Age (10%)", detail: "Year built — newer construction scores higher on its own" },
                { label: "Condition (20%)", detail: "Renovation and move-in readiness language in listing remarks" },
                { label: "Finishes (25%)", detail: "Material quality, photo depth, and virtual tour availability" },
                { label: "PPSF fit (25%)", detail: "Price-per-sqft vs city median — the Goldilocks value band" },
                { label: "Layout (10%)", detail: "Bed/bath fit, sqft per bedroom, and floor-plan keywords" },
                { label: "Schools (10%)", detail: "School ratings for the listing, with town baselines as fallback" },
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

function BedroomSlider({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex items-center gap-3 shrink-0">
      <div className="flex flex-col gap-0.5 shrink-0">
        <span className="font-mono text-[8px] tracking-[0.12em] uppercase text-white/45 leading-none">
          Bedrooms
        </span>
        <span className="font-mono text-[7px] tabular-nums text-gold leading-none">
          {value === 0 ? "Any" : `${value}+`}
        </span>
      </div>
      <div className="w-[3.5rem] shrink-0">
        <input
          type="range"
          min={0}
          max={6}
          step={1}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/15 accent-[#C8A951]"
          aria-label="Filter by bedrooms"
          aria-valuemin={0}
          aria-valuemax={6}
          aria-valuenow={value}
        />
        <div className="mt-0.5 flex justify-between font-mono text-[6px] tabular-nums text-white/30">
          <span>Any</span>
          <span>6+</span>
        </div>
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

function SortHeaderControl({
  label,
  sortKey,
  activeKey,
  direction,
  onSort,
  align = "left",
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  direction: SortDir;
  onSort: (key: SortKey) => void;
  align?: "left" | "right";
}) {
  const active = activeKey === sortKey;
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : "none"}
      className={`inline-flex items-center gap-1 font-mono text-[9px] tracking-[0.16em] uppercase transition-colors ${
        active ? "text-navy" : "text-slate hover:text-navy"
      } ${align === "right" ? "ml-auto" : ""}`}
    >
      {label}
      <span
        className={`text-[8px] tabular-nums ${active ? "text-gold" : "text-slate/35"}`}
        aria-hidden
      >
        {active ? (direction === "asc" ? "↑" : "↓") : "↕"}
      </span>
    </button>
  );
}

function SortableTh({
  label,
  sortKey,
  activeKey,
  direction,
  onSort,
  align = "left",
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  direction: SortDir;
  onSort: (key: SortKey) => void;
  align?: "left" | "right";
}) {
  return (
    <th
      className={`px-5 py-3 ${align === "right" ? "text-right" : "text-left"}`}
    >
      <SortHeaderControl
        label={label}
        sortKey={sortKey}
        activeKey={activeKey}
        direction={direction}
        onSort={onSort}
        align={align}
      />
    </th>
  );
}

function SnapshotCard({
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
    action: "new" | "reduced",
    zip?: string | null,
  ) => string;
  onMedianHref?: (snapshot: TownSnapshot) => string | null;
}) {
  const medianHref = onMedianHref?.(snapshot) ?? null;
  const title = snapshotCardTitle(snapshot, tx);
  const place = snapshotHeading(snapshot);
  return (
    <div className="rounded-2xl bg-white border border-charcoal/[0.06] overflow-hidden">
      <div className="px-5 py-4 border-b border-charcoal/[0.06] text-center">
        <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-slate font-bold">
          {title}
        </p>
      </div>
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
                    : `View reduced ${place} listings`
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
    </div>
  );
}

function BoardListingRow({
  listing: l,
  scoreRank,
  rankTotal,
  isLive,
  showTown,
  allTowns,
  onScoreClick,
}: {
  listing: DisplayListing;
  scoreRank: number;
  rankTotal: number;
  isLive: boolean;
  showTown: boolean;
  allTowns: boolean;
  onScoreClick: (listing: DisplayListing) => void;
}) {
  const rankColor = boardRankColor(scoreRank, rankTotal);
  const addressLabel = formatBoardAddress(l, allTowns);
  const addressClass = `font-medium text-navy leading-snug ${
    allTowns ? "text-xs" : "text-sm"
  }`;
  const detailHref = listingDetailHrefForListing({
    mlsId: l.key,
    listingKey: l.listingKey,
    address: { street: l.address, full: l.address },
    city: l.city,
  });

  return (
    <tr className="group border-b border-charcoal/[0.10] last:border-0 hover:bg-gold/5 transition-colors">
      <td
        className="px-3 py-4 font-mono text-xs tabular-nums text-right w-10 font-semibold"
        style={{ color: rankColor }}
      >
        {scoreRank + 1}
      </td>
      <td className="px-5 py-4">
        <ScoreBadge value={l.score} onClick={() => onScoreClick(l)} />
      </td>
      <td className="px-3 py-4">
        <PhotoStack mlsId={l.key} isLive={isLive} href={detailHref} />
      </td>
      <td className="px-5 py-4">
        {isLive ? (
          <Link
            href={detailHref}
            className={`${addressClass} hover:text-gold transition-colors underline decoration-charcoal/15 underline-offset-2 hover:decoration-gold`}
          >
            {addressLabel}
          </Link>
        ) : (
          <span className={addressClass}>{addressLabel}</span>
        )}
        <p className="text-xs text-slate mt-0.5">{l.type}</p>
      </td>
      {showTown && (
        <td className="px-5 py-4 font-medium text-navy">
          {listingTown(l) ?? "—"}
        </td>
      )}
      <td className="px-5 py-4 text-right font-mono text-navy tabular-nums">
        ${l.price.toLocaleString()}
      </td>
      <td className="px-5 py-4 text-right font-mono text-slate tabular-nums">
        {l.isRental ? "—" : l.pricePerSqft ? `$${Math.round(l.pricePerSqft)}` : "—"}
      </td>
      <td className="px-5 py-4 text-right font-mono text-slate tabular-nums">
        {l.sqft ? l.sqft.toLocaleString() : "—"}
      </td>
      <td className="px-5 py-4 text-right font-mono text-slate tabular-nums">
        {l.dom != null ? `${l.dom}d` : "—"}
      </td>
      <td className="px-5 py-4">
        <StatusBadge status={l.status} />
        <p className="text-[11px] text-charcoal/60 mt-2 leading-snug max-w-[160px]">
          {insightHeadline(l.headline)}
        </p>
      </td>
    </tr>
  );
}

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      className={`px-5 py-3 font-mono text-[9px] tracking-[0.16em] uppercase text-slate ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}

function ScoreBadge({ value, onClick }: { value: number; onClick?: () => void }) {
  const color =
    value >= 85
      ? "text-sage"
      : value >= 70
      ? "text-gold"
      : "text-charcoal/50";
  const className = `font-mono font-semibold tabular-nums text-base ${color} ${
    onClick
      ? "underline underline-offset-2 decoration-charcoal/20 hover:decoration-gold transition-colors cursor-pointer"
      : ""
  }`;
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={className}
        aria-label={`Score ${value.toFixed(1)} — view breakdown`}
      >
        {value.toFixed(1)}
      </button>
    );
  }
  return <span className={className}>{value.toFixed(1)}</span>;
}

function PhotoStack({
  mlsId,
  isLive,
  href,
}: {
  mlsId: string;
  isLive: boolean;
  href: string;
}) {
  const [hovered, setHovered] = useState(false);
  const [photos, setPhotos] = useState<string[]>([]);
  const allFetchedRef = useRef(false);

  // Eagerly fetch the hero photo so the front card is never blank
  useEffect(() => {
    if (!isLive) return;
    fetch(`/api/listings/${encodeURIComponent(mlsId)}/photo`, {
      cache: "default",
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { url?: string | null } | null) => {
        if (d?.url) setPhotos((prev) => (prev.length ? prev : [d.url!]));
      })
      .catch(() => {});
  }, [mlsId, isLive]);

  function onEnter() {
    setHovered(true);
    if (isLive && !allFetchedRef.current) {
      allFetchedRef.current = true;
      fetch(`/api/listings/${encodeURIComponent(mlsId)}`, { cache: "default" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { photos?: string[] } | null) => {
          if (d?.photos?.length) setPhotos(d.photos.slice(0, 5));
        })
        .catch(() => {});
    }
  }

  const CARD_W = 44;
  const CARD_H = 32;

  const stackedTransforms = [
    "rotate(-5deg) translate(-4px, 4px)",
    "rotate(-2.5deg) translate(-2px, 2px)",
    "rotate(0deg) translate(0px, 0px)",
    "rotate(2.5deg) translate(2px, -2px)",
    "rotate(5deg) translate(4px, -4px)",
  ];
  const fannedTransforms = [
    "rotate(-16deg) translateX(-38px) translateY(4px)",
    "rotate(-8deg) translateX(-19px) translateY(-3px)",
    "rotate(0deg) translateX(0px) translateY(-6px)",
    "rotate(8deg) translateX(19px) translateY(-3px)",
    "rotate(16deg) translateX(38px) translateY(4px)",
  ];
  const placeholderBg = ["#e8e0d4", "#ddd4c4", "#d2c9b6", "#c8bea8", "#bdb39a"];

  return (
    <Link
      href={href}
      aria-label="View listing photos"
      onMouseEnter={onEnter}
      onMouseLeave={() => setHovered(false)}
      className="block"
      style={{ width: 96, height: 52 }}
    >
      <div className="relative w-full h-full">
        {[0, 1, 2, 3, 4].map((i) => {
          const photo = photos[i] ?? null;
          return (
            <span
              key={i}
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                width: CARD_W,
                height: CARD_H,
                marginTop: -(CARD_H / 2),
                marginLeft: -(CARD_W / 2),
                borderRadius: 5,
                border: "1px solid rgba(0,0,0,0.12)",
                overflow: "hidden",
                transition: "transform 0.3s cubic-bezier(0.34,1.56,0.64,1)",
                transform: hovered ? fannedTransforms[i] : stackedTransforms[i],
                zIndex: hovered ? i : 4 - i,
                backgroundColor: photo ? undefined : placeholderBg[i],
                backgroundImage: photo ? `url(${photo})` : undefined,
                backgroundSize: "cover",
                backgroundPosition: "center",
                boxShadow: "0 1px 4px rgba(0,0,0,0.15)",
              }}
            />
          );
        })}
      </div>
    </Link>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    New: "bg-sage/10 text-sage border-sage/30",
    Active: "bg-sky/10 text-sky border-sky/30",
    Reduced: "bg-coral/10 text-coral border-coral/30",
    Pending: "bg-charcoal/10 text-slate border-charcoal/20",
  };
  return (
    <span
      className={`inline-flex items-center font-mono text-[10px] tracking-[0.15em] uppercase border rounded-full px-2.5 py-1 ${
        map[status] ?? "bg-charcoal/10 text-slate border-charcoal/20"
      }`}
    >
      {status}
    </span>
  );
}
