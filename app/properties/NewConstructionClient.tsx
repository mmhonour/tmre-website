"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type NCListing = {
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
};

type ApiResponse = {
  listings: NCListing[];
  generatedAt: string;
};

type LoadState = "loading" | "ready" | "error";

function fmtMoney(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  return `$${n.toLocaleString()}`;
}

const FALLBACK: NCListing[] = [
  {
    mlsId: "—",
    propertyType: "Single Family For Sale",
    style: "Colonial",
    address: { street: "27 Rowayton Woods Dr", unit: "", city: "Norwalk", state: "CT", postalCode: "06853", full: "27 Rowayton Woods Dr, Norwalk, CT 06853" },
    price: 1195000,
    beds: 4,
    baths: 3,
    sqft: 3240,
    yearBuilt: 2024,
    dom: 6,
    photoCount: 32,
    status: "Active",
    ownerName: null,
  },
  {
    mlsId: "—",
    propertyType: "Single Family For Sale",
    style: "Contemporary",
    address: { street: "311 Hillspoint Rd", unit: "", city: "Westport", state: "CT", postalCode: "06880", full: "311 Hillspoint Rd, Westport, CT 06880" },
    price: 2950000,
    beds: 5,
    baths: 5,
    sqft: 5100,
    yearBuilt: 2025,
    dom: 4,
    photoCount: 48,
    status: "Active",
    ownerName: null,
  },
  {
    mlsId: "—",
    propertyType: "Single Family For Sale",
    style: "Modern",
    address: { street: "42 Oldfield Rd", unit: "", city: "Fairfield", state: "CT", postalCode: "06824", full: "42 Oldfield Rd, Fairfield, CT 06824" },
    price: 895000,
    beds: 3,
    baths: 3,
    sqft: 2450,
    yearBuilt: 2024,
    dom: 9,
    photoCount: 24,
    status: "Active",
    ownerName: null,
  },
];

