"use client";

import { Suspense, useEffect, useState } from "react";
import { recordLookedAtListing } from "@/lib/looked-at-listings";
import {
  closeFieldsFromListing,
  formatMlsStatus,
  fmtDate,
} from "@/lib/listing-history";
import PhotoGallery from "@/components/listing/PhotoGallery";
import ListingHeader from "@/components/listing/ListingHeader";
import { ListingShell } from "@/components/listing/ListingShell";
import ListingSubnav from "@/components/listing/ListingSubnav";

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
  ownerName: string | null;
  priceChangeTimestamp: string | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  yearBuilt: number | null;
  dom: number | null;
  listDate: string | null;
  modificationTimestamp: string | null;
  statusChangeTimestamp: string | null;
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

export default function ListingDetailClient({
  mlsId,
  addressHint,
  townHint,
}: {
  mlsId: string;
  addressHint?: string | null;
  townHint?: string | null;
}) {
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

  useEffect(() => {
    if (state !== "ready" || !data) return;
    const l = data.listing;
    const id = l.listingKey?.trim() || l.mlsId;
    const address =
      l.address.street?.trim() ||
      l.address.full?.trim() ||
      addressHint?.trim() ||
      id;
    recordLookedAtListing({
      id,
      address,
      city: townHint || l.address.city || null,
      zip: l.address.postalCode || null,
      price: l.price,
      propertyType: l.propertyType || null,
    });
  }, [state, data, addressHint, townHint]);

  if (state === "loading") {
    return (
      <ListingShell>
        <div className="text-center text-white/60 font-mono text-xs tracking-wide py-32">
          <span className="inline-flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-gold animate-pulse-dot" />
            Loading {addressHint?.trim() || "listing"}…
          </span>
        </div>
      </ListingShell>
    );
  }

  if (state === "not-found") {
    return (
      <ListingShell>
        <ErrorPanel
          title="Listing not found"
          body={`${addressHint?.trim() || "This listing"} isn't in the active feed right now. It may have closed, expired, or been withdrawn.`}
        />
      </ListingShell>
    );
  }

  if (state === "error" || !data) {
    return (
      <ListingShell>
        <ErrorPanel
          title="Couldn't load this listing"
          body={errorMsg ?? "Try again in a moment."}
        />
      </ListingShell>
    );
  }

  const { listing, photos } = data;
  const l = listing;
  const statusLabel = formatMlsStatus(l.status);
  const isClosed = statusLabel === "Closed";
  const { closePrice, closeDate } = closeFieldsFromListing(l);
  const soldPrice = closePrice ?? (isClosed ? l.price : null);
  const isRental = /rental|for lease/i.test(l.propertyType || "");
  const reductionPct =
    l.price && l.originalListPrice && l.originalListPrice > l.price
      ? Math.round(((l.originalListPrice - l.price) / l.originalListPrice) * 100)
      : null;
  const priceForPpsf = isClosed ? soldPrice : l.price;
  const ppsf =
    !isRental && priceForPpsf && l.sqft && l.sqft > 0
      ? Math.round(priceForPpsf / l.sqft)
      : null;
  const remarks = REMARKS_KEYS.map((k) => l.raw[k])
    .filter(Boolean)
    .join("\n\n");
  const street = l.address.street || l.address.full;
  const mapsQuery =
    l.address.full?.trim() ||
    [street, l.address.city, l.address.state, l.address.postalCode].filter(Boolean).join(", ");

  return (
    <ListingShell>
      <ListingHeader
        mlsId={l.mlsId}
        status={l.status}
        dom={l.dom}
        address={l.address}
        propertyType={l.propertyType}
        style={l.style}
        beds={l.beds}
        baths={l.baths}
        sqft={l.sqft}
        yearBuilt={l.yearBuilt}
      />
      <Suspense fallback={null}>
        <ListingSubnav
          mlsId={mlsId}
          active="overview"
          addressHint={street || addressHint}
          townHint={townHint}
          interest={
            !isClosed
              ? {
                  mlsId: l.mlsId,
                  address: street,
                  city: townHint || l.address.city,
                }
              : null
          }
          location={{
            latitude: l.latitude,
            longitude: l.longitude,
            addressQuery: mapsQuery,
          }}
        />
      </Suspense>
      <div className="space-y-7">
        <PhotoGallery
          photos={photos}
          active={activePhoto}
          setActive={setActivePhoto}
          address={street}
        />

        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 space-y-4">
          {isClosed ? (
            <>
              <Stat
                label={isRental ? "Closed rent" : "Closed price"}
                value={fmtMoney(soldPrice ?? l.price)}
                large
              />
              {closeDate && (
                <Stat
                  label="Closed date"
                  value={fmtDate(closeDate) ?? closeDate}
                />
              )}
              {l.price != null && soldPrice !== l.price && (
                <Stat label="Last list price" value={fmtMoney(l.price)} />
              )}
            </>
          ) : (
            <>
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
            </>
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
      </div>
    </ListingShell>
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
