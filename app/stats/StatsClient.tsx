"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { usePersonalizedTowns } from "@/hooks/usePersonalizedTowns";
import { fetchActiveMedianListings } from "@/lib/active-median-listings";
import { TOWN_LIST, STATS_CITIES, STATS_KINDS, type StatsCity, type StatsKind, type Town } from "./stats-towns";
import { formatTownList } from "@/lib/tmre-towns";
import type { TownCountMap } from "@/lib/town-listing-counts";
import TownFilterPills from "@/components/TownFilterPills";
import {
  filterPillButtonClass,
  filterPillContainerClass,
} from "@/lib/filter-pill-styles";
import { usePersistedFilter, usePersistedNullableFilter } from "@/hooks/usePersistedFilter";
import MedianPriceListingsTable, {
  type MedianListingRow,
} from "./MedianPriceListingsTable";
import StatsChartPrintFrame from "./StatsChartPrintFrame";
import SalesTrendDataTable from "./SalesTrendDataTable";
import ActiveByMonthDataTable from "./ActiveByMonthDataTable";
import ActiveByMonthView from "./ActiveByMonthView";
import ActiveByTownDataTable from "./ActiveByTownDataTable";
import ActiveByTownView from "./ActiveByTownView";
import SalesByTownDataTable from "./SalesByTownDataTable";
import VintageSalesDataTable from "./VintageSalesDataTable";
import StatsChartNav from "./StatsChartNav";
import StatsChartLazyMount from "./StatsChartLazyMount";
import {
  statsActiveByMonthTitle,
  statsActiveByMonthTownTitle,
  statsByMonthTitle,
  statsByMonthTownTitle,
  statsByPriceTitle,
  statsByVintageTitle,
} from "./stats-labels";
import "./stats-print.css";

const SalesTrendChart = dynamic(() => import("./SalesTrendChart"), { ssr: false });
const ActiveByMonthChart = dynamic(() => import("./ActiveByMonthChart"), { ssr: false });
const ActiveByTownChart = dynamic(() => import("./ActiveByTownChart"), { ssr: false });
const SalesByTownChart = dynamic(() => import("./SalesByTownChart"), { ssr: false });
const VintageSalesChart = dynamic(() => import("./VintageSalesChart"), { ssr: false });
const PriceSalesChart = dynamic(() => import("./PriceSalesChart"), { ssr: false });
const MedianPriceBarChart = dynamic(() => import("./MedianPriceBarChart"), { ssr: false });
const AvgDomLineChart = dynamic(() => import("./AvgDomLineChart"), { ssr: false });

export type { StatsCity, StatsKind, Town } from "./stats-towns";
export { TOWN_LIST } from "./stats-towns";

type CityStats = {
  city: string;
  activeCount: number;
  medianPrice: number | null;
  avgDaysOnMarket: number | null;
  avgPricePerSqft: number | null;
  avgBeds: number | null;
  sampleSize: number;
};

type LoadState = "loading" | "ready" | "error";

type ListingPool = "active" | "closed";
type TableMode = "median" | "price-band";
const TABLE_MODES = ["median", "price-band"] as const;
const LISTING_POOLS = ["active", "closed"] as const;

function parseUrlTown(value: string | null): Town | null {
  if (!value) return null;
  return TOWN_LIST.find((t) => t.toLowerCase() === value.toLowerCase()) ?? null;
}

type TopVintage = {
  label: string;
  count: number;
  share: number;
};

function emptyTownRecord<T>(value: T): Record<Town, T> {
  return {
    Norwalk: value,
    Westport: value,
    Wilton: value,
    Fairfield: value,
    Weston: value,
    "New Canaan": value,
    Ridgefield: value,
  };
}

const ACCENT: Record<Town, string> = {
  Norwalk: "text-sky",
  Westport: "text-gold",
  Wilton: "text-coral",
  Fairfield: "text-sage",
  Weston: "text-indigo-400",
  "New Canaan": "text-amber-400",
  Ridgefield: "text-rose-400",
};

const BORDER: Record<Town, string> = {
  Norwalk: "border-sky/30",
  Westport: "border-gold/30",
  Wilton: "border-coral/30",
  Fairfield: "border-sage/30",
  Weston: "border-indigo-400/30",
  "New Canaan": "border-amber-400/30",
  Ridgefield: "border-rose-400/30",
};

const EMPTY: CityStats = {
  city: "",
  activeCount: 0,
  medianPrice: null,
  avgDaysOnMarket: null,
  avgPricePerSqft: null,
  avgBeds: null,
  sampleSize: 0,
};

function bedsRange(avg: number | null): string {
  if (avg == null) return "—";
  const lo = Math.floor(avg);
  return `${lo}–${lo + 1} beds`;
}

