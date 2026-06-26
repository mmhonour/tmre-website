"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Schools = {
  elementary: string | null;
  middle: string | null;
  high: string | null;
  district: string | null;
};

type Listing = {
  mlsId: string;
  listingKey: string;
  status: string;
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
  originalListPrice: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  yearBuilt: number | null;
  dom: number | null;
  listDate: string | null;
  modificationTimestamp: string | null;
  latitude: number | null;
  longitude: number | null;
  photoCount: number | null;
  schools: Schools;
  raw: Record<string, string>;
};

type ApiResponse = {
  listing: Listing;
  photos: string[];
};

type LoadState = "loading" | "ready" | "error" | "not-found";

const REMARKS_KEYS = ["PublicRemarks", "RemarksPublicAddendum"];

function fmtMoney(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  return `$${n.toLocaleString()}`;
}

export default function ListingDetailClient({ mlsId }: { mlsId: string }) {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activePhoto, setActivePhoto] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    fetch(`/api/listings/${encodeURIComponent(mlsId)}`, { cache: "no-store" })
      .then(async (r) => {
        if (r.status === 404) {
          if (!cancelled) setState("not-found");
          return null;
        }
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as ApiResponse;
      })
      .then((d) => {
        if (!d || cancelled) return;
        setData(d);
        setActivePhoto(0);
        setState("ready");
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("[listing detail] fetch failed", err);
        setErrorMsg(err instanceof Error ? err.message : "Fetch failed");
        setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [mlsId]);

  if (state === "loading") {
    return (
      <Shell>
        <div className="text-center text-white/60 font-mono text-xs tracking-wide py-32">
          <span className="inline-flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-gold animate-pulse-dot" />
            Loading listing {mlsId}…
          </span>
        </div>
      </Shell>
    );
  }

  if (state === "not-found") {
    return (
      <Shell>
        <ErrorPanel
          title="Listing not found"
          body={`MLS #${mlsId} isn't in the active feed right now. It may have closed, expired, or been withdrawn.`}
        />
      </Shell>
    );
  }

  if (state === "error" || !data) {
    return (
      <Shell>
        <ErrorPanel
          title="Couldn't load this listing"
          body={errorMsg ?? "Try again in a moment."}
        />
      </Shell>
    );
  }

  const { listing, photos } = data;
  const l = listing;
  const isRental = /rental|for lease/i.test(l.propertyType || "");
  const reductionPct =
    l.price && l.originalListPrice && l.originalListPrice > l.price
      ? Math.round(((l.originalListPrice - l.price) / l.originalListPrice) * 100)
      : null;
  const ppsf =
    !isRental && l.price && l.sqft && l.sqft > 0
      ? Math.round(l.price / l.sqft)
      : null;
  const remarks = REMARKS_KEYS.map((k) => l.raw[k])
    .filter(Boolean)
    .join("\n\n");

  return (
    <Shell>
      <div className="grid lg:grid-cols-[1.4fr_1fr] gap-10 lg:gap-12">
        <div>
          <PhotoGallery
            photos={photos}
            active={activePhoto}
            setActive={setActivePhoto}
            address={l.address.street || l.address.full}
          />
        </div>

        <aside className="space-y-7">
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-gold">
                MLS #{l.mlsId} · {l.status}
              </span>
              {l.dom != null && (
                <span className="font-mono text-[10px] tracking-[0.15em] uppercase text-white/55">
                  {l.dom}d on market
                </span>
              )}
            </div>
            <h1 className="font-serif text-3xl lg:text-4xl text-white leading-tight">
              {l.address.street || l.address.full}
            </h1>
            <p className="text-white/65 mt-2">
              {[l.address.city, l.address.state, l.address.postalCode]
                .filter(Boolean)
                .join(" ")}
            </p>
            <p className="font-mono text-[10px] tracking-[0.15em] uppercase text-white/45 mt-3">
              {[
                l.propertyType?.replace(/ For Sale$/i, ""),
                l.style,
                l.beds && l.baths ? `${l.beds}BR/${l.baths}BA` : null,
                l.sqft ? `${l.sqft.toLocaleString()} sqft` : null,
                l.yearBuilt ? `Built ${l.yearBuilt}` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 space-y-4">
            <Stat
              label={isRental ? "Monthly rent" : "List price"}
              value={fmtMoney(l.price)}
              large
            />
            {l.originalListPrice && l.originalListPrice !== l.price && (
              <Stat
                label="Originally"
                value={fmtMoney(l.originalListPrice)}
                sub={reductionPct ? `−${reductionPct}%` : undefined}
                accent={reductionPct ? "coral" : undefined}
              />
            )}
            {!isRental && (
              <Stat label="$ / sqft" value={ppsf ? `$${ppsf}` : "—"} />
            )}
            <Stat label="Photos" value={String(photos.length)} />
          </div>

          {(l.schools.elementary ||
            l.schools.middle ||
            l.schools.high ||
            l.schools.district) && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6">
              <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-gold mb-3">
                Schools
              </p>
              <ul className="space-y-2 text-sm">
                {l.schools.elementary && (
                  <SchoolRow label="Elementary" value={l.schools.elementary} />
                )}
                {l.schools.middle && (
                  <SchoolRow label="Middle" value={l.schools.middle} />
                )}
                {l.schools.high && (
                  <SchoolRow label="High" value={l.schools.high} />
                )}
                {l.schools.district && (
                  <SchoolRow label="District" value={l.schools.district} />
                )}
              </ul>
            </div>
          )}

          {remarks && (
            <div>
              <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-gold mb-3">
                Listing remarks
              </p>
              <p className="text-white/80 text-sm leading-relaxed whitespace-pre-line">
                {remarks}
              </p>
            </div>
          )}
        </aside>
      </div>
    </Shell>
  );
}

function BackLink() {
  const [href, setHref] = useState("/intelligence");
  const [label, setLabel] = useState("Deal board");
  useEffect(() => {
    const ref = document.referrer;
    if (ref.includes("/properties")) {
      setHref("/properties");
      setLabel("New Construction");
    }
  }, []);
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2 font-mono text-[11px] tracking-[0.15em] uppercase text-white/60 hover:text-gold transition-colors mb-10"
    >
      <span aria-hidden>←</span> Back to {label}
    </Link>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <section className="navy-gradient text-white pt-32 pb-24 lg:pt-40 lg:pb-32 min-h-screen relative overflow-hidden">
      <div className="absolute inset-0 hero-grid opacity-30" aria-hidden />
      <div className="relative mx-auto max-w-7xl px-6 lg:px-10">
        <BackLink />
        {children}
      </div>
    </section>
  );
}

