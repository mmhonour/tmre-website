"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePersonalizedTowns } from "@/hooks/usePersonalizedTowns";
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
  filterPillSeparatorClass,
  type FilterPillTheme,
} from "@/lib/filter-pill-styles";
import { listingDetailHref } from "@/lib/listing-url";
import ListingThumbImage from "@/components/ListingThumbImage";
import { listingHoverHandlers } from "@/lib/warm-listing-cache";
import { isRentalListing } from "@/lib/listing-kind";
import { usePersistedFilter } from "@/hooks/usePersistedFilter";

const EL_TOWN_VALUES = ["All", ...TMRE_TOWNS] as const;
const EL_AGE_VALUES = ["all", "30-90", "90plus"] as const;
const EL_TX_VALUES = ["all", "sale", "rental"] as const;
const EL_VIEW_VALUES = ["grid", "rows", "line"] as const;
const EL_PRICE_SORT_VALUES = ["asc", "desc"] as const;

type ViewMode = (typeof EL_VIEW_VALUES)[number];

type ExpiredListing = {
  mlsId: string;
  propertyType: string;
  style: string;
  address: {
    street: string;
    unit: string;
    city: string;
    state: string;
    postalCode: string;
    full: string;
  };
  price: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  yearBuilt: number | null;
  dom: number | null;
  photoCount: number | null;
  status: string;
  ownerName: string | null;
  expiredDays: number | null;
  statusChangeTimestamp: string | null;
};

type ApiResponse = {
  listings: ExpiredListing[];
  generatedAt: string;
  minAgeDays: number;
  source?: "db" | "rets";
};
type LoadState = "loading" | "ready";
type AgeFilter = (typeof EL_AGE_VALUES)[number];
type TxFilter = (typeof EL_TX_VALUES)[number];

const TOWN_NAMES = TMRE_TOWNS;
type TownName = TmreTown;
type TownFilter = "All" | TownName;

function fmtMoney(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  return `$${n.toLocaleString()}`;
}

const AGE_FILTERS: { value: AgeFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "30-90", label: "30–90d" },
  { value: "90plus", label: "90+ days" },
];

const TX_FILTERS: { value: TxFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "sale", label: "For Sale" },
  { value: "rental", label: "Rental" },
];

function isElRental(l: ExpiredListing): boolean {
  return isRentalListing({ propertyType: l.propertyType });
}

function matchesAgeFilter(l: ExpiredListing, filter: AgeFilter): boolean {
  const days = l.expiredDays;
  if (days == null) return filter === "all";
  if (filter === "30-90") return days >= 30 && days < 90;
  if (filter === "90plus") return days >= 90;
  return true;
}

const PHOTO_PREVIEW_HEIGHT = "h-[5.67rem]";
const PHOTO_PREVIEW_GRID = "h-[8.51rem]";
const PHOTO_PREVIEW_ROWS = `${PHOTO_PREVIEW_HEIGHT} w-[7.8rem]`;
const PHOTO_PREVIEW_LINE = "h-[2.7rem] w-[3.6rem]";

function ElFilterBar({
  theme,
  className = "",
  txFilter,
  setTxFilter,
  ageFilter,
  setAgeFilter,
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
  ageFilter: AgeFilter;
  setAgeFilter: (value: AgeFilter) => void;
  townFilter: TownFilter;
  setTownFilter: (value: TownFilter) => void;
  orderedTowns: readonly TownName[];
  townCounts: Partial<Record<TownFilter | TownName, number>>;
  loadState: LoadState;
}) {
  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      <div className="flex flex-wrap items-center gap-3">
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

        <div className={`hidden sm:block ${filterPillSeparatorClass("compact", theme)}`} aria-hidden />

        <div className={filterPillContainerClass("compact", { wrap: false, theme })}>
          {AGE_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setAgeFilter(f.value)}
              aria-pressed={ageFilter === f.value}
              className={filterPillButtonClass(ageFilter === f.value, "compact", theme)}
            >
              {f.label}
            </button>
          ))}
        </div>
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
        className="w-full min-w-0"
      />
    </div>
  );
}

