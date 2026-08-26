"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DealBoardStatusBadge } from "@/components/intelligence/deal-board/deal-board-shared";
import ListingHeader from "@/components/listing/ListingHeader";
import { ListingInsightCopy } from "@/components/listing/ListingInsightCopy";
import { ListingBackLink } from "@/components/listing/ListingShell";
import ListingSubnav from "@/components/listing/ListingSubnav";
import ShowcasePhotoStage from "@/components/listing/showcase/ShowcasePhotoStage";
import { intelligenceSearchHrefFromListing } from "@/lib/intelligence-search-url";
import {
  formatMlsStatus,
  primaryListingPrice,
  primaryListingPriceIsClosed,
} from "@/lib/listing-history";
import {
  listingHeaderScoreProps,
  type ListingScoreApiFields,
} from "@/lib/listing-header-score-props";
import { isRentalListing } from "@/lib/listing-kind";
import { parseLotAcresFromRaw } from "@/lib/listing-lot-acres";
import { propertyTaxFromRaw } from "@/lib/listing-property-tax";
import {
  listingDetailHref,
  listingPhotoProxyUrlsFromCount,
  listingPhotosHref,
  listingShareHref,
} from "@/lib/listing-url";
import { listingChromeApiUrl, loadTabJson } from "@/lib/tab-data-prefetch";

const HOLD_MS = 6500;
const MAX_PHOTOS = 40;
const REMARKS_KEYS = ["PublicRemarks", "RemarksPublicAddendum"];

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
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  yearBuilt: number | null;
  dom: number | null;
  modificationTimestamp: string | null;
  photoCount: number | null;
  remarks: string | null;
  schools: {
    elementary: string | null;
    middle: string | null;
    high: string | null;
    district: string | null;
  };
  raw: Record<string, string>;
};

type ApiResponse = ListingScoreApiFields & { listing: Listing };

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

        <div className="listing-showcase-type relative flex min-h-[100dvh] flex-col justify-between gap-10 px-4 pt-20 pb-10 sm:px-8 lg:px-12 lg:pt-24 lg:pb-14">
          {/*
            Real listing chrome — same header, insight and tab strip as the
            production Overview page, floated over the photo on a glass panel
            so it stays readable without cropping the image.
          */}
          <div className="listing-showcase-chrome mx-auto w-full max-w-7xl rounded-2xl px-4 py-4 sm:px-6 sm:py-5">
            <div className="mb-2 flex items-start justify-between gap-3">
              <ListingBackLink className="mb-0" />
              <span className="shrink-0">
                <DealBoardStatusBadge status={status} size="sm" surface="listing" />
              </span>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
              <div className="min-w-0 flex-1">
                <p className="mb-1.5 font-mono text-[10px] tracking-[0.2em] uppercase text-gold">
                  Property Details
                </p>
                <ListingHeader
                  parts="meta"
                  mlsId={listing.mlsId}
                  status={listing.status}
                  address={listing.address}
                  propertyType={listing.propertyType}
                  style={listing.style}
                  beds={listing.beds}
                  baths={listing.baths}
                  sqft={listing.sqft}
                  yearBuilt={listing.yearBuilt}
                  modificationTimestamp={listing.modificationTimestamp}
                  price={primaryListingPrice(listing)}
                  priceIsClosed={primaryListingPriceIsClosed(listing)}
                  bedBathSearchHref={intelligenceSearchHrefFromListing(listing)}
                  shareHref={listingShareHref(listing.mlsId)}
                  compact
                  {...listingHeaderScoreProps({
                    goldilocksScore: data?.goldilocksScore,
                    goldilocksBreakdown: data?.goldilocksBreakdown,
                    insight,
                    title: street,
                    subtitle: city,
                    propertyType: listing.propertyType,
                  })}
                />
              </div>

              {insight ? (
                <aside
                  className="min-w-0 sm:max-w-xs lg:max-w-sm"
                  aria-label="Listing insight"
                >
                  <p className="mb-1 font-mono text-[10px] tracking-[0.2em] uppercase text-gold sm:text-center">
                    Insight
                  </p>
                  <ListingInsightCopy
                    text={insight}
                    className="text-left text-[11px] leading-snug text-white/75 break-words"
                  />
                </aside>
              ) : null}
            </div>

            <div className="mt-3">
              <ListingSubnav
                mlsId={listing.mlsId}
                active="overview"
                addressHint={street || addressHint}
                townHint={city}
                isRental={isRental}
                compact
              />
            </div>
          </div>

          <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-md">
              <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-white/60">
                Showcase view
              </p>
              <p className="mt-1 text-sm text-white/75">
                {total} listing photo{total === 1 ? "" : "s"}, rotating automatically.
              </p>
            </div>

            <div className="flex flex-col items-start gap-5 lg:items-end">
              <div className="flex items-center gap-3">
                <ControlButton label="Previous photo" onClick={() => step(-1)}>
                  <span aria-hidden className="text-lg leading-none">
                    ‹
                  </span>
                </ControlButton>
                <ControlButton
                  label={paused ? "Resume slideshow" : "Pause slideshow"}
                  onClick={() => setPaused((p) => !p)}
                >
                  <span aria-hidden className="text-xs leading-none">
                    {paused ? "▶" : "❚❚"}
                  </span>
                </ControlButton>
                <ControlButton label="Next photo" onClick={() => step(1)}>
                  <span aria-hidden className="text-lg leading-none">
                    ›
                  </span>
                </ControlButton>
                <span className="ml-1 font-mono text-xs tracking-[0.2em] text-white/70 tabular-nums">
                  {String(safeIndex + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-4">
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

      <section className="navy-gradient relative border-t border-white/10 px-6 py-20 sm:px-10 lg:px-16">
        <div className="absolute inset-0 hero-grid opacity-20" aria-hidden />
        <div className="relative mx-auto grid max-w-6xl gap-14 lg:grid-cols-[1.4fr_1fr]">
          <div>
            <h2 className="font-mono text-[10px] uppercase tracking-[0.3em] text-gold">
              About this property
            </h2>
            {remarks ? (
              <p className="mt-6 whitespace-pre-line text-base leading-relaxed text-white/80">
                {remarks}
              </p>
            ) : (
              <p className="mt-6 text-base text-white/50">
                No public remarks on this listing.
              </p>
            )}
          </div>

          <div>
            <h2 className="font-mono text-[10px] uppercase tracking-[0.3em] text-gold">
              Features &amp; amenities
            </h2>
            <dl className="mt-6 divide-y divide-white/10 border-y border-white/10">
              {detailRows.map((row) => (
                <div
                  key={row.label}
                  className="flex items-baseline justify-between gap-6 py-3"
                >
                  <dt className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/45">
                    {row.label}
                  </dt>
                  <dd className="text-right text-sm text-white/90">{row.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>
    </div>
  );
}