function fmt$(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
}

export default function StatsClient() {
  const searchParams = useSearchParams();
  const urlCity = searchParams.get("city");
  const urlView = searchParams.get("view");
  const urlPool = searchParams.get("pool");
  const urlZip = searchParams.get("zip");
  const urlTx = searchParams.get("tx");
  const urlCls = searchParams.get("cls");
  const urlProperty = searchParams.get("property");
  const urlKind = searchParams.get("kind");

  const [stats, setStats] = useState<Record<Town, CityStats | null>>(emptyTownRecord(null));
  const [medianListings, setMedianListings] = useState<MedianListingRow[]>([]);
  const [listingsLoadState, setListingsLoadState] = useState<LoadState>("loading");
  const [activeMedianListings, setActiveMedianListings] = useState<MedianListingRow[]>([]);
  const [activeMedianPrice, setActiveMedianPrice] = useState<number | null>(null);
  const [activeMedianLoadState, setActiveMedianLoadState] = useState<LoadState>("ready");
  const [listingPool, setListingPool] = usePersistedFilter<ListingPool>(
    "tmre_stats_listing_pool",
    urlPool === "active" ? "active" : "closed",
    LISTING_POOLS,
  );
  const [topVintageByTown, setTopVintageByTown] = useState<Record<Town, TopVintage | null>>(
    emptyTownRecord(null),
  );
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [vintageLoadState, setVintageLoadState] = useState<LoadState>("loading");
  const [failedCities, setFailedCities] = useState<Town[]>([]);
  const [selectedCity, setSelectedCity] = usePersistedFilter<StatsCity>(
    "tmre_stats_city",
    "All",
    STATS_CITIES,
  );
  const [statsKind, setStatsKind] = usePersistedFilter<StatsKind>(
    "tmre_stats_kind",
    "sale",
    STATS_KINDS,
  );
  const [tableTown, setTableTown] = useState<Town | "All">("All");
  const [tableMode, setTableMode] = usePersistedFilter<TableMode>(
    "tmre_stats_table_mode",
    "median",
    TABLE_MODES,
  );
  const [priceBand, setPriceBand] = useState<{ id: string; label: string } | null>(null);
  const [priceBandRows, setPriceBandRows] = useState<MedianListingRow[]>([]);
  const [priceBandPeriod, setPriceBandPeriod] = useState<string | null>(null);
  const [priceBandLoadState, setPriceBandLoadState] = useState<LoadState>("ready");
  const [selectedPriceBucketId, setSelectedPriceBucketId] = usePersistedNullableFilter(
    "tmre_stats_price_bucket",
  );
  const [statsDataVersion, setStatsDataVersion] = useState(0);
  const [pendingRefreshAt, setPendingRefreshAt] = useState<string | null>(null);
  const loadedGeneratedAtRef = useRef<string | null>(null);
  const dismissedRefreshAtRef = useRef<string | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const townKindResetReady = useRef(false);
  const orderedTowns = usePersonalizedTowns(TOWN_LIST);
  const deepLinkApplied = useRef(false);

  useEffect(() => {
    if (deepLinkApplied.current) return;
    const city = parseUrlTown(urlCity);
    if (city) {
      setSelectedCity(city);
      setTableTown(city);
    }
    if (urlKind === "sale" || urlKind === "rental") {
      setStatsKind(urlKind);
    }
    if (urlView === "median") {
      setTableMode("median");
      setListingPool(urlPool === "active" ? "active" : "closed");
    }
    deepLinkApplied.current = true;
  }, [urlCity, urlView, urlPool, urlKind, setSelectedCity, setStatsKind]);

  useEffect(() => {
    const city = parseUrlTown(urlCity);
    if (urlPool !== "active" || urlView !== "median" || !city) {
      setActiveMedianListings([]);
      setActiveMedianPrice(null);
      setActiveMedianLoadState("ready");
      return;
    }

    let cancelled = false;
    setActiveMedianLoadState("loading");
    fetchActiveMedianListings(city, {
      tx: (urlTx as "all" | "sale" | "rental" | null) ?? "all",
      cls: (urlCls as "all" | "residential" | "commercial" | null) ?? "all",
      zip: urlZip,
      saleProperty:
        (urlProperty as "all" | "homes" | "multi" | "condos" | null) ?? "all",
    })
      .then(({ rows, medianPrice }) => {
        if (cancelled) return;
        setActiveMedianListings(rows);
        setActiveMedianPrice(medianPrice);
        setActiveMedianLoadState("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setActiveMedianListings([]);
        setActiveMedianPrice(null);
        setActiveMedianLoadState("error");
      });

    return () => {
      cancelled = true;
    };
  }, [urlPool, urlView, urlCity, urlZip, urlTx, urlCls, urlProperty]);

  useEffect(() => {
    if (urlView !== "median" || !parseUrlTown(urlCity)) return;
    const ready =
      listingPool === "active"
        ? activeMedianLoadState === "ready" || activeMedianLoadState === "error"
        : listingsLoadState === "ready" || listingsLoadState === "error";
    if (!ready) return;
    requestAnimationFrame(() => {
      tableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [
    urlView,
    urlCity,
    listingPool,
    activeMedianLoadState,
    listingsLoadState,
  ]);

  useEffect(() => {
    setTableTown(selectedCity);
  }, [selectedCity]);

  useEffect(() => {
    if (!townKindResetReady.current) {
      townKindResetReady.current = true;
      return;
    }
    setTableMode("median");
    setSelectedPriceBucketId(null);
    setPriceBand(null);
    setPriceBandRows([]);
  }, [selectedCity, statsKind, setTableMode, setSelectedPriceBucketId]);

  useEffect(() => {
    if (tableMode !== "price-band" || !selectedPriceBucketId) return;
    setPriceBandLoadState("loading");
    setPriceBandRows([]);
    setTableTown(selectedCity);

    const url = `/api/sales-by-price/listings?city=${encodeURIComponent(selectedCity)}&kind=${statsKind}&bucket=${encodeURIComponent(selectedPriceBucketId)}`;
    fetch(url, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { listings?: MedianListingRow[]; period?: string; bucket?: string; bucketLabel?: string } | null) => {
        setPriceBandRows(data?.listings ?? []);
        setPriceBandPeriod(data?.period ?? null);
        if (data?.bucket) {
          setPriceBand({
            id: data.bucket,
            label: data.bucketLabel ?? data.bucket,
          });
        }
        setPriceBandLoadState("ready");
      })
      .catch(() => {
        setPriceBandRows([]);
        setPriceBandLoadState("error");
      });
  }, [tableMode, selectedPriceBucketId, selectedCity, statsKind, statsDataVersion]);

  const showMedianDetail = (town: Town | "All") => {
    setTableMode("median");
    setListingPool("closed");
    setSelectedPriceBucketId(null);
    setTableTown(town);
    if (town !== "All") setSelectedCity(town);
    requestAnimationFrame(() => {
      tableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const showPriceBandDetail = (bucket: { id: string; label: string }) => {
    setTableMode("price-band");
    setPriceBand(bucket);
    setSelectedPriceBucketId(bucket.id);
    setTableTown(selectedCity);
    setPriceBandLoadState("loading");
    setPriceBandRows([]);

    const url = `/api/sales-by-price/listings?city=${encodeURIComponent(selectedCity)}&kind=${statsKind}&bucket=${encodeURIComponent(bucket.id)}`;
    fetch(url, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { listings?: MedianListingRow[]; period?: string } | null) => {
        setPriceBandRows(data?.listings ?? []);
        setPriceBandPeriod(data?.period ?? null);
        setPriceBandLoadState("ready");
      })
      .catch(() => {
        setPriceBandRows([]);
        setPriceBandLoadState("error");
      });

    requestAnimationFrame(() => {
      tableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  useEffect(() => {
    let cancelled = false;
    setLoadState("loading");
    setVintageLoadState("loading");
    setListingsLoadState("loading");

    fetch(`/api/stats/page?kind=${statsKind}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (
          data: {
            towns?: Record<
              Town,
              {
                marketStats: CityStats | null;
                vintage: { topBucket: TopVintage | null } | null;
                medianListings: MedianListingRow[];
              }
            >;
            generatedAt?: string | null;
            statsCache?: boolean;
          } | null,
        ) => {
          if (cancelled || !data?.towns) {
            if (!cancelled) {
              setLoadState("error");
              setVintageLoadState("error");
              setListingsLoadState("error");
            }
            return;
          }

          const nextStats = emptyTownRecord<CityStats | null>(null);
          const nextVintage = emptyTownRecord<TopVintage | null>(null);
          const failed: Town[] = [];
          const allListings: MedianListingRow[] = [];

          for (const city of TOWN_LIST) {
            const bundle = data.towns[city];
            if (bundle?.marketStats) nextStats[city] = bundle.marketStats;
            else failed.push(city);
            if (bundle?.vintage?.topBucket) nextVintage[city] = bundle.vintage.topBucket;
            if (bundle?.medianListings?.length) {
              allListings.push(...bundle.medianListings);
            }
          }

          setStats(nextStats);
          setTopVintageByTown(nextVintage);
          setMedianListings(allListings);
          setFailedCities(failed);
          setLoadState(failed.length === TOWN_LIST.length ? "error" : "ready");
          setVintageLoadState("ready");
          setListingsLoadState("ready");
          if (data.generatedAt) {
            loadedGeneratedAtRef.current = data.generatedAt;
            dismissedRefreshAtRef.current = null;
            setPendingRefreshAt(null);
          }
        },
      )
      .catch(() => {
        if (cancelled) return;
        setLoadState("error");
        setVintageLoadState("error");
        setListingsLoadState("error");
      });

    return () => {
      cancelled = true;
    };
  }, [statsKind, statsDataVersion]);

  useEffect(() => {
    let cancelled = false;

    const pollRefreshStatus = async () => {
      try {
        const res = await fetch("/api/stats/refresh-status", { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as {
          generatedAt: string | null;
          rebuilding: boolean;
        };
        if (data.rebuilding || !data.generatedAt) return;
        const loadedAt = loadedGeneratedAtRef.current;
        if (!loadedAt) {
          loadedGeneratedAtRef.current = data.generatedAt;
          return;
        }
        if (data.generatedAt !== loadedAt && data.generatedAt !== dismissedRefreshAtRef.current) {
          setPendingRefreshAt(data.generatedAt);
        }
      } catch {
        /* ignore polling errors */
      }
    };

    pollRefreshStatus();
    const id = window.setInterval(pollRefreshStatus, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const acceptStatsRefresh = () => {
    setStatsDataVersion((version) => version + 1);
  };

  const isRental = statsKind === "rental";
  const medianLabel = isRental ? "Median closed rent" : "Median closed price";
  const activeLabel = isRental ? "Active rentals" : "Active listings";

  const allStats = TOWN_LIST.map((c) => stats[c] ?? { ...EMPTY, city: c });
  const visibleTowns = useMemo(
    () => (selectedCity === "All" ? [...TOWN_LIST] : [selectedCity]),
    [selectedCity],
  );

  const totalActive = allStats.reduce((s, c) => s + c.activeCount, 0);

  const townCounts = useMemo((): TownCountMap => {
    if (loadState === "loading") return {};
    const counts = Object.fromEntries(
      TOWN_LIST.map((town) => [town, stats[town]?.activeCount ?? 0]),
    ) as TownCountMap;
    counts.All = totalActive;
    return counts;
  }, [stats, loadState, totalActive]);

  const prices = allStats.map((c) => c.medianPrice).filter((p): p is number => p != null);
  const lowestMedian = prices.length ? Math.min(...prices) : null;
  const highestMedian = prices.length ? Math.max(...prices) : null;

  const selectedStats = selectedCity === "All" ? null : stats[selectedCity];
  const heroActive =
    selectedCity === "All"
      ? totalActive
      : (selectedStats?.activeCount ?? 0);
  const chartHeaderActiveCount =
    loadState === "loading"
      ? null
      : selectedCity === "All"
        ? totalActive
        : (selectedStats?.activeCount ?? null);
  const heroMedian = selectedCity === "All" ? null : selectedStats?.medianPrice ?? null;
  const heroDom = selectedCity === "All" ? null : selectedStats?.avgDaysOnMarket ?? null;

  const chartNavItems = useMemo(() => {
    const items: { id: string; label: string }[] = [
      { id: "stats-chart-active-by-month", label: statsActiveByMonthTitle(statsKind) },
      { id: "stats-chart-sales-trend", label: statsByMonthTitle(statsKind) },
    ];
    if (selectedCity === "All") {
      items.push(
        { id: "stats-chart-active-by-town", label: statsActiveByMonthTownTitle(statsKind) },
        { id: "stats-chart-sales-by-town", label: statsByMonthTownTitle(statsKind) },
      );
    }
    items.push(
      { id: "stats-chart-sales-by-vintage", label: statsByVintageTitle(statsKind) },
      { id: "stats-chart-sales-by-price", label: statsByPriceTitle(statsKind) },
    );
    if (selectedCity === "All") {
      items.push(
        { id: "stats-chart-town-comparison", label: "Town comparison" },
        { id: "stats-chart-median-by-town", label: `${medianLabel} by town` },
        { id: "stats-chart-avg-dom", label: "Avg days on market" },
      );
    }
    return items;
  }, [selectedCity, statsKind, medianLabel]);

  const medianChartData = useMemo(
    () =>
      TOWN_LIST.map((town) => {
        const medianPrice = stats[town]?.medianPrice;
        return {
          town,
          medianPrice:
            typeof medianPrice === "number" && medianPrice > 0 ? medianPrice : 0,
        };
      }).filter((d) => d.medianPrice > 0),
    [stats],
  );

  const domChartData = useMemo(
    () =>
      visibleTowns
        .map((town) => {
          const avgDom = stats[town]?.avgDaysOnMarket;
          if (avgDom == null) return null;
          return {
            town,
            avgDom,
            pace:
              avgDom <= 10
                ? "Moving fast"
                : avgDom <= 20
                  ? "Steady"
                  : "Slower",
          };
        })
        .filter((d): d is NonNullable<typeof d> => d != null),
    [visibleTowns, stats],
  );

  const chartVersionSuffix = `-v${statsDataVersion}`;

  return (
    <div className="stats-page-print-scope">
      {pendingRefreshAt ? (
        <div
          className="stats-print-screen-only sticky top-16 z-40 border-b border-gold/30 bg-navy/95 backdrop-blur-sm"
          role="status"
          aria-live="polite"
        >
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-6 py-3 lg:px-10">
            <p className="font-mono text-[11px] tracking-[0.12em] text-white/80">
              Updated market statistics are available.
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  dismissedRefreshAtRef.current = pendingRefreshAt;
                  setPendingRefreshAt(null);
                }}
                className="rounded-full border border-white/15 px-3 py-1.5 font-mono text-[10px] tracking-[0.12em] uppercase text-white/60 transition-colors hover:border-white/30 hover:text-white/85"
              >
                Keep current view
              </button>
              <button
                type="button"
                onClick={acceptStatsRefresh}
                className="rounded-full border border-gold/40 bg-gold/15 px-3 py-1.5 font-mono text-[10px] tracking-[0.12em] uppercase text-gold transition-colors hover:bg-gold/25"
              >
                Take refresh
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <div className="stats-print-header hidden">
        <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-charcoal/60 mb-1">
          TMRE Market Statistics
        </p>
        <h2 className="font-serif text-2xl text-navy">
          {selectedCity === "All" ? "All Towns" : `${selectedCity}, CT`}
          <span className="text-charcoal/40"> · </span>
          {isRental ? "Rentals" : "For Sale"}
        </h2>
      </div>

      <section className="navy-gradient text-white pt-20 pb-8 lg:pt-28 lg:pb-12 relative overflow-hidden stats-print-screen-only stats-hero-section">
        <div className="absolute inset-0 hero-grid opacity-40" aria-hidden />
        <div className="relative mx-auto max-w-7xl px-6 lg:px-10">
          <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold mb-3 animate-fade-up">
            Market Statistics
          </p>
          <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl text-white leading-[1.05] max-w-3xl animate-fade-up">
            Numbers, <span className="italic gold-shimmer">live!</span>
          </h1>
          <p className="mt-3 text-sm lg:text-base text-white/70 max-w-xl leading-relaxed animate-fade-up-delay-1">
            {selectedCity === "All"
              ? `Real-time ${isRental ? "rental" : "for-sale"} stats across ${formatTownList(TOWN_LIST)} — pre-computed locally and refreshed every 30 minutes.`
              : `Live ${isRental ? "rental" : "for-sale"} stats for ${selectedCity}, CT — pre-computed locally and refreshed every 30 minutes.`}
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-3 animate-fade-up-delay-2">
            <div className={filterPillContainerClass("default", { wrap: false })}>
              {STATS_KINDS.map((kind) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => setStatsKind(kind)}
                  aria-pressed={statsKind === kind}
                  className={`${filterPillButtonClass(statsKind === kind)} capitalize`}
                >
                  {kind === "sale" ? "For Sale" : "Rentals"}
                </button>
              ))}
            </div>
            <TownFilterPills
              towns={orderedTowns}
              selected={selectedCity}
              onSelect={setSelectedCity}
              counts={townCounts}
            />
          </div>

          <div className="mt-6 flex flex-wrap gap-6 font-mono text-sm animate-fade-up-delay-2">
            <div>
              <span className="text-white/40 text-[10px] tracking-[0.2em] uppercase block mb-0.5">
                {selectedCity === "All" ? `Total ${isRental ? "rentals" : "active"}` : activeLabel}
              </span>
              <span className="text-white font-medium tabular-nums">
                {heroActive.toLocaleString("en-US")}
              </span>
            </div>
            {selectedCity === "All" ? (
              <div>
                <span className="text-white/40 text-[10px] tracking-[0.2em] uppercase block mb-0.5">
                  {isRental ? "Rent range" : "Price range"}
                </span>
                <span className="text-white font-medium tabular-nums">
                  {fmt$(lowestMedian)} – {fmt$(highestMedian)}
                </span>
              </div>
            ) : (
              <>
                <div>
                  <span className="text-white/40 text-[10px] tracking-[0.2em] uppercase block mb-0.5">
                    {medianLabel}
                  </span>
                  <button
                    type="button"
                    onClick={() => showMedianDetail(selectedCity)}
                    className="text-white font-medium tabular-nums hover:text-gold transition-colors underline decoration-white/25 hover:decoration-gold underline-offset-2"
                    aria-label={`View ${selectedCity} median price listings`}
                  >
                    {fmt$(heroMedian)}
                  </button>
                </div>
                <div>
                  <span className="text-white/40 text-[10px] tracking-[0.2em] uppercase block mb-0.5">
                    Avg DOM
                  </span>
                  <span className="text-white font-medium tabular-nums">
                    {heroDom != null ? `${Math.round(heroDom)}d` : "—"}
                  </span>
                </div>
              </>
            )}
            <div>
              <span className="text-white/40 text-[10px] tracking-[0.2em] uppercase block mb-0.5">
                View
              </span>
              <span className="text-white font-medium">
                {selectedCity === "All" ? `${TOWN_LIST.length} towns` : selectedCity}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  loadState === "loading"
                    ? "bg-gold animate-pulse-dot"
                    : "bg-sage animate-pulse-dot"
                }`}
              />
              <span className="text-white/40 text-[10px] tracking-[0.2em] uppercase">
                {loadState === "loading"
                  ? "Loading…"
                  : failedCities.length > 0
                    ? `Live · ${formatTownList(failedCities)} unavailable`
                    : "Live"}
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-cream py-10 lg:py-16 stats-charts-section">
        <div className="mx-auto max-w-7xl px-6 lg:px-10">
          <div
            className={`lg:grid lg:gap-8 lg:items-start ${
              selectedCity === "All" ? "lg:grid-cols-[1fr_272px]" : "lg:grid-cols-[1fr_256px]"
            }`}
          >
            <div className="space-y-10 min-w-0">
              <StatsChartNav items={chartNavItems} />

              <ActiveByMonthView
                key={`active-month-view-${statsKind}-${selectedCity}${chartVersionSuffix}`}
                city={selectedCity}
                kind={statsKind}
              >
                <StatsChartPrintFrame
                  chartId="active-by-month"
                  dataPanel={
                    <ActiveByMonthDataTable
                      key={`active-month-data-${statsKind}-${selectedCity}${chartVersionSuffix}`}
                      city={selectedCity}
                      kind={statsKind}
                    />
                  }
                >
                  <ActiveByMonthChart
                    key={`active-month-${statsKind}-${selectedCity}${chartVersionSuffix}`}
                    city={selectedCity}
                    kind={statsKind}
                    headerActiveCount={chartHeaderActiveCount}
                  />
                </StatsChartPrintFrame>
              </ActiveByMonthView>

              <StatsChartPrintFrame
                chartId="sales-trend"
                dataPanel={
                  <SalesTrendDataTable
                    key={`trend-data-${statsKind}-${selectedCity}${chartVersionSuffix}`}
                    city={selectedCity}
                    kind={statsKind}
                  />
                }
              >
                <SalesTrendChart
                  key={`trend-${statsKind}-${selectedCity}-${urlProperty ?? "all"}${chartVersionSuffix}`}
                  city={selectedCity}
                  kind={statsKind}
                  headerActiveCount={chartHeaderActiveCount}
                  propertyClass={
                    (urlProperty as "all" | "homes" | "multi" | "condos" | null) ??
                    "all"
                  }
                />
              </StatsChartPrintFrame>

              {selectedCity === "All" && (
                <StatsChartLazyMount>
                <ActiveByTownView key={`active-town-view-${statsKind}${chartVersionSuffix}`} kind={statsKind}>
                  <StatsChartPrintFrame
                    chartId="active-by-town"
                    dataPanel={
                      <ActiveByTownDataTable key={`active-town-month-data-${statsKind}${chartVersionSuffix}`} kind={statsKind} />
                    }
                  >
                    <ActiveByTownChart key={`active-town-month-${statsKind}${chartVersionSuffix}`} kind={statsKind} />
                  </StatsChartPrintFrame>
                </ActiveByTownView>
                </StatsChartLazyMount>
              )}

              {selectedCity === "All" && (
                <StatsChartLazyMount>
                <StatsChartPrintFrame
                  chartId="sales-by-town"
                  dataPanel={
                    <SalesByTownDataTable key={`town-month-data-${statsKind}${chartVersionSuffix}`} kind={statsKind} />
                  }
                >
                  <SalesByTownChart key={`town-month-${statsKind}${chartVersionSuffix}`} kind={statsKind} />
                </StatsChartPrintFrame>
                </StatsChartLazyMount>
              )}

              <StatsChartLazyMount>
              <StatsChartPrintFrame
                chartId="sales-by-vintage"
                dataPanel={
                  <VintageSalesDataTable
                    key={`vintage-data-${statsKind}-${selectedCity}${chartVersionSuffix}`}
                    city={selectedCity}
                    kind={statsKind}
                  />
                }
              >
                <VintageSalesChart
                  key={`vintage-${statsKind}-${selectedCity}${chartVersionSuffix}`}
                  city={selectedCity}
                  kind={statsKind}
                />
              </StatsChartPrintFrame>
              </StatsChartLazyMount>

              <StatsChartLazyMount>
              <StatsChartPrintFrame chartId="sales-by-price">
                <PriceSalesChart
                  key={`price-${statsKind}-${selectedCity}${chartVersionSuffix}`}
                  city={selectedCity}
                  kind={statsKind}
                  selectedBucketId={selectedPriceBucketId}
                  onBucketClick={showPriceBandDetail}
                />
              </StatsChartPrintFrame>
              </StatsChartLazyMount>

              {selectedCity === "All" && (
                <div
                  id="stats-chart-town-comparison"
                  className="stats-comparison-table stats-print-screen-only scroll-mt-28"
                >
                  <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-slate mb-4">
                    Side-by-side comparison
                  </p>
                  <div className="rounded-2xl bg-white border border-charcoal/[0.08] overflow-x-auto">
                    <table className="w-full text-left min-w-[540px]">
                      <thead>
                        <tr className="border-b border-charcoal/[0.12] bg-cream">
                          {[
                            "Town",
                            activeLabel,
                            medianLabel,
                            "Avg DOM",
                            ...(isRental ? [] : ["Avg $/sqft"]),
                            "Avg bedrooms",
                          ].map((h) => (
                            <th
                              key={h}
                              className="px-5 py-4 font-mono text-[10px] tracking-[0.2em] uppercase text-slate"
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {visibleTowns.map((city, i) => {
                          const d = stats[city] ?? { ...EMPTY, city };
                          return (
                            <tr
                              key={city}
                              className={`border-b border-charcoal/[0.08] last:border-0 hover:bg-gold/5 transition-colors ${i % 2 === 0 ? "" : "bg-cream/40"}`}
                            >
                              <td className="px-5 py-4">
                                <span
                                  className={`font-mono text-[10px] tracking-[0.15em] uppercase ${ACCENT[city]}`}
                                >
                                  {city}
                                </span>
                              </td>
                              <td className="px-5 py-4 font-mono tabular-nums text-navy">
                                {loadState === "loading" ? "…" : d.activeCount.toLocaleString("en-US")}
                              </td>
                              <td className="px-5 py-4 font-mono tabular-nums text-navy font-medium">
                                {loadState === "loading" ? (
                                  "…"
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => showMedianDetail(city)}
                                    className="hover:text-gold transition-colors underline decoration-charcoal/20 hover:decoration-gold underline-offset-2"
                                    aria-label={`View ${city} median price listings`}
                                  >
                                    {fmt$(d.medianPrice)}
                                  </button>
                                )}
                              </td>
                              <td className="px-5 py-4 font-mono tabular-nums text-charcoal">
                                {loadState === "loading"
                                  ? "…"
                                  : d.avgDaysOnMarket != null
                                    ? `${Math.round(d.avgDaysOnMarket)}d`
                                    : "—"}
                              </td>
                              {!isRental && (
                                <td className="px-5 py-4 font-mono tabular-nums text-charcoal">
                                  {loadState === "loading"
                                    ? "…"
                                    : d.avgPricePerSqft != null
                                      ? `$${Math.round(d.avgPricePerSqft)}`
                                      : "—"}
                                </td>
                              )}
                              <td className="px-5 py-4 font-mono tabular-nums text-charcoal">
                                {loadState === "loading" ? "…" : bedsRange(d.avgBeds)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {selectedCity === "All" && (
                <StatsChartLazyMount>
                <StatsChartPrintFrame chartId="median-by-town" title={`${medianLabel} by town`}>
                  <MedianPriceBarChart
                    key={`median-bar-${statsKind}${chartVersionSuffix}`}
                    data={medianChartData}
                    loading={loadState === "loading"}
                    onTownClick={(town) => showMedianDetail(town)}
                    kind={statsKind}
                  />
                </StatsChartPrintFrame>
                </StatsChartLazyMount>
              )}

              {selectedCity === "All" && (
                <StatsChartLazyMount>
                <StatsChartPrintFrame
                  chartId="avg-dom"
                  title="Avg days on market — lower is faster"
                >
                  <AvgDomLineChart
                    key={`dom-${statsKind}${chartVersionSuffix}`}
                    data={domChartData}
                    loading={loadState === "loading"}
                    kind={statsKind}
                  />
                </StatsChartPrintFrame>
                </StatsChartLazyMount>
              )}

              <div ref={tableRef} className="mt-16 pt-10 border-t border-charcoal/[0.08]">
                {tableMode === "price-band" ? (
                  <MedianPriceListingsTable
                    rows={priceBandRows}
                    townFilter={tableTown}
                    loading={priceBandLoadState === "loading"}
                    kind={statsKind}
                    mode="price-band"
                    priceBandLabel={priceBand?.label ?? null}
                    period={priceBandPeriod}
                    sectionId="price-band-listings"
                  />
                ) : (
                  <MedianPriceListingsTable
                    rows={listingPool === "active" ? activeMedianListings : medianListings}
                    townFilter={tableTown}
                    loading={
                      listingPool === "active"
                        ? activeMedianLoadState === "loading"
                        : listingsLoadState === "loading"
                    }
                    medianPrice={
                      listingPool === "active"
                        ? activeMedianPrice
                        : tableTown === "All"
                          ? null
                          : stats[tableTown]?.medianPrice ?? null
                    }
                    kind={statsKind}
                    mode="median"
                    listingPool={listingPool}
                  />
                )}
              </div>
            </div>

            <aside
              className="mb-10 lg:mb-0 lg:sticky lg:top-24 lg:self-start lg:shrink-0 space-y-4 stats-sidebar stats-print-screen-only"
            >
              {visibleTowns.map((city) => (
                <CityCard
                  key={city}
                  city={city}
                  data={stats[city]}
                  topVintage={topVintageByTown[city]}
                  loading={loadState === "loading"}
                  vintageLoading={vintageLoadState === "loading"}
                  onMedianClick={() => showMedianDetail(city)}
                  kind={statsKind}
                />
              ))}
            </aside>
          </div>
        </div>
      </section>
    </div>
  );
}

function formatTopVintage(v: TopVintage | null | undefined): string {
  if (!v) return "—";
  const pct = Math.round(v.share * 100);
  return pct > 0 ? `${v.label} (${pct}%)` : v.label;
}

function CityCard({
  city,
  data: d,
  topVintage,
  loading,
  vintageLoading,
  onMedianClick,
  kind,
}: {
  city: Town;
  data: CityStats | null;
  topVintage: TopVintage | null;
  loading: boolean;
  vintageLoading: boolean;
  onMedianClick?: () => void;
  kind: StatsKind;
}) {
  if (!d && !loading) {
    return (
      <div className={`rounded-2xl bg-white border ${BORDER[city]} p-5 lg:p-6`}>
        <p className={`font-mono text-[10px] tracking-[0.2em] uppercase mb-2 ${ACCENT[city]}`}>
          {city}, CT
        </p>
        <p className="font-mono text-[10px] text-coral/80 tracking-wide">Feed unavailable</p>
      </div>
    );
  }
  const safe = d ?? { ...EMPTY, city };
  const isRental = kind === "rental";
  const metrics = [
    {
      label: isRental ? "Active rentals" : "Active listings",
      value: loading ? "…" : safe.activeCount.toLocaleString("en-US"),
    },
    {
      label: isRental ? "Median closed rent" : "Median closed price",
      value: loading ? "…" : fmt$(safe.medianPrice),
      clickable: true,
    },
    {
      label: "Most popular vintage",
      value: vintageLoading ? "…" : formatTopVintage(topVintage),
    },
    {
      label: "Avg DOM",
      value:
        loading ? "…" : safe.avgDaysOnMarket != null ? `${Math.round(safe.avgDaysOnMarket)}d` : "—",
    },
    ...(isRental
      ? []
      : [
          {
            label: "Avg $/sqft",
            value:
              loading ? "…" : safe.avgPricePerSqft != null ? `$${Math.round(safe.avgPricePerSqft)}` : "—",
          },
        ]),
    { label: "Avg bedrooms", value: loading ? "…" : bedsRange(safe.avgBeds) },
  ];
  return (
    <div
      className={`rounded-2xl bg-white border ${BORDER[city]} p-5 lg:p-6 transition-all hover:-translate-y-1 hover:shadow-lg ${loading ? "animate-pulse" : ""}`}
    >
      <p className={`font-serif text-xl text-navy mb-1 ${ACCENT[city]}`}>{city}, CT</p>
      <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-slate mb-4">
        Market snapshot
      </p>
      <div className="space-y-3">
        {metrics.map((m) => (
          <div key={m.label} className="flex items-baseline justify-between gap-2">
            <span className="font-mono text-[10px] tracking-[0.15em] uppercase text-slate">
              {m.label}
            </span>
            {m.label === (isRental ? "Median closed rent" : "Median closed price") && onMedianClick && !loading ? (
              <button
                type="button"
                onClick={onMedianClick}
                className="font-mono tabular-nums text-navy text-sm font-medium hover:text-gold transition-colors underline decoration-charcoal/20 hover:decoration-gold underline-offset-2"
                aria-label={`View ${city} median price listings`}
              >
                {m.value}
              </button>
            ) : (
              <span className="font-mono tabular-nums text-navy text-sm font-medium">
                {m.value}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
