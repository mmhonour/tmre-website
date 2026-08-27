"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import ShowcaseDetailsPanel from "@/components/listing/showcase/ShowcaseDetailsPanel";
import ShowcasePhotoStage from "@/components/listing/showcase/ShowcasePhotoStage";
import ShowcaseSectionRail from "@/components/listing/showcase/ShowcaseSectionRail";
import ShowcaseStepArrow from "@/components/listing/showcase/ShowcaseStepArrow";
import { scrollToShowcaseSection } from "@/components/listing/showcase/showcase-sections";
import type { ShowcaseListing } from "@/components/listing/showcase/showcase-types";
import { formatMlsStatus, primaryListingPrice } from "@/lib/listing-history";
import type { ListingScoreApiFields } from "@/lib/listing-header-score-props";
import { isRentalListing } from "@/lib/listing-kind";
import { parseLotAcresFromRaw } from "@/lib/listing-lot-acres";
import { propertyTaxFromRaw } from "@/lib/listing-property-tax";
import {
  listingDetailHref,
  listingPhotoProxyUrlsFromCount,
  listingPhotosHref,
} from "@/lib/listing-url";
import { listingChromeApiUrl, loadTabJson } from "@/lib/tab-data-prefetch";

const HOLD_MS = 6500;
const MAX_PHOTOS = 40;
const REMARKS_KEYS = ["PublicRemarks", "RemarksPublicAddendum"];

type ApiResponse = ListingScoreApiFields & { listing: ShowcaseListing };

type LoadState = "loading" | "ready" | "error" | "not-found";

function fmtFullMoney(n: number | null): string | null {
  if (n == null || !Number.isFinite(n) || n <= 0) return null;
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function fmtAcres(acres: number | null): string | null {
  if (acres == null || acres <= 0) return null;
  return `${acres.toFixed(acres < 1 ? 2 : 1)} acres`;
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return reduced;
}

function ShowcaseMessage({ children }: { children: React.ReactNode }) {
  return (
    <section className="navy-gradient relative flex min-h-[100dvh] items-center justify-center px-6 text-white">
      <div className="absolute inset-0 hero-grid opacity-30" aria-hidden />
      <div className="relative text-center font-mono text-xs tracking-[0.2em] uppercase text-white/60">
        {children}
      </div>
    </section>
  );
}

function ControlButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex h-11 w-11 items-center justify-center rounded-full border border-white/25 bg-black/25 text-white/85 backdrop-blur-sm transition-colors hover:border-gold/60 hover:bg-black/45 hover:text-gold"
    >
      {children}
    </button>
  );
}

