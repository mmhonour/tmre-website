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
  type FilterPillTheme,
} from "@/lib/filter-pill-styles";
import { listingDetailHref, listingPhotoProxyUrl } from "@/lib/listing-url";
import ListingThumbImage from "@/components/ListingThumbImage";
import { listingHoverHandlers } from "@/lib/warm-listing-cache";
import { isRentalListing } from "@/lib/listing-kind";
import { usePersistedFilter } from "@/hooks/usePersistedFilter";
import {
  formatOpenHouseWhen,
  type OpenHouseEvent,
  type OpenHouseListing,
} from "@/lib/open-houses";

const OH_TOWN_VALUES = ["All", ...TMRE_TOWNS] as const;
const OH_TX_VALUES = ["all", "sale", "rental"] as const;
const OH_VIEW_VALUES = ["grid", "rows", "line"] as const;
const OH_SORT_VALUES = ["date", "price-asc", "price-desc"] as const;

type ViewMode = (typeof OH_VIEW_VALUES)[number];
type TxFilter = "all" | "sale" | "rental";
type SortMode = (typeof OH_SORT_VALUES)[number];
type TownName = TmreTown;
type TownFilter = "All" | TownName;

type ApiResponse = {
  listings: OpenHouseListing[];
  generatedAt: string;
  window: { start: string; end: string };
  windowLabel: string;
};

type LoadState = "loading" | "ready";

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

const PHOTO_PREVIEW_HEIGHT = "h-[5.67rem]";
const PHOTO_PREVIEW_GRID = "h-[8.51rem]";
const PHOTO_PREVIEW_ROWS = `${PHOTO_PREVIEW_HEIGHT} w-[7.8rem]`;
const PHOTO_PREVIEW_LINE = "h-[2.7rem] w-[3.6rem]";

function OhFilterBar({
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
    <div className={`flex flex-col gap-3 ${className}`}>
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
        className="w-full min-w-0"
      />
    </div>
  );
}