export default function ExpiredListingsClient() {
  const [allListings, setAllListings] = useState<ExpiredListing[]>([]);
  const [minAgeDays, setMinAgeDays] = useState(30);
  const [dataSource, setDataSource] = useState<"db" | "rets" | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [fetchError, setFetchError] = useState(false);
  const [ageFilter, setAgeFilter] = usePersistedFilter<AgeFilter>(
    "tmre_el_age",
    "all",
    EL_AGE_VALUES,
  );
  const [townFilter, setTownFilter] = usePersistedFilter<TownFilter>(
    "tmre_el_town",
    "All",
    EL_TOWN_VALUES,
  );
  const [txFilter, setTxFilter] = usePersistedFilter<TxFilter>(
    "tmre_el_tx",
    "all",
    EL_TX_VALUES,
  );
  const [priceSortDir, setPriceSortDir] = usePersistedFilter<
    (typeof EL_PRICE_SORT_VALUES)[number]
  >("tmre_el_price_sort", "asc", EL_PRICE_SORT_VALUES);
  const [viewMode, setViewMode] = usePersistedFilter<ViewMode>(
    "tmre_el_view",
    "grid",
    EL_VIEW_VALUES,
  );
  const orderedTowns = usePersonalizedTowns(TOWN_NAMES);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/listings/expired")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<ApiResponse>;
      })
      .then((d) => {
        if (cancelled) return;
        setAllListings(d.listings);
        setMinAgeDays(d.minAgeDays ?? 30);
        setDataSource(d.source ?? null);
        setLoadState("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setFetchError(true);
        setLoadState("ready");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const listings = useMemo(() => {
    let result = allListings.filter((l) =>
      listingInTmreCoverage(l.address.postalCode, l.address.city),
    );
    if (txFilter === "sale") result = result.filter((l) => !isElRental(l));
    if (txFilter === "rental") result = result.filter(isElRental);
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
    if (ageFilter !== "all") {
      result = result.filter((l) => matchesAgeFilter(l, ageFilter));
    }
    return result;
  }, [allListings, ageFilter, townFilter, txFilter]);

  const displayListings = useMemo(() => {
    if (viewMode === "grid") return listings;
    const mult = priceSortDir === "asc" ? 1 : -1;
    return [...listings].sort((a, b) => {
      const pa = a.price ?? (priceSortDir === "asc" ? Infinity : -Infinity);
      const pb = b.price ?? (priceSortDir === "asc" ? Infinity : -Infinity);
      return mult * (pa - pb);
    });
  }, [listings, priceSortDir, viewMode]);

  const townCounts = useMemo(() => {
    let pool = allListings.filter((l) =>
      listingInTmreCoverage(l.address.postalCode, l.address.city),
    );
    if (txFilter === "sale") pool = pool.filter((l) => !isElRental(l));
    if (txFilter === "rental") pool = pool.filter(isElRental);
    return countListingsByTown(pool, { requireCoverage: true });
  }, [allListings, txFilter]);

  const ageFilterLabel =
    ageFilter === "30-90" ? "30–90 days expired" : ageFilter === "90plus" ? "90+ days expired" : null;

  return (
    <>
      <section className="navy-gradient text-white pt-20 pb-8 lg:pt-28 lg:pb-12 relative overflow-hidden">
        <div className="absolute inset-0 hero-grid opacity-40" aria-hidden />
        <div className="relative mx-auto max-w-7xl px-6 lg:px-10">
          <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold mb-3 animate-fade-up">
            Expired Listings
          </p>
          <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl text-white leading-[1.05] max-w-3xl animate-fade-up">
            Off-market{" "}
            <span className="italic gold-shimmer">opportunities,</span>{" "}
            <span className="italic text-white/85">waiting to resurface.</span>
          </h1>
          <p className="mt-3 text-sm lg:text-base text-white/70 max-w-xl leading-relaxed animate-fade-up-delay-1">
            MLS listings expired for {minAgeDays}+ days across {formatTownList(TOWN_NAMES)} — synced to local cache from SmartMLS.
          </p>

          <ElFilterBar
            theme="dark"
            className="mt-5 animate-fade-up-delay-2"
            txFilter={txFilter}
            setTxFilter={setTxFilter}
            ageFilter={ageFilter}
            setAgeFilter={setAgeFilter}
            townFilter={townFilter}
            setTownFilter={setTownFilter}
            orderedTowns={orderedTowns}
            townCounts={townCounts}
            loadState={loadState}
          />

          <div className="mt-4 flex items-center gap-2 font-mono text-xs">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                loadState === "loading"
                  ? "bg-gold animate-pulse-dot"
                  : fetchError
                    ? "bg-coral"
                    : "bg-sage animate-pulse-dot"
              }`}
            />
            <span className="text-white/50">
              {loadState === "loading"
                ? "Loading listings…"
                : fetchError
                  ? "Feed offline · try again later"
                  : `${allListings.length} expired listings · ${dataSource === "db" ? "Local cache" : dataSource === "rets" ? "Live RETS" : "SmartMLS"}`}
            </span>
          </div>

          {loadState === "ready" && (
            <div className="mt-8 flex items-end justify-between gap-6 flex-wrap">
              <div>
                <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold mb-2">
                  Expired Listings{townFilter !== "All" ? ` · ${townFilter}` : ""}
                </p>
                <h2 className="font-serif text-2xl sm:text-3xl text-white">
                  {listings.length}{" "}
                  <span className="italic">
                    {ageFilterLabel ?? "total"}{" "}
                    {listings.length === 1 ? "listing" : "listings"}.
                  </span>
                </h2>
              </div>

              <div className="rounded-xl bg-white/5 border border-white/10 px-5 py-3 text-right min-w-[140px]">
                <p className="font-mono text-[9px] tracking-[0.2em] uppercase text-white/40 mb-1">
                  Min age
                </p>
                <p className="font-mono text-2xl tabular-nums font-medium text-gold">
                  {minAgeDays}d
                </p>
                <p className="font-mono text-[8px] text-white/25 mt-1">
                  Since MLS expiry
                </p>
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="bg-cream py-10 lg:py-16">
        <div className="mx-auto max-w-7xl px-6 lg:px-10">
          {loadState === "loading" ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="rounded-xl bg-white border border-charcoal/[0.06] p-3 h-52 animate-pulse"
                />
              ))}
            </div>
          ) : listings.length === 0 ? (
            <div className="text-center py-24">
              <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-slate mb-3">
                No listings found
              </p>
              <p className="text-charcoal/70">
                {fetchError
                  ? "Could not reach the MLS feed. Please refresh to try again."
                  : `No expired listings${ageFilterLabel ? ` (${ageFilterLabel})` : ""} match your filters right now.`}
              </p>
            </div>
          ) : (
            <>
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3 min-h-8">
                  {viewMode === "rows" || viewMode === "line" ? (
                    <>
                      <span className="font-mono text-[10px] tracking-[0.12em] uppercase text-slate">
                        Sort by
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setPriceSortDir(priceSortDir === "asc" ? "desc" : "asc")
                        }
                        className="inline-flex items-center gap-1 rounded-full border border-charcoal/[0.08] bg-white px-3 py-1.5 font-mono text-[10px] tracking-[0.12em] uppercase text-navy transition-colors hover:border-gold/40"
                        aria-sort={priceSortDir === "asc" ? "ascending" : "descending"}
                      >
                        Price
                        <span className="text-[9px] tabular-nums" aria-hidden>
                          {priceSortDir === "asc" ? "↑" : "↓"}
                        </span>
                      </button>
                    </>
                  ) : null}
                </div>
                <ViewModeToggle value={viewMode} onChange={setViewMode} />
              </div>
              {viewMode === "line" ? (
                <div className="flex flex-col rounded-xl border border-charcoal/[0.08] bg-white overflow-hidden">
                  <div className="flex items-center gap-2.5 px-3 py-2 border-b border-charcoal/[0.08] bg-cream/60 font-mono text-[9px] tracking-[0.12em] uppercase text-slate">
                    <div className={`${PHOTO_PREVIEW_LINE} shrink-0`} aria-hidden />
                    <span className="min-w-0 flex-1">Property</span>
                    <button
                      type="button"
                      onClick={() =>
                        setPriceSortDir(priceSortDir === "asc" ? "desc" : "asc")
                      }
                      className="inline-flex items-center gap-1 shrink-0 text-navy hover:text-gold transition-colors"
                      aria-sort={priceSortDir === "asc" ? "ascending" : "descending"}
                    >
                      Price
                      <span className="tabular-nums" aria-hidden>
                        {priceSortDir === "asc" ? "↑" : "↓"}
                      </span>
                    </button>
                  </div>
                  <div className="flex flex-col divide-y divide-charcoal/[0.08]">
                    {displayListings.map((l) => (
                      <ListingCard
                        key={l.mlsId + l.address.full + l.address.street}
                        listing={l}
                        view={viewMode}
                      />
                    ))}
                  </div>
                </div>
              ) : (
                <div
                  className={
                    viewMode === "grid"
                      ? "grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3"
                      : "flex flex-col gap-3"
                  }
                >
                  {displayListings.map((l) => (
                    <ListingCard
                      key={l.mlsId + l.address.full + l.address.street}
                      listing={l}
                      view={viewMode}
                    />
                  ))}
                </div>
              )}
            </>
          )}

          <div className="mt-8 lg:mt-12 rounded-2xl bg-navy text-white p-5 sm:p-8 lg:p-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
            <div>
              <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold mb-2">
                TMRE insight
              </p>
              <p className="font-serif text-xl text-white max-w-xl leading-snug">
                Expired listings often signal motivated sellers — reach out before they relist or withdraw.
              </p>
            </div>
            <Link
              href="/new-construction"
              className="inline-flex items-center gap-2 rounded-full bg-gold px-6 py-3 text-sm font-medium text-navy hover:bg-gold-light hover:shadow-lg hover:shadow-gold/30 transition-all whitespace-nowrap"
            >
              View active new construction →
            </Link>
          </div>
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

function listingMeta(l: ExpiredListing) {
  const isRental = isElRental(l);
  const type = l.propertyType.replace(/ For Sale$/i, "").replace(/ For Lease$/i, "");
  const specs = [
    l.beds ? `${l.beds}BR` : null,
    l.baths ? `${l.baths}BA` : null,
    l.sqft ? `${l.sqft.toLocaleString()} sqft` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const statusLabel = l.expiredDays != null ? `Expired · ${l.expiredDays}d` : "Expired";
  const statusColor = "bg-coral/90 text-white border-coral/90";
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
  const expiredLabel =
    l.expiredDays != null ? `${l.expiredDays}d since expiry` : "Expired";

  return {
    isRental,
    specs,
    statusLabel,
    statusColor,
    detailHref,
    place,
    subtype,
    priceLabel,
    priceValue,
    expiredLabel,
  };
}

function useFirstPhoto(mlsId: string | null): string | null {
  const [photo, setPhoto] = useState<string | null>(null);

  useEffect(() => {
    if (!mlsId || mlsId === "—") {
      setPhoto(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/listings/${encodeURIComponent(mlsId)}/photo`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { url?: string | null } | null) => {
        if (!cancelled && d?.url) setPhoto(d.url);
      })
      .catch(() => {
        if (!cancelled) setPhoto(null);
      });
    return () => {
      cancelled = true;
    };
  }, [mlsId]);

  return photo;
}

