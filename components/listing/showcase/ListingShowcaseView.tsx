"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import ShowcaseDetailsPanel from "@/components/listing/showcase/ShowcaseDetailsPanel";
import ShowcasePhotoStage from "@/components/listing/showcase/ShowcasePhotoStage";
import ShowcasePremiereLights from "@/components/listing/showcase/ShowcasePremiereLights";
import ShowcaseSectionRail from "@/components/listing/showcase/ShowcaseSectionRail";
import ShowcaseStepArrow from "@/components/listing/showcase/ShowcaseStepArrow";
import { LISTING_PRODUCTION_PANEL_ID } from "@/components/listing/listing-section-ids";
import { showcaseListingFactsProse } from "@/components/listing/showcase/showcase-insight-prose";
import {
  buildShowcaseDetailRows,
  showcaseMapSubject,
  type ShowcaseHost,
} from "@/components/listing/showcase/showcase-host";
import { scrollToShowcaseSection } from "@/components/listing/showcase/showcase-sections";
import { useIsDesktop } from "@/components/listing/showcase/use-is-desktop";
import type { ShowcaseListing } from "@/components/listing/showcase/showcase-types";
import { formatListingHeaderPrice } from "@/lib/listing-header-price";
import {
  formatMlsStatus,
  primaryListingPrice,
  primaryListingPriceIsClosed,
} from "@/lib/listing-history";
import type { ListingScoreApiFields } from "@/lib/listing-header-score-props";
import type { ListingVisionLink } from "@/lib/listing-vision-link-shared";
import { isRentalListing } from "@/lib/listing-kind";
import type { ListingDetailsSchoolsPanelProps } from "@/components/listing/ListingDetailsSchoolsPanel";

const HOLD_MS = 6500;

export function usePrefersReducedMotion(): boolean {
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

export function ShowcaseMessage({ children }: { children: React.ReactNode }) {
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
      className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full border border-white/25 bg-black/25 text-white/85 backdrop-blur-sm transition-colors hover:border-gold/60 hover:bg-black/45 hover:text-gold"
    >
      {children}
    </button>
  );
}

/**
 * Shared full-bleed showcase: photo stage, rail, overlay type, details panel.
 * Listing and Spotlight hosts supply data + a `ShowcaseHost` adapter.
 */
