"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import DealOfTheDayFrame from "@/components/DealOfTheDayFrame";
import { usePersonalizedTowns } from "@/hooks/usePersonalizedTowns";
import { formatTownList, listingInTmreCoverage, listingZipMatchesTown, normalizeTownName, TMRE_TOWNS, townForZip, type TmreTown } from "@/lib/tmre-towns";
import { countListingsByTown } from "@/lib/town-listing-counts";
import TownFilterPills from "@/components/TownFilterPills";
import {
  filterPillButtonClass,
  filterPillContainerClass,
  filterPillSeparatorClass,
} from "@/lib/filter-pill-styles";
import { listingDetailHref } from "@/lib/listing-url";
import { usePersistedFilter } from "@/hooks/usePersistedFilter";

const FIXER_TOWN_VALUES = ["All", ...TMRE_TOWNS] as const;
const FIXER_CATEGORY_VALUES = ["all", "projects", "land"] as const;

type FixerCategory = "fixer" | "teardown" | "land" | "build-site";

type FixerListing = {
  mlsId: string;
  propertyType: string;
  style: string;
  address: {
    street: string;
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
  lotAcres: number | null;
  pricePerSqft: number | null;
  matchedKeywords: string[];
  category: FixerCategory;
  fixerScore: number;
  headline: string;
};

type ApiResponse = {
  listings: FixerListing[];
  generatedAt: string;
  totalScanned: number;
};

type LoadState = "loading" | "ready";
type TownFilter = "All" | TmreTown;
type CategoryFilter = "all" | "projects" | "land";

const TOWN_NAMES = TMRE_TOWNS;

const PROJECT_CATEGORIES: FixerCategory[] = ["fixer", "teardown", "build-site"];

const CATEGORY_FILTERS: { value: CategoryFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "projects", label: "Fixer · Teardown · Build" },
  { value: "land", label: "Land" },
];

const CATEGORY_LABELS: Record<FixerCategory, string> = {
  fixer: "Fixer upper",
  teardown: "Teardown",
  land: "Land",
  "build-site": "Build site",
};

function fmtMoney(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  return `$${n.toLocaleString()}`;
}

const FALLBACK: FixerListing[] = [
  {
    mlsId: "—",
    propertyType: "Single Family For Sale",
    style: "Cape",
    address: {
      street: "14 Harbor View Rd",
      city: "Norwalk",
      state: "CT",
      postalCode: "06855",
      full: "",
    },
    price: 425000,
    beds: 3,
    baths: 1,
    sqft: 1180,
    yearBuilt: 1952,
    dom: 68,
    photoCount: 8,
    status: "Active",
    lotAcres: 0.62,
    pricePerSqft: 360,
    matchedKeywords: ["handyman special", "needs work"],
    category: "fixer",
    fixerScore: 72,
    headline: "Handyman special — priced for the work ahead",
  },
  {
    mlsId: "—",
    propertyType: "Lots/Land For Sale",
    style: "",
    address: {
      street: "0 Greens Farms Rd",
      city: "Westport",
      state: "CT",
      postalCode: "06880",
      full: "",
    },
    price: 890000,
    beds: null,
    baths: null,
    sqft: null,
    yearBuilt: null,
    dom: 41,
    photoCount: 4,
    status: "Active",
    lotAcres: 1.14,
    pricePerSqft: null,
    matchedKeywords: ["tear down"],
    category: "teardown",
    fixerScore: 81,
    headline: "Teardown or demolition candidate — build from scratch",
  },
];

