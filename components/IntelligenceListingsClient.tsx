"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  intelligenceListingsHref,
  snapshotListingsTitle,
  type SnapshotListingsStatus,
} from "@/lib/intelligence-url";
import { listingDetailHref, listingPhotoProxyUrl } from "@/lib/listing-url";
import { fmtDate } from "@/lib/listing-history";
import ListingThumbImage from "@/components/ListingThumbImage";
import { prefetchMlsPhotoThumbs } from "@/lib/prefetch-listing-images";
import { listingHoverHandlers } from "@/lib/warm-listing-cache";
import { listingZipMatchesTown, TMRE_TOWNS, type TmreTown } from "@/lib/tmre-towns";

type TxFilter = "all" | "sale" | "rental";
type ClsFilter = "all" | "residential" | "commercial";
type SalePropertyFilter = "all" | "homes" | "multi" | "condos";
type RowStatus = "Active" | "Pending" | "New" | "Reduced" | "Closed";

type ApiListing = {
  mlsId: string;
  listingKey?: string;
  status: string;
  propertyType: string;
  address: {
    street: string;
    full: string;
    city: string;
    postalCode?: string | null;
  };
  price: number | null;
  closeDate?: string | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  yearBuilt: number | null;
  calculated: {
    pricePerSqft: number | null;
    daysOnMarket: number | null;
    priceReductionPercent: number | null;
    goldilocksScore: number | null;
  };
};

type BoardListing = {
  key: string;
  mlsId: string;
  score: number;
  address: string;
  city: string;
  zip: string | null;
  type: string;
  price: number;
  pricePerSqft: number | null;
  sqft: number | null;
  dom: number | null;
  closeDate: string | null;
  status: RowStatus;
  isRental: boolean;
  isCommercial: boolean;
  propertyType: string;
};

function parseTown(value: string | null): TmreTown | null {
  if (!value) return null;
  return TMRE_TOWNS.find((t) => t.toLowerCase() === value.toLowerCase()) ?? null;
}

function parseStatus(value: string | null): SnapshotListingsStatus | null {
  if (value === "new" || value === "reduced" || value === "closed") return value;
  return null;
}

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

function isNewThisWeek(l: BoardListing): boolean {
  return l.dom != null && l.dom <= 7;
}

function mapListings(api: ApiListing[], townName: TmreTown): BoardListing[] {
  return api
    .filter((l) => l.price != null && l.price > 0)
    .map((l) => {
      const rental = isRentalType(l.propertyType);
      const commercial = isCommercialType(l.propertyType);
      return {
        key: l.listingKey || l.mlsId,
        mlsId: l.mlsId,
        score: l.calculated.goldilocksScore ?? 0,
        address: l.address.street || l.address.full,
        city: townName,
        zip: l.address.postalCode ?? null,
        type: [shortType(l.propertyType), l.beds && l.baths ? `${l.beds}bd/${l.baths}ba` : null]
          .filter(Boolean)
          .join(" · "),
        price: l.price!,
        pricePerSqft: rental ? null : l.calculated.pricePerSqft,
        sqft: l.sqft,
        dom: l.calculated.daysOnMarket,
        closeDate: null,
        status: deriveStatus(l),
        isRental: rental,
        isCommercial: commercial,
        propertyType: l.propertyType,
      };
    })
    .filter((l) => listingZipMatchesTown(l.zip, townName));
}

function mapClosedListings(api: ApiListing[], townName: TmreTown): BoardListing[] {
  return api
    .filter((l) => l.price != null && l.price > 0)
    .map((l) => {
      const rental = isRentalType(l.propertyType);
      const commercial = isCommercialType(l.propertyType);
      return {
        key: l.listingKey || l.mlsId,
        mlsId: l.mlsId,
        score: l.calculated.goldilocksScore ?? 0,
        address: l.address.street || l.address.full,
        city: townName,
        zip: l.address.postalCode ?? null,
        type: [shortType(l.propertyType), l.beds && l.baths ? `${l.beds}bd/${l.baths}ba` : null]
          .filter(Boolean)
          .join(" · "),
        price: l.price!,
        pricePerSqft: rental ? null : l.calculated.pricePerSqft,
        sqft: l.sqft,
        dom: l.calculated.daysOnMarket,
        closeDate: l.closeDate ?? null,
        status: "Closed" as RowStatus,
        isRental: rental,
        isCommercial: commercial,
        propertyType: l.propertyType,
      };
    })
    .filter((l) => listingZipMatchesTown(l.zip, townName));
}

