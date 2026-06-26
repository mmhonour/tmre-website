"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type ListingKind = "sale" | "rental";

type ApiResponse = {
  generatedAt: string;
  totalReviewed: number;
  qualifiedCount: number;
  kind: ListingKind;
  insight: string;
  score: {
    ageCondition: number;
    finishesQuality: number;
    pricePerSqftFit: number;
    layoutQuality: number;
    schoolRating: number;
    composite: number;
    weights: {
      age: number;
      finishes: number;
      ppsf: number;
      layout: number;
      schools: number;
    };
  };
  pricePerSqft: number | null;
  cityMedianPricePerSqft: number | null;
  photoUrl: string | null;
  listing: {
    mlsId: string;
    propertyType: string;
    style: string;
    address: { street: string; city: string; state: string; full: string };
    price: number | null;
    originalListPrice: number | null;
    beds: number | null;
    baths: number | null;
    sqft: number | null;
    yearBuilt: number | null;
    dom: number | null;
    listDate: string | null;
    photoCount: number | null;
    schools: {
      elementary: string | null;
      middle: string | null;
      high: string | null;
      district: string | null;
    };
  };
};

const FALLBACK: ApiResponse = {
  generatedAt: new Date().toISOString(),
  totalReviewed: 0,
  qualifiedCount: 0,
  kind: "sale",
  insight:
    "Our Goldilocks model scans every active Fairfield County listing each morning, weighting age and condition, finishes, price-per-sqft fit, layout, and school ratings. This week's pick is loading — refresh in a moment to see it.",
  score: {
    ageCondition: 90,
    finishesQuality: 82,
    pricePerSqftFit: 88,
    layoutQuality: 84,
    schoolRating: 88,
    composite: 87.0,
    weights: {
      age: 0.3,
      finishes: 0.2,
      ppsf: 0.2,
      layout: 0.15,
      schools: 0.15,
    },
  },
  pricePerSqft: 378,
  cityMedianPricePerSqft: 425,
  photoUrl: null,
  listing: {
    mlsId: "—",
    propertyType: "Single Family",
    style: "Colonial",
    address: {
      street: "27 Rowayton Woods Dr",
      city: "Norwalk",
      state: "CT",
      full: "27 Rowayton Woods Dr, Norwalk, CT",
    },
    price: 695000,
    originalListPrice: 720000,
    beds: 3,
    baths: 2,
    sqft: 1840,
    yearBuilt: 2017,
    dom: 6,
    listDate: null,
    photoCount: 28,
    schools: {
      elementary: "Rowayton Elementary",
      middle: "Roton Middle",
      high: "Brien McMahon High School",
      district: "Norwalk Public Schools",
    },
  },
};

function fmtMoney(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  return `$${n.toLocaleString()}`;
}

function shortType(t: string): string {
  return t.replace(/ For Sale$/i, "").replace(/ For Lease$/i, "");
}