export default function ListingShowcaseView({
  listing,
  photos,
  host,
  detailsPanelProps,
  remarks,
  insight,
  score,
  vision = null,
  productionPanel = false,
  productionPanelSlot = null,
  initialPhotoIndex = 0,
}: {
  listing: ShowcaseListing;
  photos: readonly string[];
  host: ShowcaseHost;
  detailsPanelProps: ListingDetailsSchoolsPanelProps;
  remarks: string;
  insight: string | null;
  score: ListingScoreApiFields;
  vision?: ListingVisionLink | null;
  productionPanel?: boolean;
  productionPanelSlot?: ReactNode;
  initialPhotoIndex?: number;
}) {
  const [index, setIndex] = useState(initialPhotoIndex);
  const [paused, setPaused] = useState(false);
  const [failed, setFailed] = useState<ReadonlySet<string>>(new Set());
  const [mapState, setMapState] = useState({ open: false, expanded: false });
  const [railDetailsOnly, setRailDetailsOnly] = useState(false);
  const reducedMotion = usePrefersReducedMotion();
  const isDesktop = useIsDesktop();

  const livePhotos = useMemo(() => {
    if (!host.showHero) return [] as string[];
    const visible = photos.filter((url) => !failed.has(url));
    return visible.length > 0 ? visible : photos.slice(0, 1);
  }, [photos, failed, host.showHero]);

  const total = livePhotos.length;
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
      const url = livePhotos[photoIndex];
      if (!url) return;
      setFailed((prev) => {
        if (prev.has(url)) return prev;
        const next = new Set(prev);
        next.add(url);
        return next;
      });
    },
    [livePhotos],
  );

  const status = formatMlsStatus(listing.status);
  const insightFacts = showcaseListingFactsProse(listing);
  const primaryPrice = primaryListingPrice(listing);
  const priceIsClosed = primaryListingPriceIsClosed(listing);
  const headerPrice =
    primaryPrice != null && primaryPrice > 0
      ? formatListingHeaderPrice(primaryPrice)
      : null;
  const isRental = isRentalListing(listing);
  const detailRows = buildShowcaseDetailRows(listing, {
    hideMlsNumber: host.hideMlsNumber,
  });
  const subject = showcaseMapSubject(listing, host, {
    price: primaryListingPrice(listing) ?? 0,
    score: score.goldilocksScore ?? 0,
    isRental,
  });

  return (
    <div className="bg-navy-dark text-white">
      <section className="relative min-h-[100dvh] w-full overflow-hidden">
        <ShowcasePhotoStage
          photos={livePhotos}
          index={safeIndex}
          altBase={host.photoAlt}
          drift={!reducedMotion && !paused}
          onPhotoFailed={markFailed}
          obfuscatePhoto={host.obfuscatePhoto}
        />

        <div className="listing-showcase-scrim-bottom pointer-events-none absolute inset-0" aria-hidden />
        <div className="listing-showcase-scrim-top pointer-events-none absolute inset-0" aria-hidden />
        {host.premiereLights ? <ShowcasePremiereLights /> : null}

        <ShowcaseStepArrow
          direction="prev"
          label="Previous photo"
          onClick={() => step(-1)}
          className={`absolute left-3 z-20 sm:left-6 ${
            railDetailsOnly
              ? "top-[calc(50%-14rem)]"
              : "top-1/2 -translate-y-1/2"
          }`}
        />
        {railDetailsOnly ? (
          <ShowcaseStepArrow
            direction="next"
            label="Next photo"
            onClick={() => step(1)}
            className="absolute right-3 top-[calc(50%-14rem)] z-20 sm:right-6"
          />
        ) : null}
        <ShowcaseSectionRail
          mlsId={listing.mlsId}
          insight={insight}
          insightFacts={insightFacts}
          detailRows={detailRows}
          townHint={host.townHint ?? host.city}
          postalCode={host.map.postalCode}
          subject={subject}
          detailsPanelProps={detailsPanelProps}
          onNext={() => step(1)}
          onMapStateChange={setMapState}
          onDetailsOnlyChange={setRailDetailsOnly}
          compsFetchUrl={host.compsFetchUrl}
          uagFetchUrl={host.uagFetchUrl}
          map={host.map}
        />

        <div className="listing-showcase-type pointer-events-none relative flex min-h-[100dvh] flex-col justify-between px-4 pb-10 pt-24 sm:px-8 lg:px-12 lg:pb-14 lg:pt-28">
          <div className="mx-auto flex w-full max-w-7xl items-start justify-between gap-6">
            <div className="max-w-xl">
              {host.propertyTabs ? (
                <div className="pointer-events-auto mb-3">{host.propertyTabs}</div>
              ) : null}
              {host.hideStatusBadge ? null : (
                <span className="inline-flex bg-[#0d1424]/85 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.25em] text-gold">
                  {status}
                </span>
              )}
              <h1 className="mt-2 font-serif text-3xl leading-tight sm:text-4xl lg:text-5xl">
                {host.headline}
              </h1>
              {host.locationLine ? (
                <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.22em] text-white/70">
                  {host.locationLine}
                </p>
              ) : null}
            </div>

            {headerPrice ? (
              <div
                className="shrink-0 text-right transition-[margin] duration-300"
                style={
                  isDesktop && mapState.open
                    ? {
                        marginRight: `max(0rem, calc(${
                          mapState.expanded ? "min(50vw, 44rem)" : "24rem"
                        } + 0.75rem - (100vw - min(80rem, 100vw - 6rem)) / 2))`,
                      }
                    : undefined
                }
              >
                <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-white/65">
                  {priceIsClosed ? "Closed at" : "Offered at"}
                </p>
                <p className="mt-1 font-serif text-3xl font-bold tabular-nums leading-none text-gold lg:text-4xl">
                  {headerPrice}
                </p>
              </div>
            ) : null}
          </div>

          <div className="mx-auto grid w-full max-w-7xl grid-cols-1 items-end gap-5 sm:grid-cols-[1fr_auto_1fr]">
            <button
              type="button"
              onClick={() => scrollToShowcaseSection("overview")}
              className="pointer-events-auto group max-w-md text-left font-mono text-[10px] uppercase tracking-[0.25em] text-white/70 transition-colors hover:text-gold"
            >
              Scroll for details
              <span
                aria-hidden
                className="ml-2 inline-block transition-transform group-hover:translate-y-0.5"
              >
                ↓
              </span>
            </button>

            <div className="flex items-center justify-center gap-3">
              {total > 0 ? (
                <>
                  <ControlButton
                    label={paused ? "Resume slideshow" : "Pause slideshow"}
                    onClick={() => setPaused((p) => !p)}
                  >
                    <span aria-hidden className="text-xs leading-none">
                      {paused ? "▶" : "❚❚"}
                    </span>
                  </ControlButton>
                  <span className="font-mono text-xs tracking-[0.2em] text-white/70 tabular-nums">
                    {String(safeIndex + 1).padStart(2, "0")} /{" "}
                    {String(total).padStart(2, "0")}
                  </span>
                </>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-4 sm:justify-end">
              {total > 0 ? (
                <button
                  type="button"
                  onClick={() => scrollToShowcaseSection("photos")}
                  className="pointer-events-auto font-mono text-[10px] uppercase tracking-[0.25em] text-white/75 underline decoration-white/30 underline-offset-[6px] transition-colors hover:text-gold hover:decoration-gold/60"
                >
                  See all photos
                </button>
              ) : null}
              {host.showClassicViewLink &&
              (host.classicViewHref || host.showcaseViewHref) ? (
                <Link
                  href={
                    productionPanel
                      ? host.showcaseViewHref || "#"
                      : host.classicViewHref || "#"
                  }
                  className="pointer-events-auto font-mono text-[10px] uppercase tracking-[0.25em] text-white/75 underline decoration-white/30 underline-offset-[6px] transition-colors hover:text-gold hover:decoration-gold/60"
                >
                  {productionPanel ? "Showcase view" : "Classic view"}
                </Link>
              ) : null}
            </div>
          </div>
        </div>

        {total > 0 ? (
          <div className="absolute inset-x-0 bottom-0 h-[3px] bg-white/10">
            <div
              key={paused ? "paused" : safeIndex}
              className={
                paused
                  ? "h-full w-full origin-left bg-gold/60"
                  : "listing-showcase-progress h-full w-full bg-gold"
              }
              style={{ ["--showcase-hold" as string]: `${HOLD_MS}ms` }}
              aria-hidden
            />
          </div>
        ) : null}
      </section>

      {productionPanel && productionPanelSlot ? (
        <div id={LISTING_PRODUCTION_PANEL_ID} className="border-t border-white/10">
          {productionPanelSlot}
        </div>
      ) : (
        <ShowcaseDetailsPanel
          listing={listing}
          street={host.street}
          city={host.city}
          addressHint={host.addressHint}
          insight={insight}
          insightFacts={insightFacts}
          remarks={remarks}
          detailRows={detailRows}
          isRental={isRental}
          photoCount={host.showHero ? total : photos.length}
          detailsPanelProps={detailsPanelProps}
          vision={vision}
          onSelectPhoto={(photoIndex) => {
            setIndex(photoIndex);
            setPaused(true);
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
          score={score}
          host={host}
        />
      )}
    </div>
  );
}