export default function FixerUppersClient() {
  const [allListings, setAllListings] = useState<FixerListing[]>([]);
  const [totalScanned, setTotalScanned] = useState(0);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [usedFallback, setUsedFallback] = useState(false);
  const [townFilter, setTownFilter] = usePersistedFilter<TownFilter>(
    "tmre_fixer_town",
    "All",
    FIXER_TOWN_VALUES,
  );
  const [categoryFilter, setCategoryFilter] = usePersistedFilter<CategoryFilter>(
    "tmre_fixer_cat",
    "all",
    FIXER_CATEGORY_VALUES,
  );
  const orderedTowns = usePersonalizedTowns(TOWN_NAMES);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/listings/fixer-uppers", { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<ApiResponse>;
      })
      .then((d) => {
        if (cancelled) return;
        setAllListings(d.listings.length ? d.listings : FALLBACK);
        setTotalScanned(d.totalScanned ?? 0);
        if (!d.listings.length) setUsedFallback(true);
        setLoadState("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setAllListings(FALLBACK);
        setUsedFallback(true);
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
    if (categoryFilter === "projects") {
      result = result.filter((l) => PROJECT_CATEGORIES.includes(l.category));
    } else if (categoryFilter === "land") {
      result = result.filter((l) => l.category === "land");
    }
    return result;
  }, [allListings, townFilter, categoryFilter]);

  const townCounts = useMemo(
    () => countListingsByTown(allListings, { requireCoverage: true }),
    [allListings],
  );

  const avgAcres = useMemo(() => {
    const acres = listings.map((l) => l.lotAcres).filter((a): a is number => a != null && a > 0);
    if (!acres.length) return null;
    return acres.reduce((a, b) => a + b, 0) / acres.length;
  }, [listings]);

  return (
    <>
      <section className="navy-gradient text-white pt-20 pb-8 lg:pt-28 lg:pb-12 relative overflow-hidden">
        <div className="absolute inset-0 hero-grid opacity-40" aria-hidden />
        <div className="relative mx-auto max-w-7xl px-6 lg:px-10">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6 lg:gap-10 mb-5">
            <div className="min-w-0">
              <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold mb-3 animate-fade-up">
                Fixer Uppers / Demolitions
              </p>
              <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl text-white leading-[1.05] max-w-3xl animate-fade-up">
                Build on the{" "}
                <span className="italic gold-shimmer">lot.</span>
              </h1>
            </div>
            <div className="animate-fade-up-delay-1 lg:pt-6">
              <DealOfTheDayFrame />
            </div>
          </div>

          <p className="text-sm lg:text-base text-white/70 max-w-2xl leading-relaxed animate-fade-up-delay-1">
            Handyman specials, teardowns, and under-finished homes at low price points —
            with acreage worth building on across {formatTownList(TOWN_NAMES)}.
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-3 animate-fade-up-delay-2">
            <TownFilterPills
              towns={orderedTowns}
              selected={townFilter}
              onSelect={setTownFilter}
              counts={loadState === "ready" ? townCounts : undefined}
            />

            <div className={`hidden sm:block ${filterPillSeparatorClass()}`} aria-hidden />

            <div className={filterPillContainerClass()}>
              {CATEGORY_FILTERS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => setCategoryFilter(f.value)}
                  aria-pressed={categoryFilter === f.value}
                  className={filterPillButtonClass(categoryFilter === f.value)}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2 font-mono text-xs">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                loadState === "loading"
                  ? "bg-gold animate-pulse-dot"
                  : usedFallback
                    ? "bg-coral"
                    : "bg-sage animate-pulse-dot"
              }`}
            />
            <span className="text-white/50">
              {loadState === "loading"
                ? "Scanning active listings…"
                : usedFallback
                  ? "Cached · feed offline"
                  : `${allListings.length} fixer candidates · ${totalScanned.toLocaleString()} scanned · Live`}
            </span>
          </div>

          {loadState === "ready" && (
            <div className="mt-8 flex items-end justify-between gap-6 flex-wrap">
              <div>
                <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold mb-2">
                  Opportunities{townFilter !== "All" ? ` · ${townFilter}` : ""}
                </p>
                <h2 className="font-serif text-2xl sm:text-3xl text-white">
                  {listings.length}{" "}
                  <span className="italic">
                    {listings.length === 1 ? "property" : "properties"} to reimagine.
                  </span>
                </h2>
              </div>

              <div className="rounded-xl bg-white/5 border border-white/10 px-5 py-3 text-right min-w-[140px]">
                <p className="font-mono text-[9px] tracking-[0.2em] uppercase text-white/40 mb-1">
                  Avg lot size
                </p>
                <p className="font-mono text-2xl tabular-nums font-medium text-gold">
                  {avgAcres != null ? `${avgAcres.toFixed(2)} ac` : "—"}
                </p>
                <p className="font-mono text-[8px] text-white/25 mt-1">
                  Where acreage is disclosed
                </p>
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="bg-cream py-10 lg:py-16">
        <div className="mx-auto max-w-7xl px-6 lg:px-10">
          {loadState === "loading" ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="rounded-2xl bg-white border border-charcoal/[0.06] p-5 h-80 animate-pulse"
                />
              ))}
            </div>
          ) : listings.length === 0 ? (
            <div className="text-center py-24">
              <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-slate mb-3">
                No listings found
              </p>
              <p className="text-charcoal/70">
                No fixer or teardown opportunities match this filter right now. Try All Towns or a
                different category.
              </p>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6">
              {listings.map((l) => (
                <ListingCard
                  key={l.mlsId + l.address.full + l.address.street}
                  listing={l}
                />
              ))}
            </div>
          )}

          <div className="mt-8 lg:mt-12 rounded-2xl bg-navy text-white p-5 sm:p-8 lg:p-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
            <div>
              <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold mb-2">
                Build with TMRE
              </p>
              <p className="font-serif text-xl text-white max-w-xl leading-snug">
                From teardown to new construction — we help investors and builders find the lot
                before the market catches up.
              </p>
            </div>
            <Link
              href="/intelligence"
              className="inline-flex items-center gap-2 rounded-full bg-gold px-6 py-3 text-sm font-medium text-navy hover:bg-gold-light hover:shadow-lg hover:shadow-gold/30 transition-all whitespace-nowrap"
            >
              See more deals →
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

function useFirstPhoto(mlsId: string | null): string | null {
  const [photo, setPhoto] = useState<string | null>(null);
  useEffect(() => {
    if (!mlsId || mlsId === "—") return;
    fetch(`/api/listings/${encodeURIComponent(mlsId)}/photo`, { cache: "default" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { url?: string | null } | null) => {
        if (d?.url) setPhoto(d.url);
      })
      .catch(() => {});
  }, [mlsId]);
  return photo;
}

function ListingCard({ listing: l }: { listing: FixerListing }) {
  const photo = useFirstPhoto(l.mlsId);
  const type = l.propertyType.replace(/ For Sale$/i, "").replace(/ For Lease$/i, "");
  const specs = [
    l.beds ? `${l.beds}BR` : null,
    l.baths ? `${l.baths}BA` : null,
    l.sqft ? `${l.sqft.toLocaleString()} sqft` : null,
    l.lotAcres != null ? `${l.lotAcres.toFixed(2)} ac` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const categoryColor =
    l.category === "teardown"
      ? "bg-coral/10 text-coral border-coral/30"
      : l.category === "build-site" || l.category === "land"
        ? "bg-gold/10 text-gold border-gold/30"
        : "bg-sky/10 text-sky border-sky/30";

  return (
    <article className="rounded-2xl bg-white border border-charcoal/[0.08] p-5 lg:p-6 transition-all hover:border-gold/40 hover:shadow-xl hover:shadow-navy/5 hover:-translate-y-1 flex flex-col">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          {l.mlsId && l.mlsId !== "—" ? (
            <Link
              href={listingDetailHref(l.mlsId, l.address.street || l.address.full)}
              className="font-medium text-navy text-base leading-tight hover:text-gold transition-colors block"
            >
              {l.address.street || l.address.full}
            </Link>
          ) : (
            <h3 className="font-medium text-navy text-base leading-tight">
              {l.address.street || l.address.full}
            </h3>
          )}
          <p className="text-sm text-slate mt-0.5">
            {[l.address.city, l.address.state, l.address.postalCode].filter(Boolean).join(" ")}
          </p>
        </div>

        <div className="flex flex-col items-end gap-2 shrink-0">
          <span
            className={`inline-flex items-center font-mono text-[10px] tracking-[0.15em] uppercase border rounded-full px-2.5 py-1 whitespace-nowrap ${categoryColor}`}
          >
            {CATEGORY_LABELS[l.category]}
          </span>
          <div className="w-16 h-12 rounded-lg overflow-hidden border border-charcoal/10 bg-cream">
            {photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photo} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <svg
                  className="w-5 h-5 text-navy/20"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1}
                    d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
                  />
                </svg>
              </div>
            )}
          </div>
        </div>
      </div>

      <p className="text-sm text-charcoal/80 leading-snug mb-4">{l.headline}</p>

      {l.matchedKeywords.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {l.matchedKeywords.slice(0, 3).map((k) => (
            <span
              key={k}
              className="font-mono text-[9px] tracking-wide uppercase px-2 py-0.5 rounded-full bg-cream text-slate border border-charcoal/10"
            >
              {k}
            </span>
          ))}
        </div>
      )}

      <div className="mt-auto space-y-2.5 pt-4 border-t border-charcoal/[0.06]">
        <Row label="List price" value={fmtMoney(l.price)} accent />
        <Row
          label="Opportunity score"
          value={l.fixerScore.toFixed(0)}
          accent={false}
        />
        {specs && <Row label="Specs" value={specs} />}
        {l.pricePerSqft != null && (
          <Row label="$ / sqft" value={`$${Math.round(l.pricePerSqft)}`} />
        )}
        {l.yearBuilt != null && <Row label="Year built" value={String(l.yearBuilt)} />}
        {l.dom != null && <Row label="Days on market" value={`${l.dom}d`} />}
        <Row label="Type" value={[type, l.style].filter(Boolean).join(" · ") || "—"} />
      </div>
    </article>
  );
}

function Row({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="font-mono text-[10px] tracking-[0.15em] uppercase text-slate shrink-0">
        {label}
      </dt>
      <dd
        className={`font-mono tabular-nums text-right ${
          accent ? "text-navy font-medium text-base" : "text-charcoal text-sm"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