export default function ListingShowcaseClient({
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
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [failed, setFailed] = useState<ReadonlySet<string>>(new Set());
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    let cancelled = false;
    const url = listingChromeApiUrl(mlsId);

    void loadTabJson<ApiResponse>(url)
      .then((d) => {
        if (cancelled) return;
        if (!d?.listing) {
          setState("not-found");
          return;
        }
        setData(d);
        setState("ready");
      })
      .catch((err) => {
        if (cancelled) return;
        setErrorMsg(err instanceof Error ? err.message : "Fetch failed");
        setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [mlsId]);

  const listing = data?.listing ?? null;

  const photos = useMemo(() => {
    if (!listing) return [] as string[];
    const all = listingPhotoProxyUrlsFromCount(
      listing.mlsId,
      listing.photoCount ?? 0,
      MAX_PHOTOS,
      { size: "full" },
    );
    const live = all.filter((url) => !failed.has(url));
    return live.length > 0 ? live : all.slice(0, 1);
  }, [listing, failed]);

  const total = photos.length;
  const safeIndex = total > 0 ? index % total : 0;

  const step = useCallback(
    (delta: number) => {
      setIndex((current) => {
        if (total <= 0) return 0;
        return (current + delta + total) % total;
      });
    },
    [total],
  );

  useEffect(() => {
    if (paused || total < 2) return;
    const timer = setTimeout(() => step(1), HOLD_MS);
    return () => clearTimeout(timer);
  }, [paused, total, safeIndex, step]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") {
        step(1);
      } else if (e.key === "ArrowLeft") {
        step(-1);
      } else if (e.key === " ") {
        e.preventDefault();
        setPaused((p) => !p);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step]);

  const markFailed = useCallback(
    (photoIndex: number) => {
      const url = photos[photoIndex];
      if (!url) return;
      setFailed((prev) => {
        if (prev.has(url)) return prev;
        const next = new Set(prev);
        next.add(url);
        return next;
      });
    },
    [photos],
  );

  if (state === "loading") {
    return (
      <ShowcaseMessage>
        Loading {addressHint?.trim() || `listing ${mlsId}`}…
      </ShowcaseMessage>
    );
  }

  if (state === "not-found" || !listing) {
    return (
      <ShowcaseMessage>
        {errorMsg
          ? `Couldn't load listing ${mlsId} — ${errorMsg}`
          : `Listing ${mlsId} isn't in the feed right now.`}
      </ShowcaseMessage>
    );
  }

  const street = listing.address.street || listing.address.full || addressHint || "";
  const city = townHint || listing.address.city;
  const status = formatMlsStatus(listing.status);
  const lotAcres = parseLotAcresFromRaw(listing.raw);
  const tax = propertyTaxFromRaw(listing.raw);
  const insight = data?.insight?.trim() || null;
  const isRental = isRentalListing(listing);
  const remarks =
    listing.remarks?.trim() ||
    REMARKS_KEYS.map((k) => listing.raw?.[k])
      .filter(Boolean)
      .join("\n\n");

  const detailRows = [
    { label: "Lot", value: fmtAcres(lotAcres) ?? "—" },
    { label: "MLS #", value: listing.mlsId },
    { label: "Status", value: status },
    { label: "Type", value: listing.propertyType || "—" },
    { label: "Style", value: listing.style || "—" },
    { label: "Days on market", value: listing.dom != null ? String(listing.dom) : "—" },
    {
      label: tax.yearLabel ? `Taxes (${tax.yearLabel})` : "Taxes",
      value: fmtFullMoney(tax.annualAmount) ?? "—",
    },
    { label: "Elementary", value: listing.schools.elementary || "—" },
    { label: "High school", value: listing.schools.high || "—" },
  ];

  return (
    <div className="bg-navy-dark text-white">
      <section className="relative min-h-[100dvh] w-full overflow-hidden">
        <ShowcasePhotoStage
          photos={photos}
          index={safeIndex}
          altBase={street || `Listing ${listing.mlsId}`}
          drift={!reducedMotion && !paused}
          onPhotoFailed={markFailed}
        />

        {/* Scrims keep the overlaid type legible over any photo. */}
        <div className="listing-showcase-scrim-bottom absolute inset-0" aria-hidden />
        <div className="listing-showcase-scrim-top absolute inset-0" aria-hidden />

        <ShowcaseStepArrow
          direction="prev"
          label="Previous photo"
          onClick={() => step(-1)}
          className="absolute left-3 top-1/2 z-20 -translate-y-1/2 sm:left-6"
        />
        <ShowcaseSectionRail
          mlsId={listing.mlsId}
          insight={insight}
          detailRows={detailRows}
          townHint={city}
          postalCode={listing.address.postalCode}
          subject={
            listing.latitude != null && listing.longitude != null
              ? {
                  key: listing.listingKey || listing.mlsId,
                  address: street,
                  city,
                  price: primaryListingPrice(listing) ?? 0,
                  score: data?.goldilocksScore ?? 0,
                  isRental,
                  beds: listing.beds,
                  baths: listing.baths,
                  sqft: listing.sqft,
                  latitude: listing.latitude,
                  longitude: listing.longitude,
                  photoCount: listing.photoCount,
                }
              : null
          }
          onNext={() => step(1)}
        />

        <div className="listing-showcase-type relative flex min-h-[100dvh] flex-col justify-between px-4 pb-10 pt-24 sm:px-8 lg:px-12 lg:pb-14 lg:pt-28">
          <div className="mx-auto w-full max-w-7xl">
            <div className="max-w-xl">
              <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-gold">
                {status}
              </span>
              <h1 className="mt-2 font-serif text-3xl leading-tight sm:text-4xl lg:text-5xl">
                {street}
              </h1>
              <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.22em] text-white/70">
                {[city, listing.address.state, listing.address.postalCode]
                  .filter(Boolean)
                  .join(" ")}
              </p>
            </div>
          </div>

          <div className="mx-auto grid w-full max-w-7xl grid-cols-1 items-end gap-5 sm:grid-cols-[1fr_auto_1fr]">
            <button
              type="button"
              onClick={() => scrollToShowcaseSection("overview")}
              className="group max-w-md text-left font-mono text-[10px] uppercase tracking-[0.25em] text-white/70 transition-colors hover:text-gold"
            >
              Scroll for details
              <span
                aria-hidden
                className="ml-2 inline-block transition-transform group-hover:translate-y-0.5"
              >
                ↓
              </span>
            </button>

            {/* Centre column keeps pause + counter on the page midline. */}
            <div className="flex items-center justify-center gap-3">
              <ControlButton
                label={paused ? "Resume slideshow" : "Pause slideshow"}
                onClick={() => setPaused((p) => !p)}
              >
                <span aria-hidden className="text-xs leading-none">
                  {paused ? "▶" : "❚❚"}
                </span>
              </ControlButton>
              <span className="font-mono text-xs tracking-[0.2em] text-white/70 tabular-nums">
                {String(safeIndex + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-4 sm:justify-end">
              <Link
                href={listingPhotosHref(listing.mlsId, street, city)}
                className="font-mono text-[10px] uppercase tracking-[0.25em] text-white/75 underline decoration-white/30 underline-offset-[6px] transition-colors hover:text-gold hover:decoration-gold/60"
              >
                See all photos
              </Link>
              <Link
                href={listingDetailHref(listing.mlsId, street, city)}
                className="font-mono text-[10px] uppercase tracking-[0.25em] text-white/75 underline decoration-white/30 underline-offset-[6px] transition-colors hover:text-gold hover:decoration-gold/60"
              >
                Full detail page
              </Link>
            </div>
          </div>
        </div>

        <div className="absolute inset-x-0 bottom-0 h-[3px] bg-white/10">
          <div
            key={paused ? "paused" : safeIndex}
            className={paused ? "h-full w-full origin-left bg-gold/60" : "listing-showcase-progress h-full w-full bg-gold"}
            style={{ ["--showcase-hold" as string]: `${HOLD_MS}ms` }}
            aria-hidden
          />
        </div>
      </section>

      <ShowcaseDetailsPanel
        listing={listing}
        street={street}
        city={city}
        addressHint={addressHint}
        insight={insight}
        remarks={remarks}
        detailRows={detailRows}
        isRental={isRental}
        goldilocksScore={data?.goldilocksScore}
        goldilocksBreakdown={data?.goldilocksBreakdown}
      />
    </div>
  );
}