export default function DealOfTheWeekHero() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [usedFallback, setUsedFallback] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/deal-of-the-week", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as ApiResponse;
      })
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("[deal-of-the-week] fetch failed, using fallback", err);
        setData(FALLBACK);
        setUsedFallback(true);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const showing = data ?? FALLBACK;
  const l = showing.listing;
  const typeLine = [
    shortType(l.propertyType || "Home"),
    l.beds && l.baths ? `${l.beds}BR/${l.baths}BA` : null,
    l.sqft ? `${l.sqft.toLocaleString()} sqft` : null,
    l.yearBuilt ? `Built ${l.yearBuilt}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const reductionPct =
    l.price && l.originalListPrice && l.originalListPrice > l.price
      ? Math.round(((l.originalListPrice - l.price) / l.originalListPrice) * 100)
      : null;
  const ppsfDiscount =
    showing.pricePerSqft && showing.cityMedianPricePerSqft
      ? Math.round(
          ((showing.pricePerSqft - showing.cityMedianPricePerSqft) /
            showing.cityMedianPricePerSqft) *
            100,
        )
      : null;

  return (
    <section className="relative navy-gradient overflow-hidden">
      <div className="absolute inset-0 hero-grid opacity-60" aria-hidden />
      <div
        className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-navy"
        aria-hidden
      />
      <div className="relative mx-auto max-w-7xl px-6 lg:px-10 pt-32 pb-28 lg:pt-40 lg:pb-36">
        <div className="grid lg:grid-cols-[1.05fr_1fr] gap-12 lg:gap-16 items-center">
          <div>
            <div className="animate-fade-up inline-flex items-center gap-2 rounded-full border border-gold/30 bg-gold/5 px-4 py-1.5 mb-8">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  loading
                    ? "bg-gold animate-pulse-dot"
                    : usedFallback
                      ? "bg-coral"
                      : "bg-sage animate-pulse-dot"
                }`}
              />
              <span className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold/90">
                Deal of the Week · {today}
              </span>
            </div>
            <h1 className="font-serif text-5xl sm:text-6xl lg:text-7xl leading-[1.05] tracking-tight text-white animate-fade-up">
              This week's{" "}
              <span className="italic gold-shimmer">
                {showing.score.composite.toFixed(1)}.
              </span>
              <br />
              <span className="italic text-white/85">One listing.</span>
            </h1>
            <p className="mt-8 max-w-xl text-lg text-white/70 leading-relaxed animate-fade-up-delay-1">
              {showing.insight}
            </p>
            <div className="mt-10 animate-fade-up-delay-2 flex flex-wrap items-center gap-4">
              <Link
                href="/intelligence"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-gold px-7 py-4 text-sm font-medium text-navy transition-all hover:bg-gold-light hover:shadow-2xl hover:shadow-gold/30 hover:-translate-y-0.5"
              >
                See the full deal board
                <span aria-hidden>→</span>
              </Link>
              {!loading && !usedFallback && (
                <span className="font-mono text-[11px] tracking-[0.15em] uppercase text-white/45">
                  Scanned {showing.totalReviewed.toLocaleString()} active
                  listings · {showing.qualifiedCount.toLocaleString()} qualified
                </span>
              )}
            </div>
          </div>

          <DealCard
            address={l.address.street || l.address.full}
            city={l.address.city || l.address.state || ""}
            type={typeLine}
            kind={showing.kind}
            price={l.price}
            originalPrice={l.originalListPrice}
            reductionPct={reductionPct}
            ppsf={showing.pricePerSqft}
            cityMedianPpsf={showing.cityMedianPricePerSqft}
            ppsfDiscount={ppsfDiscount}
            dom={l.dom}
            photoCount={l.photoCount}
            photoUrl={showing.photoUrl}
            schools={l.schools}
            score={showing.score}
            loading={loading}
          />
        </div>
      </div>
    </section>
  );
}