function PhotoGallery({
  photos,
  active,
  setActive,
  address,
}: {
  photos: string[];
  active: number;
  setActive: (i: number) => void;
  address: string;
}) {
  if (photos.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] aspect-[16/10] flex items-center justify-center">
        <span className="font-mono text-[10px] tracking-[0.25em] uppercase text-white/45">
          No photos available
        </span>
      </div>
    );
  }
  const current = photos[Math.min(active, photos.length - 1)];
  return (
    <div className="space-y-3">
      <div className="relative rounded-2xl overflow-hidden bg-navy-dark border border-white/10 aspect-[16/10]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={current}
          alt={`${address} — photo ${active + 1} of ${photos.length}`}
          className="absolute inset-0 w-full h-full object-cover"
        />
        <span className="absolute bottom-3 right-3 font-mono text-[10px] tracking-[0.15em] uppercase text-white/80 bg-black/50 backdrop-blur-sm rounded-full px-3 py-1">
          {active + 1} / {photos.length}
        </span>
      </div>
      {photos.length > 1 && (
        <div className="grid grid-cols-6 sm:grid-cols-8 gap-2">
          {photos.map((p, i) => (
            <button
              key={p}
              type="button"
              onClick={() => setActive(i)}
              className={`relative aspect-square rounded-md overflow-hidden border transition-all ${
                i === active
                  ? "border-gold ring-2 ring-gold/40"
                  : "border-white/10 hover:border-white/30"
              }`}
              aria-label={`Photo ${i + 1}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p}
                alt=""
                className="absolute inset-0 w-full h-full object-cover"
                loading="lazy"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  accent,
  large,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: "coral" | "sage";
  large?: boolean;
}) {
  const color =
    accent === "coral" ? "text-coral" : accent === "sage" ? "text-sage" : "text-white";
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-white/55">
        {label}
      </span>
      <span
        className={`font-mono tabular-nums ${
          large ? "text-2xl" : "text-base"
        } ${color}`}
      >
        {value}
        {sub && <span className="ml-2 text-xs text-white/55">{sub}</span>}
      </span>
    </div>
  );
}

function SchoolRow({ label, value }: { label: string; value: string }) {
  return (
    <li className="flex items-baseline justify-between gap-3">
      <span className="font-mono text-[10px] tracking-[0.15em] uppercase text-white/50 shrink-0">
        {label}
      </span>
      <span className="text-white/85 text-right">{value}</span>
    </li>
  );
}

function ErrorPanel({ title, body }: { title: string; body: string }) {
  return (
    <div className="max-w-lg mx-auto text-center py-24">
      <p className="font-mono text-[10px] tracking-[0.25em] uppercase text-coral mb-4">
        Error
      </p>
      <h1 className="font-serif text-3xl text-white">{title}</h1>
      <p className="text-white/70 mt-4">{body}</p>
    </div>
  );
}