export default function OpenHousesClient() {
  const [allListings, setAllListings] = useState<OpenHouseListing[]>([]);
  const [windowLabel, setWindowLabel] = useState("");
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [townFilter, setTownFilter] = usePersistedFilter<TownFilter>(
    "tmre_oh_town",
    "All",
    OH_TOWN_VALUES,
  );
  const [txFilter, setTxFilter] = usePersistedFilter<TxFilter>(
    "tmre_oh_tx",
    "all",
    OH_TX_VALUES,
  );
  const [sortMode, setSortMode] = usePersistedFilter<SortMode>(
    "tmre_oh_sort",
    "date",
    OH_SORT_VALUES,
  );
  const [viewMode, setViewMode] = usePersistedFilter<ViewMode>(
    "tmre_oh_view",
    "grid",
    OH_VIEW_VALUES,
  );
  const orderedTowns = usePersonalizedTowns(TOWN_NAMES);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/listings/open-houses")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<ApiResponse>;
      })
      .then((d) => {
        if (cancelled) return;
        setAllListings(d.listings);
        setWindowLabel(d.windowLabel);
        setLoadState("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setAllListings([]);
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
    return result;
  }, [allListings, townFilter, txFilter]);

  const displayListings = useMemo(() => {
    if (sortMode === "date") {
      return [...listings].sort((a, b) => {
        const dateCmp = a.nextOpenHouse.date.localeCompare(b.nextOpenHouse.date);
        if (dateCmp !== 0) return dateCmp;
        return (a.nextOpenHouse.startDateTime ?? "").localeCompare(
          b.nextOpenHouse.startDateTime ?? "",
        );
      });
    }
    const mult = sortMode === "price-asc" ? 1 : -1;
    return [...listings].sort((a, b) => {
      const pa = a.price ?? (sortMode === "price-asc" ? Infinity : -Infinity);
      const pb = b.price ?? (sortMode === "price-asc" ? Infinity : -Infinity);
      return mult * (pa - pb);
    });
  }, [listings, sortMode]);

  const townCounts = useMemo(() => {
    let pool = allListings.filter((l) =>
      listingInTmreCoverage(l.address.postalCode, l.address.city),
    );
    if (txFilter === "sale") pool = pool.filter((l) => !isOhRental(l));
    if (txFilter === "rental") pool = pool.filter(isOhRental);
    return countListingsByTown(pool, { requireCoverage: true });
  }, [allListings, txFilter]);

  return (
    <>
      <section className="navy-gradient text-white pt-20 pb-8 lg:pt-28 lg:pb-12 relative overflow-hidden">
        <div className="absolute inset-0 hero-grid opacity-40" aria-hidden />
        <div className="relative mx-auto max-w-7xl px-6 lg:px-10">
          <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold mb-3 animate-fade-up">
            Open Houses
          </p>
          <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl text-white leading-[1.05] max-w-3xl animate-fade-up">
            Walk through the door{" "}
            <span className="italic gold-shimmer">this week.</span>
          </h1>
          <p className="mt-3 text-sm lg:text-base text-white/70 max-w-xl leading-relaxed animate-fade-up-delay-1">
            Public open houses across {formatTownList(TOWN_NAMES)} in the next 7 calendar days.
          </p>

          <OhFilterBar
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

          <div className="mt-4 flex items-center gap-2 font-mono text-xs">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                loadState === "loading"
                  ? "bg-gold animate-pulse-dot"
                  : "bg-sage animate-pulse-dot"
              }`}
            />
            <span className="text-white/50">
              {loadState === "loading"
                ? "Loading open houses…"
                : `${allListings.length} upcoming · ${windowLabel || "next 7 days (ET)"}`}
            </span>
          </div>

          {loadState === "ready" && (
            <div className="mt-8">
              <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold mb-2">
                Open Houses{townFilter !== "All" ? ` · ${townFilter}` : ""}
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
                No open houses found
              </p>
              <p className="text-charcoal/70">
                No public open houses scheduled in the next 7 days
                {townFilter !== "All" ? ` in ${townFilter}` : ""}. Try another town or check back
                soon.
              </p>
            </div>
          ) : (
            <>
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3 min-h-8">
                  <span className="font-mono text-[10px] tracking-[0.12em] uppercase text-slate">
                    Sort by
                  </span>
                  <button
                    type="button"
                    onClick={() => setSortMode("date")}
                    className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 font-mono text-[10px] tracking-[0.12em] uppercase transition-colors ${
                      sortMode === "date"
                        ? "border-gold/50 bg-gold/10 text-navy"
                        : "border-charcoal/[0.08] bg-white text-navy hover:border-gold/40"
                    }`}
                  >
                    Date
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setSortMode(sortMode === "price-asc" ? "price-desc" : "price-asc")
                    }
                    className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 font-mono text-[10px] tracking-[0.12em] uppercase transition-colors ${
                      sortMode !== "date"
                        ? "border-gold/50 bg-gold/10 text-navy"
                        : "border-charcoal/[0.08] bg-white text-navy hover:border-gold/40"
                    }`}
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
                <ViewModeToggle value={viewMode} onChange={setViewMode} />
              </div>

              {viewMode === "line" ? (
                <div className="flex flex-col rounded-xl border border-charcoal/[0.08] bg-white overflow-hidden">
                  <div className="flex items-center gap-2.5 px-3 py-2 border-b border-charcoal/[0.08] bg-cream/60 font-mono text-[9px] tracking-[0.12em] uppercase text-slate">
                    <div className={`${PHOTO_PREVIEW_LINE} shrink-0`} aria-hidden />
                    <span className="min-w-0 flex-1">Property</span>
                    <span className="shrink-0">Open house</span>
                    <span className="shrink-0">Price</span>
                  </div>
                  <div className="flex flex-col divide-y divide-charcoal/[0.08]">
                    {displayListings.map((l) => (
                      <ListingCard key={l.mlsId + l.address.street} listing={l} view={viewMode} />
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
                    <ListingCard key={l.mlsId + l.address.street} listing={l} view={viewMode} />
                  ))}
                </div>
              )}
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
  const moreCount = l.openHouses.length > 1 ? l.openHouses.length - 1 : 0;

  return {
    isRental,
    specs,
    detailHref,
    place,
    subtype,
    priceLabel,
    priceValue,
    ohLabel,
    moreCount,
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

function OpenHouseBadge({ label, compact = false }: { label: string; compact?: boolean }) {
  return (
    <span
      className={`inline-flex items-center font-mono tracking-[0.12em] uppercase border rounded-full whitespace-nowrap bg-gold text-navy border-gold ${
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
  const btn =
    "inline-flex h-8 w-8 items-center justify-center transition-colors disabled:opacity-40";
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

function OpenHouseSchedule({ events }: { events: OpenHouseEvent[] }) {
  if (events.length <= 1) return null;
  return (
    <ul className="mt-1 space-y-0.5">
      {events.slice(1, 4).map((e) => (
        <li key={e.id} className="font-mono text-[9px] text-slate/60">
          {formatOpenHouseWhen(e)}
        </li>
      ))}
      {events.length > 4 ? (
        <li className="font-mono text-[9px] text-slate/45">+{events.length - 4} more</li>
      ) : null}
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
          <span className="font-mono text-[9px] text-gold-dark">{meta.ohLabel}</span>
          <span className="font-mono text-[10px] tabular-nums text-navy font-medium">
            {meta.priceValue}
          </span>
        </div>
      </article>
    );
  }

  if (view === "rows") {
    return (
      <article
        {...listingHoverHandlers(l.mlsId)}
        className="flex gap-3 rounded-xl bg-white border border-charcoal/[0.08] p-3 transition-all hover:border-gold/40 hover:shadow-md hover:shadow-navy/5"
      >
        <div
          className={`relative ${PHOTO_PREVIEW_ROWS} shrink-0 overflow-hidden rounded-lg border border-charcoal/[0.06] bg-cream`}
        >
          <ListingPhoto listing={l} photo={photo} alignTop />
          <span className="absolute top-1.5 left-1.5">
            <OpenHouseBadge label="Open" compact />
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
            <p className="font-mono text-[10px] text-gold-dark mt-1">{meta.ohLabel}</p>
            {meta.moreCount > 0 ? (
              <p className="font-mono text-[9px] text-slate/55">
                +{meta.moreCount} more showing{meta.moreCount === 1 ? "" : "s"}
              </p>
            ) : null}
            <OpenHouseSchedule events={l.openHouses} />
          </div>
          <div className="shrink-0 sm:text-right sm:min-w-[7.5rem]">
            <p className="font-mono text-[9px] tracking-[0.12em] uppercase text-slate/60">
              {meta.priceLabel}
            </p>
            <p className="font-mono text-sm tabular-nums text-navy font-medium">{meta.priceValue}</p>
            <p className="font-mono text-[9px] text-slate/55 mt-1 truncate max-w-[10rem] sm:max-w-none">
              {ownerDisplay}
            </p>
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
        <span className="absolute top-2 left-2">
          <OpenHouseBadge label="Open house" />
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
          <Row label="Next open" value={meta.ohLabel} accent compact />
          {meta.moreCount > 0 ? (
            <Row
              label="Also"
              value={`${meta.moreCount} more showing${meta.moreCount === 1 ? "" : "s"}`}
              compact
            />
          ) : null}
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
