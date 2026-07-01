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
import { usePersistedFilter } from "@/hooks/usePersistedFilter";
import MedianPriceListingsTable, {
  type MedianListingRow,
} from "./MedianPriceListingsTable";

const SalesTrendChart = dynamic(() => import("./SalesTrendChart"), { ssr: false });
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
  const [listingPool, setListingPool] = useState<ListingPool>(
    urlPool === "active" ? "active" : "closed",
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
  const [tableMode, setTableMode] = useState<"median" | "price-band">("median");
  const [priceBand, setPriceBand] = useState<{ id: string; label: string } | null>(null);
  const [priceBandRows, setPriceBandRows] = useState<MedianListingRow[]>([]);
  const [priceBandPeriod, setPriceBandPeriod] = useState<string | null>(null);
  const [priceBandLoadState, setPriceBandLoadState] = useState<LoadState>("ready");
  const [selectedPriceBucketId, setSelectedPriceBucketId] = useState<string | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);
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
    setTableMode("median");
    setSelectedPriceBucketId(null);
    setPriceBand(null);
    setPriceBandRows([]);
  }, [selectedCity, statsKind]);

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
  }, [statsKind]);

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
  const heroMedian = selectedCity === "All" ? null : selectedStats?.medianPrice ?? null;
  const heroDom = selectedCity === "All" ? null : selectedStats?.avgDaysOnMarket ?? null;

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

  return (
    <>
      <section className="navy-gradient text-white pt-20 pb-8 lg:pt-28 lg:pb-12 relative overflow-hidden">
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
                {heroActive.toLocaleString()}
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

      <section className="bg-cream py-10 lg:py-16">
        <div className="mx-auto max-w-7xl px-6 lg:px-10">
          <div
            className={`lg:grid lg:gap-8 lg:items-start ${
              selectedCity === "All" ? "lg:grid-cols-[1fr_272px]" : "lg:grid-cols-[1fr_256px]"
            }`}
          >
            <div className="space-y-10 min-w-0">
              <SalesTrendChart
                key={`trend-${statsKind}-${selectedCity}`}
                city={selectedCity}
                kind={statsKind}
              />

              <VintageSalesChart
                key={`vintage-${statsKind}-${selectedCity}`}
                city={selectedCity}
                kind={statsKind}
              />

              <PriceSalesChart
                key={`price-${statsKind}-${selectedCity}`}
                city={selectedCity}
                kind={statsKind}
                selectedBucketId={selectedPriceBucketId}
                onBucketClick={showPriceBandDetail}
              />

              {selectedCity === "All" && (
                <div>
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
                                {loadState === "loading" ? "…" : d.activeCount.toLocaleString()}
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
                <div>
                  <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-slate mb-4">
                    {medianLabel} by town
                  </p>
                  <MedianPriceBarChart
                    key={`median-bar-${statsKind}`}
                    data={medianChartData}
                    loading={loadState === "loading"}
                    onTownClick={(town) => showMedianDetail(town)}
                    kind={statsKind}
                  />
                </div>
              )}

              {selectedCity === "All" && (
                <div>
                  <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-slate mb-4">
                    Avg days on market — lower is faster
                  </p>
                  <AvgDomLineChart
                    key={`dom-${statsKind}`}
                    data={domChartData}
                    loading={loadState === "loading"}
                    kind={statsKind}
                  />
                </div>
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
              className={`mb-10 lg:mb-0 lg:sticky lg:top-24 lg:self-start lg:shrink-0 space-y-4 ${
                selectedCity === "All"
                  ? "max-h-[calc(100vh-6.5rem)] overflow-y-auto pr-1"
                  : ""
              }`}
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
    </>
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
      value: loading ? "…" : safe.activeCount.toLocaleString(),
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
      <p className={`font-mono text-[10px] tracking-[0.2em] uppercase mb-1 ${ACCENT[city]}`}>
        {city}, CT
      </p>
      <p className="font-serif text-xl text-navy mb-4">Market snapshot</p>
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