function compareCloseDate(a: string | null, b: string | null): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return Date.parse(b) - Date.parse(a);
}

function sortClosedListings(rows: BoardListing[]): BoardListing[] {
  return [...rows].sort((a, b) => compareCloseDate(a.closeDate, b.closeDate));
}

function compareDom(a: number | null, b: number | null): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return a - b;
}

type NewListingsSortKey = "dom" | "price";
type NewListingsSortDir = "asc" | "desc";
type NewListingsSortDirs = Record<NewListingsSortKey, NewListingsSortDir>;

const DEFAULT_NEW_SORT_DIRS: NewListingsSortDirs = { dom: "asc", price: "asc" };

function comparePrice(a: number, b: number): number {
  return a - b;
}

function sortNewListings(
  rows: BoardListing[],
  sortKey: NewListingsSortKey,
  dir: NewListingsSortDir,
): BoardListing[] {
  const mult = dir === "asc" ? 1 : -1;
  if (sortKey === "price") {
    return [...rows].sort((a, b) => mult * comparePrice(a.price, b.price));
  }
  return [...rows].sort((a, b) => mult * compareDom(a.dom, b.dom));
}

function filterListings(
  rows: BoardListing[],
  tx: TxFilter,
  cls: ClsFilter,
  zip: string | null,
  status: SnapshotListingsStatus,
  saleProperty: SalePropertyFilter,
): BoardListing[] {
  return rows.filter((l) => {
    if (tx === "sale" && l.isRental) return false;
    if (tx === "rental" && !l.isRental) return false;
    if (cls === "residential" && l.isCommercial) return false;
    if (cls === "commercial" && !l.isCommercial) return false;
    if (saleProperty !== "all" && !l.isRental && !l.isCommercial) {
      if (saleProperty === "homes" && !isHomePropertyType(l.propertyType)) return false;
      if (saleProperty === "multi" && !isMultiFamilyPropertyType(l.propertyType)) return false;
      if (saleProperty === "condos" && !isCondoPropertyType(l.propertyType)) return false;
    }
    if (zip && l.zip !== zip) return false;
    if (status === "new" && !isNewThisWeek(l)) return false;
    if (status === "reduced" && l.status !== "Reduced") return false;
    return true;
  });
}

function fmtMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  return `$${n.toLocaleString()}`;
}

