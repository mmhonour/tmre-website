"use client";

import Link from "next/link";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import ListingErrorPanel from "@/components/listing/ListingErrorPanel";
import ListingHeader from "@/components/listing/ListingHeader";
import ListingHeroPhoto from "@/components/listing/ListingHeroPhoto";
import ListingHistoryPanel from "@/components/ListingHistoryPanel";
import ListingInterestButton from "@/components/listing/ListingInterestButton";
import ListingLocationMap from "@/components/listing/ListingLocationMap";
import { ListingComparablesPageContent } from "@/components/listing/ListingComparablesPanel";
import { ListingIfPageContent } from "@/components/listing/ListingIfPanel";
import { ListingMobileScrollSections } from "@/components/listing/ListingMobileScrollSections";
import { ListingOverviewPhotoDeck } from "@/components/listing/ListingOverviewPhotoDeck";
import ListingSidebar from "@/components/listing/ListingSidebar";
import ListingSubnav, { type ListingTab } from "@/components/listing/ListingSubnav";
import { ListingUagPageContent } from "@/components/listing/ListingUagPanel";
import PhotoGallery from "@/components/listing/PhotoGallery";
import { DealBoardStatusBadge } from "@/components/intelligence/deal-board/deal-board-shared";
import { listingPanelCompactClass } from "@/components/listing/listing-frame";
import { SpotlightPropertyTabs } from "@/components/spotlight/SpotlightPropertyTabs";
import { useSpotlightListing } from "@/hooks/useSpotlightListing";
import { intelligenceSearchHrefFromListing } from "@/lib/intelligence-search-url";
import { buildSpotlightDetailsPanelProps } from "@/lib/listing-detail-panel-props";
import {
  listingHeaderScoreProps,
} from "@/lib/listing-header-score-props";
import { formatMlsStatus, fmtMoney } from "@/lib/listing-history";
import {
  listingPhotoProxyUrl,
  listingPhotoProxyUrlsFromCount,
} from "@/lib/listing-url";
import { spotlightAllowsInterest } from "@/lib/spotlight-display";

const DEFAULT_UPPER_PCT = 46;
const MIN_UPPER_PCT = 28;
const MAX_UPPER_PCT = 70;

/**
 * Vertical-split sandbox for Spotlight / listing pages.
 * Locked to Spotlight property #1 with the real chrome + tab bodies.
 * Panes scroll without visible scrollbars; document scroll is locked.
 */
export default function ListingSplitTestClient() {
  return (
    <Suspense
      fallback={
        <div className="fixed inset-x-0 top-20 bottom-0 z-[45] flex items-center justify-center bg-[#0F1824] text-white/50 font-mono text-[11px] tracking-[0.16em] uppercase">
          Loading _test…
        </div>
      }
    >
      <ListingSplitTestInner />
    </Suspense>
  );
}