function DealCard({
  address,
  city,
  type,
  kind,
  price,
  originalPrice,
  reductionPct,
  ppsf,
  cityMedianPpsf,
  ppsfDiscount,
  dom,
  photoCount,
  photoUrl,
  schools,
  score,
  loading,
}: {
  address: string;
  city: string;
  type: string;
  kind: ListingKind;
  price: number | null;
  originalPrice: number | null;
  reductionPct: number | null;
  ppsf: number | null;
  cityMedianPpsf: number | null;
  ppsfDiscount: number | null;
  dom: number | null;
  photoCount: number | null;
  photoUrl: string | null;
  schools: ApiResponse["listing"]["schools"];
  score: ApiResponse["score"];
  loading: boolean;
}) {
  const isRental = kind === "rental";
  const cityShort = city ? city.split(",")[0] : "";
  const priceLabel = isRental ? "Monthly rent" : "List price";
  const priceSuffix = isRental ? "/mo" : "";
  const wasLabel = isRental ? "Asked" : "Was";
  const ppsfLabel = isRental ? "Rent / sqft" : "$ / sqft";
  const ppsfSuffix = isRental ? "/mo" : "";
  const medianLabel = cityShort
    ? `vs ${cityShort} ${isRental ? "rent median" : "median"}`
    : isRental
      ? "vs rent median"
      : "vs city median";
  return (
    <aside className="animate-fade-up-delay-2 relative rounded-3xl bg-gradient-to-br from-navy-light/70 to-navy-dark/90 border border-white/10 shadow-2xl shadow-black/40 overflow-hidden backdrop-blur-sm">
      <div
        aria-hidden
        className="absolute -inset-px rounded-3xl bg-gradient-to-br from-gold/30 via-transparent to-transparent opacity-50 pointer-events-none"
        style={{ mask: "linear-gradient(white, transparent)" }}
      />
      <PhotoBanner src={photoUrl} alt={address} loading={loading} />
      <div className="relative p-7 lg:p-8 pt-6 lg:pt-7">
        <div className="flex items-center justify-between mb-7">
          <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-gold">
            Goldilocks Pick
          </span>
          <span className="inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.15em] uppercase text-sage border border-sage/30 bg-sage/10 rounded-full px-2.5 py-1">
            <span className="w-1 h-1 rounded-full bg-sage animate-pulse-dot" />
            {loading ? "Computing" : "Active"}
            {dom != null && !loading ? ` · ${dom}d on market` : ""}
          </span>
        </div>

        <div className="flex items-start gap-5 mb-7">
          <div className="flex-shrink-0 w-20 h-20 rounded-2xl bg-sage text-white flex flex-col items-center justify-center shadow-lg shadow-sage/30">
            <span className="font-mono text-2xl font-medium tabular-nums leading-none">
              {score.composite.toFixed(1)}
            </span>
            <span className="font-mono text-[9px] tracking-[0.15em] uppercase mt-1 opacity-80">
              Score
            </span>
          </div>
          <div className="min-w-0">
            <h2 className="font-serif text-2xl lg:text-3xl text-white leading-tight">
              {address}
            </h2>
            <p className="text-sm text-white/60 mt-1.5">{city}</p>
            <p className="font-mono text-[10px] tracking-[0.15em] uppercase text-white/45 mt-2.5">
              {type}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-5 mb-7 pb-7 border-b border-white/10">
          <Stat
            label={priceLabel}
            value={price != null ? `${fmtMoney(price)}${priceSuffix}` : "—"}
          />
          <Stat
            label={wasLabel}
            value={
              originalPrice && originalPrice !== price
                ? `${fmtMoney(originalPrice)}${priceSuffix}`
                : "—"
            }
            sub={reductionPct ? `−${reductionPct}%` : undefined}
            accent={reductionPct ? "coral" : undefined}
          />
          <Stat
            label={ppsfLabel}
            value={ppsf ? `$${Math.round(ppsf)}${ppsfSuffix}` : "—"}
          />
          <Stat
            label={medianLabel}
            value={
              cityMedianPpsf
                ? `$${Math.round(cityMedianPpsf)}${ppsfSuffix}`
                : "—"
            }
            sub={
              ppsfDiscount != null
                ? `${ppsfDiscount > 0 ? "+" : ""}${ppsfDiscount}%`
                : undefined
            }
            accent={ppsfDiscount != null && ppsfDiscount < 0 ? "sage" : undefined}
          />
        </div>

        <div className="mb-7">
          <div className="flex items-end justify-between mb-3">
            <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-white/60">
              Goldilocks composite
            </span>
            <span className="font-mono text-sage text-lg tabular-nums">
              {score.composite.toFixed(1)}/100
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-sage to-gold"
              style={{ width: `${score.composite}%` }}
            />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3">
            <Factor label="Age & condition" value={score.ageCondition} weight={score.weights.age} />
            <Factor label="Finishes" value={score.finishesQuality} weight={score.weights.finishes} />
            <Factor label="PPSF fit" value={score.pricePerSqftFit} weight={score.weights.ppsf} />
            <Factor label="Layout" value={score.layoutQuality} weight={score.weights.layout} />
            <Factor label="Schools" value={score.schoolRating} weight={score.weights.schools} />
          </div>
        </div>

        <SchoolsBlock schools={schools} rating={score.schoolRating} />

        <div className="flex items-center justify-between font-mono text-[10px] tracking-[0.15em] uppercase text-white/55">
          <span>{photoCount != null ? `${photoCount} photos` : "—"}</span>
          <Link
            href="/intelligence"
            className="text-gold hover:text-gold-light"
          >
            See full board →
          </Link>
        </div>
      </div>
    </aside>
  );
}