export default function IntelligenceListingsClient() {
  const searchParams = useSearchParams();
  const city = parseTown(searchParams.get("city"));
  const status = parseStatus(searchParams.get("status"));
  const zip = searchParams.get("zip");
  const tx = (searchParams.get("tx") as TxFilter | null) ?? "all";
  const cls = (searchParams.get("cls") as ClsFilter | null) ?? "all";
  const saleProperty =
    (searchParams.get("property") as SalePropertyFilter | null) ?? "all";

  const [listings, setListings] = useState<BoardListing[]>([]);
  const [newSort, setNewSort] = useState<NewListingsSortKey>("dom");
  const [sortDirs, setSortDirs] = useState<NewListingsSortDirs>(DEFAULT_NEW_SORT_DIRS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const invalidParams = !city || !status;
  const activeSortDir = sortDirs[newSort];

  const sortedListings = useMemo(() => {
    if (status === "closed") return sortClosedListings(listings);
    if (status === "new" || status === "reduced") {
      return sortNewListings(listings, newSort, activeSortDir);
    }
    return [...listings].sort((a, b) => b.score - a.score);
  }, [listings, status, newSort, activeSortDir]);

  function handleNewSortClick(key: NewListingsSortKey) {
    if (newSort === key) {
      setSortDirs((prev) => ({
        ...prev,
        [key]: prev[key] === "asc" ? "desc" : "asc",
      }));
      return;
    }
    setNewSort(key);
  }

  useEffect(() => {
    if (!city || !status) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    const apiUrl =
      status === "closed"
        ? `/api/intelligence/closed-listings?city=${encodeURIComponent(city)}&limit=250`
        : `/api/listings?city=${encodeURIComponent(city)}&status=Active&limit=250`;
    fetch(apiUrl)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as { listings: ApiListing[] };
      })
      .then((body) => {
        if (cancelled) return;
        const mapped =
          status === "closed"
            ? mapClosedListings(body.listings, city)
            : mapListings(body.listings, city);
        const filtered = filterListings(mapped, tx, cls, zip, status, saleProperty);
        setListings(filtered);
        prefetchMlsPhotoThumbs(filtered.map((l) => l.mlsId));
        setNewSort("dom");
        setSortDirs(DEFAULT_NEW_SORT_DIRS);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load listings");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [city, status, zip, tx, cls, saleProperty]);

  const title = useMemo(() => {
    if (!city || !status) return "Listings";
    return snapshotListingsTitle(status, city, zip, tx);
  }, [city, status, zip, tx]);

  const subtitle =
    status === "new"
      ? "Listed within the last 7 days on market"
      : status === "reduced"
        ? "Active listings with a recent price reduction"
        : tx === "rental"
          ? "Leased within the last 7 days"
          : "Closed within the last 7 days";

  return (
    <>
      <section className="navy-gradient text-white pt-20 pb-8 lg:pt-28 lg:pb-12 relative overflow-hidden">
        <div className="absolute inset-0 hero-grid opacity-40" aria-hidden />
        <div className="relative mx-auto max-w-7xl px-6 lg:px-10">
          <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold mb-3 animate-fade-up">
            <Link href="/intelligence" className="hover:text-gold-light transition-colors">
              Market Intelligence
            </Link>
            {" · Snapshot"}
          </p>
          <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl text-white leading-[1.05] max-w-4xl animate-fade-up">
            {invalidParams ? (
              "Listings"
            ) : loading ? (
              <>
                Loading{" "}
                <span className="italic gold-shimmer">listings…</span>
              </>
            ) : (
              <>
                {sortedListings.length}{" "}
                <span className="italic gold-shimmer">
                  {sortedListings.length === 1 ? "listing" : "listings"}.
                </span>
              </>
            )}
          </h1>
          {!invalidParams && (
            <p className="mt-4 text-sm lg:text-base text-white/70 max-w-2xl leading-relaxed animate-fade-up-delay-1">
              {title}
              {" — "}
              {subtitle}.
            </p>
          )}
          <div className="mt-6 animate-fade-up-delay-2">
            <Link
              href="/intelligence"
              className="inline-flex items-center gap-2 font-mono text-[11px] tracking-[0.15em] uppercase text-gold hover:text-gold-light transition-colors"
            >
              ← Back to deal board
            </Link>
          </div>
        </div>
      </section>

      <section className="bg-cream py-10 lg:py-16">
        <div className="mx-auto max-w-7xl px-6 lg:px-10">
          {invalidParams ? (
            <div className="text-center py-24">
              <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-slate mb-3">
                Invalid link
              </p>
              <p className="text-charcoal/70 mb-6">
                Choose a town snapshot on Intelligence and open new, reduced, or closed listings from there.
              </p>
              <Link
                href="/intelligence"
                className="font-mono text-[11px] tracking-[0.15em] uppercase text-gold hover:text-navy transition-colors"
              >
                Go to Intelligence →
              </Link>
            </div>
          ) : loading ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="rounded-2xl bg-white border border-charcoal/[0.06] h-72 animate-pulse"
                />
              ))}
            </div>
          ) : error ? (
            <div className="text-center py-24">
              <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-coral mb-3">
                Could not load listings
              </p>
              <p className="text-charcoal/70">{error}</p>
            </div>
          ) : sortedListings.length === 0 ? (
            <div className="text-center py-24">
              <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-slate mb-3">
                No listings match
              </p>
              <p className="text-charcoal/70 mb-6">
                Nothing in {city}
                {zip ? ` ${zip}` : ""} matches this snapshot filter right now.
              </p>
              {city && status ? (
                <Link
                  href={intelligenceListingsHref({ city, status, zip, tx, cls, saleProperty })}
                  className="font-mono text-[11px] tracking-[0.15em] uppercase text-gold hover:text-navy transition-colors mr-4"
                >
                  Refresh
                </Link>
              ) : null}
              <Link
                href="/intelligence"
                className="font-mono text-[11px] tracking-[0.15em] uppercase text-gold hover:text-navy transition-colors"
              >
                Back to Intelligence →
              </Link>
            </div>
          ) : (
            <>
              {(status === "new" || status === "reduced") && (
                <div className="mb-6 flex flex-wrap items-center gap-3">
                  <span className="font-mono text-[10px] tracking-[0.12em] uppercase text-slate">
                    Sort by
                  </span>
                  <div className="inline-flex rounded-full border border-charcoal/[0.08] bg-white p-0.5">
                    {(
                      [
                        { key: "dom", label: "DOM" },
                        { key: "price", label: "Price" },
                      ] as const
                    ).map(({ key, label }) => {
                      const active = newSort === key;
                      const dir = sortDirs[key];
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => handleNewSortClick(key)}
                          className={`inline-flex items-center gap-1 rounded-full px-4 py-1.5 font-mono text-[10px] tracking-[0.12em] uppercase transition-colors ${
                            active
                              ? "bg-navy text-white"
                              : "text-slate hover:text-navy"
                          }`}
                          aria-pressed={active}
                          aria-sort={
                            active
                              ? dir === "asc"
                                ? "ascending"
                                : "descending"
                              : "none"
                          }
                        >
                          {label}
                          {active ? (
                            <span className="text-[9px] tabular-nums" aria-hidden>
                              {dir === "asc" ? "↑" : "↓"}
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6">
                {sortedListings.map((l) => (
                  <ListingCard key={l.key} listing={l} status={status!} />
                ))}
              </div>
            </>
          )}
        </div>
      </section>
    </>
  );
}

function ListingCard({
  listing: l,
  status,
}: {
  listing: BoardListing;
  status: SnapshotListingsStatus;
}) {
  const detailHref = listingDetailHref(l.mlsId, l.address, l.city);
  const photoSrc = listingPhotoProxyUrl(l.mlsId, 0);
  const scoreColor =
    l.score >= 85 ? "text-sage" : l.score >= 70 ? "text-gold" : "text-charcoal/60";
  const closedLabel = l.isRental ? "Leased" : "Closed";
  const statusLabel =
    status === "new"
      ? l.dom != null
        ? `${l.dom}d on market`
        : "New this week"
      : status === "closed"
        ? l.closeDate && fmtDate(l.closeDate)
          ? `${closedLabel} ${fmtDate(l.closeDate)}`
          : closedLabel
        : "Price reduced";

  return (
    <article
      {...listingHoverHandlers(l.mlsId)}
      className="rounded-2xl bg-white border border-charcoal/[0.08] overflow-hidden transition-all hover:border-gold/40 hover:shadow-xl hover:shadow-navy/5 hover:-translate-y-1 flex flex-col"
    >
      <Link href={detailHref} className="relative block aspect-[16/10] bg-cream overflow-hidden">
        <ListingThumbImage
          src={photoSrc}
          className="absolute inset-0 block w-full h-full"
          imgClassName="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute top-3 left-3 font-mono text-[10px] tracking-[0.12em] uppercase bg-navy text-white px-2.5 py-1 rounded-full">
          {statusLabel}
        </div>
        {status !== "closed" && l.score > 0 ? (
          <div
            className={`absolute top-3 right-3 font-mono text-sm tabular-nums font-semibold bg-white/95 px-2.5 py-1 rounded-full shadow-sm ${scoreColor}`}
          >
            {l.score.toFixed(1)}
          </div>
        ) : null}
      </Link>

      <div className="p-5 flex flex-col flex-1">
        <Link
          href={detailHref}
          className="font-medium text-navy text-base leading-tight hover:text-gold transition-colors"
        >
          {l.address}
        </Link>
        <p className="text-sm text-slate mt-1">
          {l.city}
          {l.zip ? ` · ${l.zip}` : ""}
        </p>
        <p className="font-mono text-[10px] tracking-[0.12em] uppercase text-slate/70 mt-2">
          {l.type}
        </p>

        <div className="mt-4 pt-4 border-t border-charcoal/[0.06] flex items-end justify-between gap-3">
          <div>
            <p className="font-mono text-[9px] tracking-[0.15em] uppercase text-slate/60 mb-1">
              {status === "closed"
                ? l.isRental
                  ? "Lease"
                  : "Sold"
                : l.isRental
                  ? "Rent"
                  : "Price"}
            </p>
            <p className="font-mono text-xl tabular-nums text-navy">
              {fmtMoney(l.price)}
              {l.isRental ? "/mo" : ""}
            </p>
          </div>
          <div className="text-right">
            <p className="font-mono text-[9px] tracking-[0.15em] uppercase text-slate mb-1">
              {status === "closed" ? (l.isRental ? "Leased" : "Closed") : "DOM"}
            </p>
            <p className="font-mono text-sm tabular-nums text-navy">
              {status === "closed"
                ? fmtDate(l.closeDate) ?? "—"
                : l.dom != null
                  ? `${l.dom}d`
                  : "—"}
            </p>
          </div>
        </div>
      </div>
    </article>
  );
}