function ListingSplitTestInner() {
  const {
    display,
    loadState,
    mlsListing,
    goldilocksScore,
    goldilocksBreakdown,
    insight,
    photos,
    photosState,
    presentation,
  } = useSpotlightListing({ photos: true, propertyTabOverride: 1 });

  const [tab, setTab] = useState<ListingTab>("overview");
  const [upperPct, setUpperPct] = useState(DEFAULT_UPPER_PCT);
  const [dragging, setDragging] = useState(false);
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);
  const shellRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.documentElement.classList.add("listing-split-test");
    return () => {
      document.documentElement.classList.remove("listing-split-test");
    };
  }, []);

  useEffect(() => {
    setActivePhotoIndex(0);
  }, [display.mlsId]);

  useEffect(() => {
    if (loadState === "error" || !display.mlsId) return;
    void fetch(`/api/listings/${encodeURIComponent(display.mlsId)}/warm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ gallery: true }),
    }).catch(() => undefined);
  }, [display.mlsId, loadState]);

  const onPointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDragging(true);
  }, []);

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!dragging) return;
      const shell = shellRef.current;
      if (!shell) return;
      const rect = shell.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const pct = (y / rect.height) * 100;
      setUpperPct(Math.min(MAX_UPPER_PCT, Math.max(MIN_UPPER_PCT, pct)));
    },
    [dragging],
  );

  const endDrag = useCallback(() => setDragging(false), []);

  useEffect(() => {
    if (!dragging) return;
    const prev = document.body.style.userSelect;
    document.body.style.userSelect = "none";
    return () => {
      document.body.style.userSelect = prev;
    };
  }, [dragging]);

  const galleryPhotos = useMemo(() => {
    if (photos.length > 0) return photos;
    return listingPhotoProxyUrlsFromCount(
      display.mlsId,
      display.photoCount ?? 0,
    );
  }, [photos, display.mlsId, display.photoCount]);

  const photoCount =
    galleryPhotos.length > 0
      ? galleryPhotos.length
      : display.photoCount && display.photoCount > 0
        ? display.photoCount
        : 0;

  const details = buildSpotlightDetailsPanelProps(
    display,
    mlsListing,
    fmtMoney,
    presentation,
  );

  const bedBathSearchHref = intelligenceSearchHrefFromListing(
    display.intelligenceListing,
  );

  const statusLabel = formatMlsStatus(display.status);
  const statusBadge =
    statusLabel && !(display.config.hideStatusBadge ?? false) ? (
      <span className="shrink-0">
        <DealBoardStatusBadge status={statusLabel} size="sm" surface="listing" />
      </span>
    ) : null;

  const headerShared = {
    mlsId: display.mlsId,
    status: display.status,
    address: presentation.headerAddress,
    propertyType: display.propertyType,
    style: display.style,
    beds: display.beds,
    baths: display.baths,
    sqft: display.sqft,
    yearBuilt: display.yearBuilt,
    bedBathSearchHref,
    privacyMode: presentation.privacyMode,
    hideMarketMeta: true,
    className: "mb-0" as const,
    compact: true as const,
    ...listingHeaderScoreProps({
      goldilocksScore,
      goldilocksBreakdown,
      insight: tab === "overview" ? insight : null,
      title: display.config.displayTitle,
      subtitle: display.config.displayLocation,
      propertyType: display.propertyType,
    }),
  };

  if (loadState === "error") {
    return (
      <div className="fixed inset-x-0 top-20 bottom-0 z-[45] bg-[#0F1824] px-6 py-10 overflow-hidden">
        <ListingErrorPanel
          title="Couldn't load Spotlight #1"
          body="Try again in a moment."
        />
      </div>
    );
  }

  const interest = spotlightAllowsInterest(display)
    ? {
        mlsId: display.config.id,
        address: presentation.interestAddress,
        city: presentation.interestCity,
      }
    : null;

  const lowerBody = (() => {
    if (tab === "history") {
      return (
        <ListingHistoryPanel
          mlsId={display.mlsId}
          townHint={presentation.townHint}
          variant="page"
        />
      );
    }
    if (tab === "photos") {
      if (photosState === "loading") {
        return (
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] aspect-[16/10] flex items-center justify-center">
            <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-white/45">
              Loading photography…
            </span>
          </div>
        );
      }
      if (photosState === "error") {
        return (
          <ListingErrorPanel
            title="Couldn't load photos"
            body="Try again in a moment."
          />
        );
      }
      if (galleryPhotos.length > 0) {
        return (
          <PhotoGallery
            photos={galleryPhotos}
            active={activePhotoIndex}
            setActive={setActivePhotoIndex}
            address={presentation.headerAddress.street}
            obfuscatePhotoIndex={presentation.shouldObfuscatePhoto}
          />
        );
      }
      return (
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] aspect-[16/10] flex flex-col items-center justify-center gap-3 px-6 text-center">
          <span className="font-mono text-[10px] tracking-[0.25em] uppercase text-gold">
            Spotlight
          </span>
          <p className="font-serif italic text-2xl text-white">
            {presentation.isComingSoon
              ? "Coming Soon..."
              : presentation.headerAddress.street || "Spotlight"}
          </p>
        </div>
      );
    }
    if (tab === "comparables") {
      return (
        <ListingComparablesPageContent
          mlsId={display.mlsId}
          townHint={presentation.townHint}
          kind="sale"
          fetchUrl="/api/spotlight/comparables"
        />
      );
    }
    if (tab === "comparable-rentals") {
      return (
        <ListingComparablesPageContent
          mlsId={display.mlsId}
          townHint={presentation.townHint}
          kind="rental"
          fetchUrl="/api/spotlight/comparables?kind=rental"
        />
      );
    }
    if (tab === "uag") {
      return (
        <ListingUagPageContent
          mlsId={display.mlsId}
          townHint={presentation.townHint}
          fetchUrl="/api/spotlight/uag"
        />
      );
    }
    if (tab === "if") {
      return (
        <ListingIfPageContent
          mlsId={display.mlsId}
          addressHint={presentation.ifAddressHint}
          townHint={presentation.townHint}
          routeBase="spotlight"
        />
      );
    }
    // overview
    return (
      <>
        <ListingOverviewPhotoDeck
          remarks={display.remarks}
          mlsId={display.mlsId}
          photoCount={photoCount > 0 ? photoCount : null}
          address={presentation.headerAddress.street}
          city={presentation.photoDeckCity}
          heroAlt={display.config.displayTitle}
          galleryHref={null}
          hideHero
          showHero={false}
          obfuscatePhotoIndex={presentation.shouldObfuscatePhoto}
          activePhotoIndex={activePhotoIndex}
          onPhotoSelect={(i) => {
            setActivePhotoIndex(i);
            setTab("photos");
          }}
        />
        <ListingMobileScrollSections
          mlsId={display.mlsId}
          addressHint={presentation.ifAddressHint}
          townHint={presentation.townHint}
          routeBase="spotlight"
          propertyParam={null}
        />
      </>
    );
  })();

  return (
    <div
      ref={shellRef}
      className="fixed inset-x-0 top-20 bottom-0 z-[45] flex flex-col bg-[#0F1824] text-white overflow-hidden"
    >
      <div className="shrink-0 flex flex-wrap items-center justify-between gap-2 border-b border-gold/30 bg-navy/95 px-4 py-2">
        <div className="min-w-0">
          <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-gold">
            _test · listing split · Spotlight #1
          </p>
          <p className="text-[11px] text-white/55 leading-snug">
            Upper: meta + photo stack · Lower: real tabs &amp; panels · no
            scrollbars · drag the gold bar to resize
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => setUpperPct(DEFAULT_UPPER_PCT)}
            className="font-mono text-[9px] tracking-[0.12em] uppercase text-white/50 hover:text-gold transition-colors"
          >
            Reset split
          </button>
          <Link
            href="/spotlight"
            className="font-mono text-[9px] tracking-[0.12em] uppercase text-white/60 hover:text-gold transition-colors"
          >
            Real Spotlight
          </Link>
        </div>
      </div>

      {/* Upper panel */}
      <div
        className="listing-split-pane min-h-0"
        style={{ height: `${upperPct}%` }}
      >
        <div className={`${listingPanelCompactClass} !mb-0`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <SpotlightPropertyTabs lockedTab={1} />
            </div>
            {statusBadge}
          </div>
          <div className="mb-1.5 mt-1 flex items-start justify-between gap-3">
            <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-gold">
              Property Details
            </p>
          </div>
          <ListingHeader {...headerShared} parts="meta" tabsSlot={null} />
        </div>

        <div className="flex flex-col gap-0 pb-3">
          {photoCount > 0 ? (
            Array.from({ length: photoCount }, (_, index) => (
              <div
                key={`${display.mlsId}-${index}`}
                role="button"
                tabIndex={0}
                className="relative w-full text-left border-y border-white/10 first:border-t-0 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold/50"
                onClick={() => {
                  setActivePhotoIndex(index);
                  setTab("photos");
                }}
                onKeyDown={(e) => {
                  if (e.key !== "Enter" && e.key !== " ") return;
                  e.preventDefault();
                  setActivePhotoIndex(index);
                  setTab("photos");
                }}
              >
                <ListingHeroPhoto
                  url={listingPhotoProxyUrl(display.mlsId, index)}
                  alt={`${display.config.displayTitle} · photo ${index + 1}`}
                  photoCount={photoCount}
                  photoIndex={index}
                  obfuscate={presentation.shouldObfuscatePhoto(index)}
                  bare
                />
              </div>
            ))
          ) : (
            <div className="mx-4 my-4 rounded-xl border border-white/10 bg-white/[0.04] aspect-[16/10] flex items-center justify-center">
              <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-white/45">
                {photosState === "loading"
                  ? "Loading photos…"
                  : "No photos yet"}
              </span>
            </div>
          )}
        </div>
      </div>

      <div
        role="separator"
        aria-orientation="horizontal"
        aria-valuenow={Math.round(upperPct)}
        aria-valuemin={MIN_UPPER_PCT}
        aria-valuemax={MAX_UPPER_PCT}
        aria-label="Resize upper and lower panels"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className={`shrink-0 z-10 flex h-3 cursor-row-resize touch-none items-center justify-center border-y border-gold/40 bg-navy select-none ${
          dragging ? "bg-gold/20" : "hover:bg-gold/10"
        }`}
      >
        <span className="h-0.5 w-10 rounded-full bg-gold/70" aria-hidden />
      </div>

      {/* Lower panel */}
      <div className="min-h-0 flex-1 flex flex-col overflow-hidden">
        <div className="shrink-0 px-4 sm:px-6 bg-[#1B2A4A]/95 border-b border-white/10">
          <ListingSubnav
            mlsId={display.mlsId}
            active={tab}
            addressHint={presentation.addressHint}
            townHint={presentation.townHint}
            routeBase="spotlight"
            embedded
            compact
            onTabSelect={setTab}
          />
        </div>

        <div className="listing-split-pane min-h-0 flex-1 px-4 sm:px-6 py-4">
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_min(22rem,32vw)] gap-x-7 lg:gap-x-10 gap-y-4 items-start">
            <div className="min-w-0 space-y-4">
              {tab === "overview" ? (
                <ListingHeader
                  {...headerShared}
                  parts="heroInsight"
                  heroSlot={null}
                  tabsSlot={null}
                />
              ) : null}
              {lowerBody}
            </div>
            <div className="min-w-0 flex flex-col gap-4">
              {interest ? (
                <ListingInterestButton
                  mlsId={interest.mlsId}
                  address={interest.address}
                  city={interest.city}
                />
              ) : null}
              <div className={listingPanelCompactClass}>
                <p className="shrink-0 font-mono text-[10px] tracking-[0.2em] uppercase text-gold mb-2">
                  Location
                </p>
                <div className="relative w-full h-64 sm:h-72">
                  <ListingLocationMap
                    latitude={presentation.mapLocation.latitude}
                    longitude={presentation.mapLocation.longitude}
                    addressQuery={presentation.mapLocation.addressQuery}
                    variant="hero"
                    className="absolute inset-0"
                    hideLabel
                    hidePin={presentation.mapLocation.hidePin}
                    defaultZoom={presentation.mapLocation.defaultZoom}
                  />
                </div>
              </div>
              <ListingSidebar details={details} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