function PhotoBanner({
  src,
  alt,
  loading,
}: {
  src: string | null;
  alt: string;
  loading: boolean;
}) {
  return (
    <div className="relative w-full aspect-[16/9] bg-gradient-to-br from-navy-light to-navy-dark overflow-hidden">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt}
          className="absolute inset-0 w-full h-full object-cover"
          loading="lazy"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-mono text-[10px] tracking-[0.25em] uppercase text-white/40">
            {loading ? "Loading photo…" : "Photo unavailable"}
          </span>
        </div>
      )}
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-navy-dark/90 to-transparent"
      />
    </div>
  );
}

function SchoolsBlock({
  schools,
  rating,
}: {
  schools: ApiResponse["listing"]["schools"];
  rating: number;
}) {
  const items: { label: string; value: string }[] = [];
  if (schools.elementary) items.push({ label: "Elementary", value: schools.elementary });
  if (schools.middle) items.push({ label: "Middle", value: schools.middle });
  if (schools.high) items.push({ label: "High", value: schools.high });
  if (items.length === 0 && schools.district) {
    items.push({ label: "District", value: schools.district });
  }
  if (items.length === 0) return null;

  const tone =
    rating >= 85
      ? "text-sage"
      : rating >= 70
        ? "text-gold"
        : "text-white/70";

  return (
    <div className="mb-7 pb-7 border-b border-white/10">
      <div className="flex items-center justify-between mb-3">
        <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-white/60">
          Schools
        </span>
        <span className={`font-mono text-[11px] tabular-nums ${tone}`}>
          {rating.toFixed(0)}/100
        </span>
      </div>
      <ul className="space-y-1.5">
        {items.map((s) => (
          <li
            key={s.label}
            className="flex items-baseline justify-between gap-3 text-sm"
          >
            <span className="font-mono text-[10px] tracking-[0.15em] uppercase text-white/45 shrink-0">
              {s.label}
            </span>
            <span className="text-white/85 text-right truncate">{s.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: "gold" | "sage" | "coral";
}) {
  const color =
    accent === "gold"
      ? "text-gold"
      : accent === "sage"
        ? "text-sage"
        : accent === "coral"
          ? "text-coral"
          : "text-white";
  return (
    <div>
      <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-white/50 mb-1.5">
        {label}
      </p>
      <p className={`font-mono text-xl tabular-nums ${color}`}>{value}</p>
      {sub && (
        <p
          className={`font-mono text-[11px] mt-0.5 tabular-nums ${
            accent === "sage"
              ? "text-sage"
              : accent === "coral"
                ? "text-coral"
                : "text-white/55"
          }`}
        >
          {sub}
        </p>
      )}
    </div>
  );
}

function Factor({ label, value, weight }: { label: string; value: number; weight: number }) {
  return (
    <div>
      <div className="flex items-center justify-between font-mono text-[10px] tracking-[0.1em] uppercase text-white/55 mb-1">
        <span>{label}</span>
        <span>
          {Math.round(value)}
          <span className="text-white/35"> · {Math.round(weight * 100)}%</span>
        </span>
      </div>
      <div className="h-1 rounded-full bg-white/10 overflow-hidden">
        <div className="h-full bg-white/35" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}