export default function NewConstructionClient() {
  const [listings, setListings] = useState<NCListing[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [usedFallback, setUsedFallback] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/listings/new-construction", { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<ApiResponse>;
      })
      .then((d) => {
        if (cancelled) return;
        setListings(d.listings.length ? d.listings : FALLBACK);
        if (!d.listings.length) setUsedFallback(true);
        setState("ready");
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("[new-construction] fetch failed", err);
        setListings(FALLBACK);
        setUsedFallback(true);
        setState("ready");
      });
    return () => { cancelled = true; };
  }, []);

  return (
    <>
      <section className="navy-gradient text-white pt-24 pb-10 lg:pt-40 lg:pb-24 relative overflow-hidden">
        <div className="absolute inset-0 hero-grid opacity-40" aria-hidden />
        <div className="relative mx-auto max-w-7xl px-6 lg:px-10">
          <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold mb-3 animate-fade-up">
            New Construction
          </p>
          <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl text-white leading-[1.05] max-w-3xl animate-fade-up">
            Built from the ground{" "}
            <span className="italic gold-shimmer">up.</span>
          </h1>
          <p className="mt-4 text-base lg:text-lg text-white/70 max-w-xl leading-relaxed animate-fade-up-delay-1">
            New construction across Norwalk, Westport, Wilton, and Fairfield — sourced
            live from SmartMLS and scored by TMRE.
          </p>
          <div className="mt-6 flex items-center gap-2 font-mono text-xs">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                state === "loading"
                  ? "bg-gold animate-pulse-dot"
                  : usedFallback
                  ? "bg-coral"
                  : "bg-sage animate-pulse-dot"
              }`}
            />
            <span className="text-white/50">
              {state === "loading"
                ? "Loading listings…"
                : usedFallback
                ? "Cached · MLS feed offline"
                : `${listings.length} active listings · Live SmartMLS`}
            </span>
          </div>
        </div>
      </section>

      <section className="bg-cream py-10 lg:py-20">
        <div className="mx-auto max-w-7xl px-6 lg:px-10">
          {state === "loading" ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="rounded-2xl bg-white border border-charcoal/[0.06] p-5 lg:p-7 h-72 animate-pulse"
                />
              ))}
            </div>
          ) : listings.length === 0 ? (
            <div className="text-center py-24">
              <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-slate mb-3">
                No listings found
              </p>
              <p className="text-charcoal/70">
                No active new construction was found in the MLS right now. Check back soon.
              </p>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6">
              {listings.map((l) => (
                <ListingCard key={l.mlsId + l.address.full} listing={l} />
              ))}
            </div>
          )}

          <div className="mt-8 lg:mt-12 rounded-2xl bg-navy text-white p-5 sm:p-8 lg:p-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
            <div>
              <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold mb-2">
                TMRE built
              </p>
              <p className="font-serif text-xl italic text-white max-w-xl leading-snug">
                Every property here was designed with the buyer in mind — not
                the builder&rsquo;s margin. If we wouldn&rsquo;t live in it, we don&rsquo;t build it.
              </p>
            </div>
            <a
              href="/investors"
              className="inline-flex items-center gap-2 rounded-full bg-gold px-6 py-3 text-sm font-medium text-navy hover:bg-gold-light hover:shadow-lg hover:shadow-gold/30 transition-all whitespace-nowrap"
            >
              Co-invest with TMRE →
            </a>
          </div>
        </div>
      </section>
    </>
  );
}

function ListingCard({ listing: l }: { listing: NCListing }) {
  const type = l.propertyType
    .replace(/ For Sale$/i, "")
    .replace(/ For Lease$/i, "");
  const specs = [
    l.beds ? `${l.beds}BR` : null,
    l.baths ? `${l.baths}BA` : null,
    l.sqft ? `${l.sqft.toLocaleString()} sqft` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const isNew = l.dom != null && l.dom <= 7;
  const statusLabel = isNew ? "New" : "Active";
  const statusColor = isNew
    ? "bg-sage/10 text-sage border-sage/30"
    : "bg-sky/10 text-sky border-sky/30";

  return (
    <article className="rounded-2xl bg-white border border-charcoal/[0.06] p-5 lg:p-7 transition-all hover:border-gold/40 hover:shadow-xl hover:shadow-navy/5 hover:-translate-y-1 flex flex-col">
      <div className="flex items-start justify-between mb-4 gap-3">
        <div className="min-w-0">
          {l.mlsId && l.mlsId !== "—" ? (
            <Link
              href={`/listings/${encodeURIComponent(l.mlsId)}`}
              className="font-medium text-navy text-lg leading-tight truncate hover:text-gold transition-colors block"
            >
              {l.address.street || l.address.full}
            </Link>
          ) : (
            <h3 className="font-medium text-navy text-lg leading-tight truncate">
              {l.address.street || l.address.full}
            </h3>
          )}
          <p className="text-sm text-slate mt-0.5">
            {[l.address.city, l.address.state, l.address.postalCode]
              .filter(Boolean)
              .join(" ")}
          </p>
          <p className="font-mono text-[10px] tracking-[0.15em] uppercase text-slate/70 mt-1.5">
            {[type, l.style, l.yearBuilt ? `Built ${l.yearBuilt}` : null]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <span
          className={`inline-flex items-center font-mono text-[10px] tracking-[0.15em] uppercase border rounded-full px-2.5 py-1 whitespace-nowrap shrink-0 ${statusColor}`}
        >
          {statusLabel}
        </span>
      </div>

      <div className="mt-auto space-y-2.5 pt-4 border-t border-charcoal/[0.06]">
        <Row label="List price" value={fmtMoney(l.price)} accent />
        {l.ownerName && <Row label="Owner of record" value={l.ownerName} />}
        {specs && <Row label="Specs" value={specs} />}
        {l.dom != null && (
          <Row label="Days on market" value={`${l.dom}d`} />
        )}
        {l.photoCount != null && (
          <Row label="Photos" value={String(l.photoCount)} />
        )}
        {l.mlsId !== "—" && (
          <Row label="MLS #" value={l.mlsId} />
        )}
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
