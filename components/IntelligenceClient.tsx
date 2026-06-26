"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import ZipBoundaryPopover from "./ZipBoundaryPopover";

type TxFilter = "all" | "sale" | "rental";
type ClsFilter = "all" | "residential" | "commercial";

const TX_COOKIE = "tmre_tx";
const CLS_COOKIE = "tmre_cls";
const PREF_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.split("=")[1]) : null;
}

function writeCookie(name: string, value: string): void {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=${encodeURIComponent(
    value,
  )}; Path=/; Max-Age=${PREF_COOKIE_MAX_AGE}; SameSite=Lax`;
}

type RowStatus = "Active" | "Pending" | "New" | "Reduced";

type DisplayListing = {
  key: string;
  score: number;
  address: string;
  type: string;
  price: number;
  pricePerSqft: number | null;
  sqft: number | null;
  dom: number | null;
  status: RowStatus;
  isRental: boolean;
  isCommercial: boolean;
  headline: string;
  zip: string | null;
};

type CitySnapshot = {
  city: "Norwalk" | "Westport" | "Wilton" | "Fairfield";
  tagline: string;
  metrics: { label: string; value: string; trend: string; tone: "up" | "down" | "flat" }[];
  listings: DisplayListing[];
};

const MOCK_FALLBACK: CitySnapshot[] = [
  {
    city: "Norwalk",
    tagline: "Premium-velocity market · 1.7 months supply",
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
      { key: "m1", score: 9.2, address: "27 Rowayton Woods Dr", type: "SFR", price: 695000, pricePerSqft: 378, sqft: 1840, dom: 4, status: "New", isRental: false, isCommercial: false, headline: "Top-block Rowayton — rarely available", zip: "06853" },
      { key: "m2", score: 8.6, address: "14 Devil's Garden Rd", type: "SFR", price: 769000, pricePerSqft: 364, sqft: 2110, dom: 9, status: "Active", isRental: false, isCommercial: false, headline: "Contemporary design, recently updated", zip: "06851" },
      { key: "m3", score: 8.1, address: "62 Camp St", type: "Multi-2", price: 815000, pricePerSqft: 312, sqft: 2615, dom: 6, status: "Active", isRental: false, isCommercial: false, headline: "Multi-family with income-producing units", zip: "06854" },
      { key: "m4", score: 7.4, address: "118 Newtown Ave", type: "SFR", price: 599000, pricePerSqft: 401, sqft: 1495, dom: 18, status: "Reduced", isRental: false, isCommercial: false, headline: "Generous layout on established street", zip: "06851" },
      { key: "m5", score: 6.8, address: "9 Cedar Crest Pl", type: "Condo", price: 449000, pricePerSqft: 396, sqft: 1135, dom: 22, status: "Active", isRental: false, isCommercial: false, headline: "Low-maintenance living in prime location", zip: "06850" },
    ],
  },
  {
    city: "Westport",
    tagline: "Trophy-tier inventory · 2.1 months supply",
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
      { key: "m6", score: 9.0, address: "42 Cross Hwy", type: "SFR", price: 1690000, pricePerSqft: 532, sqft: 3178, dom: 5, status: "New", isRental: false, isCommercial: false, headline: "Trophy Westport location — rarely available", zip: "06880" },
      { key: "m7", score: 8.4, address: "311 Hillspoint Rd", type: "SFR", price: 2150000, pricePerSqft: 504, sqft: 4270, dom: 7, status: "Active", isRental: false, isCommercial: false, headline: "Grand scale with exceptional living space", zip: "06880" },
      { key: "m8", score: 7.9, address: "8 Compo Beach Rd", type: "SFR", price: 2895000, pricePerSqft: 568, sqft: 5095, dom: 11, status: "Active", isRental: false, isCommercial: false, headline: "Premium beach proximity — rare lot", zip: "06880" },
      { key: "m9", score: 7.2, address: "47 Sylvan Rd S", type: "SFR", price: 1395000, pricePerSqft: 462, sqft: 3020, dom: 14, status: "Reduced", isRental: false, isCommercial: false, headline: "Updated interiors on quiet established street", zip: "06838" },
    ],
  },
  {
    city: "Wilton",
    tagline: "Upscale residential enclave · 2.4 months supply",
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
      { key: "mw1", score: 9.1, address: "34 Olmstead Hill Rd", type: "SFR", price: 1195000, pricePerSqft: 448, sqft: 2670, dom: 4, status: "New", isRental: false, isCommercial: false, headline: "Just hit the market — fresh listing", zip: "06897" },
      { key: "mw2", score: 8.5, address: "11 Belden Hill Rd", type: "SFR", price: 1490000, pricePerSqft: 412, sqft: 3618, dom: 8, status: "Active", isRental: false, isCommercial: false, headline: "Grand scale with exceptional living space", zip: "06897" },
      { key: "mw3", score: 7.8, address: "77 River Rd", type: "SFR", price: 895000, pricePerSqft: 385, sqft: 2325, dom: 13, status: "Active", isRental: false, isCommercial: false, headline: "Classic character with thoughtful updates", zip: "06897" },
      { key: "mw4", score: 7.2, address: "203 Ridgefield Rd", type: "SFR", price: 1025000, pricePerSqft: 402, sqft: 2550, dom: 21, status: "Reduced", isRental: false, isCommercial: false, headline: "Generous layout on established street", zip: "06897" },
    ],
  },
  {
    city: "Fairfield",
    tagline: "Balanced Fairfield County market · 1.9 months supply",
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
      { key: "m10", score: 8.8, address: "42 Oldfield Rd", type: "SFR", price: 875000, pricePerSqft: 412, sqft: 2124, dom: 3, status: "New", isRental: false, isCommercial: false, headline: "Just hit the market — fresh listing", zip: "06824" },
      { key: "m11", score: 8.2, address: "155 Black Rock Tpke", type: "SFR", price: 699000, pricePerSqft: 368, sqft: 1900, dom: 8, status: "Active", isRental: false, isCommercial: false, headline: "Contemporary design, recently updated", zip: "06825" },
      { key: "m12", score: 7.8, address: "89 Reef Rd", type: "SFR", price: 1195000, pricePerSqft: 448, sqft: 2668, dom: 11, status: "Active", isRental: false, isCommercial: false, headline: "Oversized layout, rare for the street", zip: "06824" },
      { key: "m13", score: 7.1, address: "18 Hillside Rd", type: "SFR", price: 795000, pricePerSqft: 395, sqft: 2013, dom: 19, status: "Reduced", isRental: false, isCommercial: false, headline: "Generous layout on established street", zip: "06824" },
      { key: "m14", score: 6.9, address: "244 Southport Beach Rd", type: "SFR", price: 1495000, pricePerSqft: 522, sqft: 2864, dom: 16, status: "Active", isRental: false, isCommercial: false, headline: "Premium beach proximity — rare lot", zip: "06890" },
    ],
  },
];

type ApiListing = {
  mlsId: string;
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
  if (l.status.toLowerCase() === "pending") return "Pending";
  const reduced = (l.calculated.priceReductionPercent ?? 0) > 1;
  const isNew = (l.calculated.daysOnMarket ?? 99) <= 7;
  if (reduced) return "Reduced";
  if (isNew) return "New";
  return "Active";
}


function buildHeadline(l: ApiListing, rental: boolean): string {
  const dom = l.calculated.daysOnMarket;
  const isMulti = /multi/i.test(l.propertyType);
  const isCondo = /condo|co-op/i.test(l.propertyType);
  const isNewBuild = l.yearBuilt != null && l.yearBuilt >= 2020;
  const isRecentBuild = l.yearBuilt != null && l.yearBuilt >= 2015;
  const isVintage = l.yearBuilt != null && l.yearBuilt <= 1940;

  if (dom != null && dom <= 3) return "Just hit the market — fresh listing";
  if (isNewBuild && !rental) return "Brand-new build, modern finishes throughout";
  if (isNewBuild && rental) return "Modern build, designer finishes";
  if (isMulti && !rental) return "Multi-family with income-producing units";
  if (l.sqft != null && l.sqft >= 4500) return "Grand scale with exceptional living space";
  if (l.sqft != null && l.sqft >= 3500) return "Oversized layout, rare for the street";
  if (isRecentBuild) return "Contemporary design, recently updated";
  if (l.beds != null && l.beds >= 5) return "Rare five-bedroom layout";
  if (l.beds != null && l.beds >= 4) return "Four-bedroom layout, ideal for families";
  if (isCondo) return "Low-maintenance living in prime location";
  if (l.sqft != null && l.sqft >= 2500) return "Generously proportioned throughout";
  if (isVintage) return "Classic character with thoughtful updates";
  if (rental && l.sqft != null && l.sqft >= 2200) return "Exceptionally spacious for the neighborhood";
  if (rental) return "Turn-key rental in high-demand corridor";
  if (dom != null && dom <= 14) return "High-demand street — rarely available";
  return "Standout pick in its class";
}

function scoreListing(l: ApiListing): number {
  let s = 6.5;
  const dom = l.calculated.daysOnMarket;
  const cut = l.calculated.priceReductionPercent;
  if (dom != null && dom <= 7) s += 1.5;
  else if (dom != null && dom <= 21) s += 0.7;
  else if (dom != null && dom > 60) s -= 1.0;
  if (cut != null && cut >= 5) s += 1.0;
  if (cut != null && cut >= 10) s += 0.5;
  if (l.beds && l.beds >= 3 && l.baths && l.baths >= 2) s += 0.3;
  return Math.max(0, Math.min(9.9, Math.round(s * 10) / 10));
}

function mapListings(api: ApiListing[]): DisplayListing[] {
  return api
    .filter((l) => l.price != null && l.price > 0)
    .map((l) => {
      const rental = isRentalType(l.propertyType);
      const commercial = isCommercialType(l.propertyType);
      return {
        key: l.mlsId,
        score: scoreListing(l),
        address: l.address.street || l.address.full,
        type: [shortType(l.propertyType), l.beds && l.baths ? `${l.beds}bd/${l.baths}ba` : null]
          .filter(Boolean)
          .join(" · "),
        price: l.price!,
        pricePerSqft: rental ? null : l.calculated.pricePerSqft,
        sqft: l.sqft,
        dom: l.calculated.daysOnMarket,
        status: deriveStatus(l),
        isRental: rental,
        isCommercial: commercial,
        headline: buildHeadline(l, rental),
        zip: l.address.postalCode ?? null,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);
}

async function fetchCity(city: "Norwalk" | "Westport" | "Wilton" | "Fairfield"): Promise<DisplayListing[]> {
  const res = await fetch(`/api/listings?city=${city}&status=Active&limit=100`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = (await res.json()) as ApiResponse;
  const onlyCity = body.listings.filter(
    (l) => (l.address.city || "").trim().toLowerCase() === city.toLowerCase(),
  );
  return mapListings(onlyCity);
}

type LoadState = "loading" | "ready" | "fallback";

export default function IntelligenceClient() {
  const [active, setActive] = useState<"Norwalk" | "Westport" | "Wilton" | "Fairfield">("Norwalk");
  const [byCity, setByCity] = useState<Record<"Norwalk" | "Westport" | "Wilton" | "Fairfield", DisplayListing[] | null>>({
    Norwalk: null,
    Westport: null,
    Wilton: null,
    Fairfield: null,
  });
  const [state, setState] = useState<LoadState>("loading");
  const [tx, setTx] = useState<TxFilter>("all");
  const [cls, setCls] = useState<ClsFilter>("all");
  const [zip, setZip] = useState<string | null>(null);
  const [hoveredZip, setHoveredZip] = useState<string | null>(null);
  const [hoveredZipEl, setHoveredZipEl] = useState<HTMLElement | null>(null);
  const [scoreInfoOpen, setScoreInfoOpen] = useState(false);
  const [prefsHydrated, setPrefsHydrated] = useState(false);

  useEffect(() => {
    const t = readCookie(TX_COOKIE);
    const c = readCookie(CLS_COOKIE);
    if (t === "all" || t === "sale" || t === "rental") setTx(t);
    if (c === "all" || c === "residential" || c === "commercial") setCls(c);
    setPrefsHydrated(true);
  }, []);

  useEffect(() => {
    if (prefsHydrated) writeCookie(TX_COOKIE, tx);
  }, [tx, prefsHydrated]);

  useEffect(() => {
    if (prefsHydrated) writeCookie(CLS_COOKIE, cls);
  }, [cls, prefsHydrated]);

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    Promise.all([fetchCity("Norwalk"), fetchCity("Westport"), fetchCity("Wilton"), fetchCity("Fairfield")])
      .then(([nor, wes, wil, fai]) => {
        if (cancelled) return;
        setByCity({ Norwalk: nor, Westport: wes, Wilton: wil, Fairfield: fai });
        setState("ready");
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("[intelligence] live fetch failed, using fallback", err);
        setByCity({
          Norwalk: MOCK_FALLBACK[0].listings,
          Westport: MOCK_FALLBACK[1].listings,
          Wilton: MOCK_FALLBACK[2].listings,
          Fairfield: MOCK_FALLBACK[3].listings,
        });
        setState("fallback");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const snapshot = MOCK_FALLBACK.find((d) => d.city === active)!;
  const liveListings = byCity[active];
  const allListings = liveListings ?? snapshot.listings;

  // Reset zip filter when city changes
  useEffect(() => { setZip(null); }, [active]);

  const availableZips = useMemo(() => {
    const seen = new Set<string>();
    allListings.forEach((l) => { if (l.zip) seen.add(l.zip); });
    return Array.from(seen).sort();
  }, [allListings]);

  const listings = useMemo(() => {
    return allListings.filter((l) => {
      if (tx === "sale" && l.isRental) return false;
      if (tx === "rental" && !l.isRental) return false;
      if (cls === "residential" && l.isCommercial) return false;
      if (cls === "commercial" && !l.isCommercial) return false;
      if (zip && l.zip !== zip) return false;
      return true;
    });
  }, [allListings, tx, cls, zip]);

  return (
    <>
      <section className="navy-gradient text-white pt-24 pb-12 lg:pt-40 lg:pb-20 relative overflow-hidden">
        <div className="absolute inset-0 hero-grid opacity-40" aria-hidden />
        <div className="relative mx-auto max-w-7xl px-6 lg:px-10">
          <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold mb-3 animate-fade-up">
            Market Intelligence
          </p>
          <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl text-white leading-[1.05] max-w-3xl animate-fade-up">
            Deal Board, <span className="italic gold-shimmer">live.</span>
          </h1>
          <p className="mt-4 text-base lg:text-lg text-white/70 max-w-xl leading-relaxed animate-fade-up-delay-1">
            Every active listing in {snapshot.city} scored against our deal model.
            Sourced live from SmartMLS — Norwalk, Westport, Wilton, and Fairfield.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3 animate-fade-up-delay-2">
            <div className="inline-flex items-center gap-1 p-1 rounded-full bg-white/5 border border-white/10">
              {MOCK_FALLBACK.map((d) => (
                <button
                  key={d.city}
                  onClick={() => setActive(d.city)}
                  className={`relative px-6 py-2.5 rounded-full text-sm font-medium transition-all ${
                    active === d.city
                      ? "bg-gold text-navy shadow-lg shadow-gold/20"
                      : "text-white/70 hover:text-white"
                  }`}
                >
                  {d.city}, CT
                </button>
              ))}
            </div>

            <div className="w-px h-7 bg-white/15 hidden sm:block" aria-hidden />

            <FilterGroup
              label=""
              value={tx}
              onChange={setTx}
              options={[
                { value: "all", label: "All" },
                { value: "sale", label: "Sales" },
                { value: "rental", label: "Rentals" },
              ]}
            />
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
          <p className="mt-3 font-mono text-xs text-white/45 tracking-wide">
            {snapshot.tagline}
          </p>

          {availableZips.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {availableZips.map((z) => (
                <button
                  key={z}
                  type="button"
                  onClick={() => setZip(zip === z ? null : z)}
                  onMouseEnter={(e) => { setHoveredZip(z); setHoveredZipEl(e.currentTarget); }}
                  onMouseLeave={() => { setHoveredZip(null); setHoveredZipEl(null); }}
                  aria-pressed={zip === z}
                  className={`font-mono text-[10px] tracking-[0.15em] uppercase px-3 py-1.5 rounded-full border transition-all ${
                    zip === z
                      ? "bg-gold text-navy border-gold shadow-md shadow-gold/20"
                      : "border-white/20 text-white/55 hover:border-white/50 hover:text-white"
                  }`}
                >
                  {z}
                </button>
              ))}
            </div>
          )}

          <div className="mt-10 flex items-end justify-between">
            <div>
              <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold mb-2">
                Deal Board
              </p>
              <h2 className="font-serif text-2xl sm:text-3xl lg:text-4xl text-white">
                Your {listings.length}{" "}
                {listings.length === 1 ? "listing" : "listings"},{" "}
                <span className="italic">scored.</span>
              </h2>
            </div>
            <div className="hidden md:flex items-center gap-2 font-mono text-xs">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  state === "ready"
                    ? "bg-sage animate-pulse-dot"
                    : state === "fallback"
                    ? "bg-coral"
                    : "bg-gold animate-pulse-dot"
                }`}
              />
              <span className="text-white/60">
                {state === "ready"
                  ? "Live · SmartMLS"
                  : state === "fallback"
                  ? "Cached · MLS feed offline"
                  : "Loading MLS feed…"}
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-cream py-10 lg:py-20">
        <div className="mx-auto max-w-7xl px-6 lg:px-10">
          <div className="lg:grid lg:grid-cols-[1fr_256px] lg:gap-8 lg:items-start">

            {/* Deal board */}
            <div>
          <div className="overflow-x-auto rounded-2xl border border-charcoal/[0.08] bg-white">
            <table className="w-full text-left min-w-[720px]">
              <thead>
                <tr className="border-b border-charcoal/[0.08] bg-cream/50">
                  <Th>
                    <span className="inline-flex items-center gap-0.5 group/score relative">
                      Score
                      <button
                        type="button"
                        onClick={() => setScoreInfoOpen(true)}
                        className="text-slate hover:text-charcoal transition-colors font-mono"
                        aria-label="How scores are calculated"
                      >
                        *
                      </button>
                      {/* Hover tooltip */}
                      <span
                        role="tooltip"
                        className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2.5 w-56 rounded-xl bg-navy text-white text-[11px] leading-relaxed px-3.5 py-2.5 shadow-xl opacity-0 group-hover/score:opacity-100 transition-opacity duration-150 z-30 normal-case tracking-normal font-sans"
                      >
                        A 0–10 rating that weighs freshness, value, layout, and property profile — curated by TMRE to surface the deals worth looking at first.
                        <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-navy" />
                      </span>
                    </span>
                  </Th>
                  <Th>{active}</Th>
                  <Th align="right">Price</Th>
                  <Th align="right">$ / sqft</Th>
                  <Th align="right">Sqft</Th>
                  <Th align="right">DOM</Th>
                  <Th>Status</Th>
                  <Th>Photos</Th>
                </tr>
              </thead>
              <tbody>
                {state === "loading" && liveListings === null && (
                  <tr>
                    <td colSpan={8} className="px-5 py-16 text-center text-slate">
                      <span className="inline-flex items-center gap-2 font-mono text-xs">
                        <span className="w-1.5 h-1.5 rounded-full bg-gold animate-pulse-dot" />
                        Loading {active} from SmartMLS…
                      </span>
                    </td>
                  </tr>
                )}
                {(state !== "loading" || liveListings !== null) &&
                  listings.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-5 py-16 text-center">
                        <p className="text-slate text-sm">
                          No {active} listings match your current filters.
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setTx("all");
                            setCls("all");
                            setZip(null);
                          }}
                          className="mt-3 font-mono text-[11px] tracking-[0.15em] uppercase text-gold hover:text-navy transition-colors"
                        >
                          Reset filters →
                        </button>
                      </td>
                    </tr>
                  )}
                {(state !== "loading" || liveListings !== null) &&
                  listings.map((l) => {
                    const isLive = !l.key.startsWith("m");
                    const detailHref = `/listings/${encodeURIComponent(l.key)}`;
                    return (
                      <tr
                        key={l.key}
                        className="group border-b border-charcoal/[0.06] last:border-0 hover:bg-cream/60 transition-colors"
                      >
                        <td className="px-5 py-4">
                          <ScoreBadge value={l.score} />
                        </td>
                        <td className="px-5 py-4">
                          {isLive ? (
                            <Link
                              href={detailHref}
                              className="font-medium text-navy hover:text-gold transition-colors"
                            >
                              {l.address}
                            </Link>
                          ) : (
                            <span className="font-medium text-navy">{l.address}</span>
                          )}
                          <p className="text-xs text-slate mt-0.5">{l.type}</p>
                        </td>
                        <td className="px-5 py-4 text-right font-mono text-navy tabular-nums">
                          ${l.price.toLocaleString()}
                        </td>
                        <td className="px-5 py-4 text-right font-mono text-slate tabular-nums">
                          {l.isRental
                            ? "—"
                            : l.pricePerSqft
                              ? `$${Math.round(l.pricePerSqft)}`
                              : "—"}
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
                            {l.headline}
                          </p>
                        </td>
                        <td className="px-3 py-4">
                          <PhotoStack
                            mlsId={l.key}
                            isLive={isLive}
                            href={detailHref}
                          />
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
            </div>{/* end deal board */}

            {/* Snapshot sidebar */}
            <aside className="mb-10 lg:mb-0 lg:sticky lg:top-8">
              <div className="rounded-2xl bg-white border border-charcoal/[0.06] overflow-hidden">
                <div className="px-5 py-4 border-b border-charcoal/[0.06] text-center">
                  <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-slate">
                    Snapshot
                  </p>
                  <p className="font-serif text-xl text-navy mt-0.5">{active}, CT</p>
                </div>
                <div className="grid grid-cols-2">
                  {snapshot.metrics.map((m) => (
                    <div
                      key={m.label}
                      className="flex flex-col items-center text-center px-3 py-3 border-b border-r border-charcoal/[0.04] odd:last:col-span-2"
                    >
                      <span className="font-mono text-[9px] tracking-[0.15em] uppercase text-slate/70 mb-1">
                        {m.label}
                      </span>
                      <p className="font-mono text-sm text-navy tabular-nums leading-tight">
                        {m.value}
                      </p>
                      <p
                        className={`font-mono text-[9px] leading-tight mt-0.5 ${
                          m.tone === "up"
                            ? "text-sage"
                            : m.tone === "down"
                            ? "text-coral"
                            : "text-slate"
                        }`}
                      >
                        {m.trend}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </aside>
          </div>{/* end grid */}
        </div>
      </section>
      {scoreInfoOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
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
              Each listing is scored 0–10 using a weighted model across five signals:
            </p>
            <ul className="space-y-3 mb-6">
              {[
                { label: "Days on market", detail: "Fresh listings score higher; stale listings score lower" },
                { label: "Price reduction", detail: "Meaningful cuts add points — signals motivated seller" },
                { label: "Bed / bath fit", detail: "3BR/2BA+ profiles outperform in resale and rental demand" },
                { label: "Property type", detail: "Multi-family and new construction receive category boosts" },
                { label: "Year built", detail: "Newer construction weighted for condition and finishes" },
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
              Scores are relative to the current active listings in each city and refresh with each MLS sync. They are a starting signal, not investment advice.
            </p>
          </div>
        </div>
      )}
      {hoveredZip && (
        <ZipBoundaryPopover zip={hoveredZip} anchorEl={hoveredZipEl} />
      )}
    </>
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
      <div className="inline-flex items-center gap-1 p-1 rounded-full bg-white/5 border border-white/10">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            aria-pressed={value === opt.value}
            className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all ${
              value === opt.value
                ? "bg-gold text-navy shadow-md shadow-gold/20"
                : "text-white/70 hover:text-white"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
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
      className={`px-5 py-4 font-mono text-[10px] tracking-[0.2em] uppercase text-slate ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}

function ScoreBadge({ value }: { value: number }) {
  const color =
    value >= 8.5
      ? "text-sage"
      : value >= 7
      ? "text-gold"
      : "text-charcoal/50";
  return (
    <span className={`font-mono font-semibold tabular-nums text-base ${color}`}>
      {value.toFixed(1)}
    </span>
  );
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