function ListingPhoto({
  listing: l,
  photo,
  className = "",
  iconClass = "w-8 h-8",
  priority = true,
  alignTop = false,
}: {
  listing: ExpiredListing;
  photo: string | null;
  className?: string;
  iconClass?: string;
  priority?: boolean;
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
      priority={priority}
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

function StatusBadge({
  label,
  colorClass,
  compact = false,
}: {
  label: string;
  colorClass: string;
  compact?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center font-mono tracking-[0.12em] uppercase border rounded-full whitespace-nowrap ${colorClass} ${
        compact ? "text-[8px] px-1.5 py-0.5" : "text-[9px] px-2 py-0.5"
      }`}
    >
      {label}
    </span>
  );
}

function ViewModeToggle({
  value,
  onChange,
}: {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
}) {
  const btn = "inline-flex h-8 w-8 items-center justify-center transition-colors disabled:opacity-40";
  const active = "bg-navy text-white";
  const idle = "text-navy/55 hover:text-navy hover:bg-charcoal/[0.04]";

  return (
    <div
      className="inline-flex items-center rounded-full border border-charcoal/[0.08] bg-white p-0.5"
      role="group"
      aria-label="Listing layout"
    >
      <button
        type="button"
        aria-label="Grid view"
        aria-pressed={value === "grid"}
        title="Grid"
        onClick={() => onChange("grid")}
        className={`${btn} rounded-full ${value === "grid" ? active : idle}`}
      >
        <GridViewIcon />
      </button>
      <button
        type="button"
        aria-label="Row view"
        aria-pressed={value === "rows"}
        title="Rows"
        onClick={() => onChange("rows")}
        className={`${btn} rounded-full ${value === "rows" ? active : idle}`}
      >
        <RowsViewIcon />
      </button>
      <button
        type="button"
        aria-label="Compact list view"
        aria-pressed={value === "line"}
        title="Compact list"
        onClick={() => onChange("line")}
        className={`${btn} rounded-full ${value === "line" ? active : idle}`}
      >
        <LineViewIcon />
      </button>
    </div>
  );
}

function GridViewIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <rect x="1" y="1" width="6" height="6" rx="1" />
      <rect x="9" y="1" width="6" height="6" rx="1" />
      <rect x="1" y="9" width="6" height="6" rx="1" />
      <rect x="9" y="9" width="6" height="6" rx="1" />
    </svg>
  );
}

function RowsViewIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <rect x="1" y="2" width="5" height="4" rx="0.75" />
      <rect x="7" y="2.5" width="8" height="1.25" rx="0.5" />
      <rect x="7" y="4.25" width="6" height="1" rx="0.5" opacity="0.55" />
      <rect x="1" y="8" width="5" height="4" rx="0.75" />
      <rect x="7" y="8.5" width="8" height="1.25" rx="0.5" />
      <rect x="7" y="10.25" width="6" height="1" rx="0.5" opacity="0.55" />
    </svg>
  );
}

function LineViewIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <rect x="1" y="3" width="2" height="2" rx="0.4" />
      <rect x="4" y="3.35" width="11" height="1.3" rx="0.5" />
      <rect x="1" y="7" width="2" height="2" rx="0.4" />
      <rect x="4" y="7.35" width="11" height="1.3" rx="0.5" />
      <rect x="1" y="11" width="2" height="2" rx="0.4" />
      <rect x="4" y="11.35" width="11" height="1.3" rx="0.5" />
    </svg>
  );
}

function ListingCard({ listing: l, view }: { listing: ExpiredListing; view: ViewMode }) {
  const ownerDisplay = useOwnerLookup(l.address.city, l.address.street, l.ownerName);
  const meta = listingMeta(l);
  const photo = useFirstPhoto(l.mlsId !== "—" ? l.mlsId : null);

  if (view === "line") {
    return (
      <article
        {...listingHoverHandlers(l.mlsId !== "—" ? l.mlsId : null)}
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
          <span className="font-mono text-[10px] tabular-nums text-navy font-medium">{meta.priceValue}</span>
          {meta.specs ? <span className="font-mono text-[9px] text-slate/60">{meta.specs}</span> : null}
          <StatusBadge label={meta.statusLabel} colorClass={meta.statusColor} compact />
        </div>
      </article>
    );
  }

  if (view === "rows") {
    return (
      <article
        {...listingHoverHandlers(l.mlsId !== "—" ? l.mlsId : null)}
        className="flex gap-3 rounded-xl bg-white border border-charcoal/[0.08] p-3 transition-all hover:border-gold/40 hover:shadow-md hover:shadow-navy/5"
      >
        <div
          className={`relative ${PHOTO_PREVIEW_ROWS} shrink-0 overflow-hidden rounded-lg border border-charcoal/[0.06] bg-cream`}
        >
          <ListingPhoto listing={l} photo={photo} alignTop />
          <span className="absolute top-1.5 left-1.5">
            <StatusBadge label={meta.statusLabel} colorClass={meta.statusColor} compact />
          </span>
        </div>
        <div className="min-w-0 flex-1 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="min-w-0 flex-1">
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
            <p className="font-mono text-[9px] tracking-[0.12em] uppercase text-slate/60 mt-1 truncate">
              {meta.subtype}
            </p>
            {meta.specs ? <p className="font-mono text-[10px] text-slate/70 mt-1">{meta.specs}</p> : null}
          </div>
          <div className="shrink-0 sm:text-right sm:min-w-[7.5rem]">
            <p className="font-mono text-[9px] tracking-[0.12em] uppercase text-slate/60">{meta.priceLabel}</p>
            <p className="font-mono text-sm tabular-nums text-navy font-medium">{meta.priceValue}</p>
            <p className="font-mono text-[9px] text-slate/55 mt-1 truncate max-w-[10rem] sm:max-w-none">
              {ownerDisplay}
            </p>
            <p className="font-mono text-[9px] text-slate/50 mt-0.5">{meta.expiredLabel}</p>
          </div>
        </div>
      </article>
    );
  }

  return (
    <article
      {...listingHoverHandlers(l.mlsId !== "—" ? l.mlsId : null)}
      className="rounded-xl bg-white border border-charcoal/[0.08] overflow-hidden transition-all hover:border-gold/40 hover:shadow-lg hover:shadow-navy/5 hover:-translate-y-0.5 flex flex-col"
    >
      <div className={`relative ${PHOTO_PREVIEW_GRID} w-full bg-cream border-b border-charcoal/[0.06]`}>
        <ListingPhoto listing={l} photo={photo} alignTop />
        <span className="absolute top-2 left-2">
          <StatusBadge label={meta.statusLabel} colorClass={meta.statusColor} />
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
          <Row label={meta.isRental ? "Monthly rent" : "List price"} value={meta.priceValue} accent compact />
          <Row label="Owner" value={ownerDisplay} compact />
          {meta.specs ? <Row label="Specs" value={meta.specs} compact /> : null}
          <Row label="Expired" value={meta.expiredLabel} compact />
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
              ? "text-navy font-medium text-sm"
              : "text-navy font-medium text-base"
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
