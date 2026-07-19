"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import ListingHeader from "@/components/listing/ListingHeader";
import ListingLocationMap from "@/components/listing/ListingLocationMap";
import ListingSubnav, {
  type ListingInterestProps,
  type ListingTab,
} from "@/components/listing/ListingSubnav";
import { LISTING_SECTION_IDS } from "@/components/listing/listing-section-ids";
import { DealBoardStatusBadge } from "@/components/intelligence/deal-board/deal-board-shared";
import { listingPanelCompactClass } from "@/components/listing/listing-frame";
import ListingInterestButton from "@/components/listing/ListingInterestButton";
import { ListingBackLink } from "@/components/listing/ListingShell";
import { formatMlsStatus } from "@/lib/listing-history";
import type { ComponentProps, ReactNode } from "react";

/** Clears the fixed site nav (`pt-20` / `lg:pt-24` on ListingShell). */
const STICKY_TOP_CLASS = "top-20 lg:top-24";
/** `top-20` = 5rem — used for mobile tab pin below the meta sticky block. */
const MOBILE_NAV_TOP_REM = 5;

type ListingHeroPanelsProps = {
  header: ComponentProps<typeof ListingHeader>;
  location: {
    latitude: number | null;
    longitude: number | null;
    addressQuery: string;
    hidePin?: boolean;
    defaultZoom?: number;
  };
  subnav: {
    mlsId: string;
    active: ListingTab;
    addressHint?: string | null;
    townHint?: string | null;
    interest?: ListingInterestProps | null;
    routeBase?: "listing" | "spotlight";
  };
  variant?: "default" | "spotlight";
  /** Spotlight property tabs (1 / 2 / 3) rendered above the Property Details label. */
  propertyTabs?: ReactNode;
  /** Suppress the MLS status badge (e.g. the Coming Soon spotlight tab). */
  hideStatusBadge?: boolean;
  belowTabs?: ReactNode;
  /** Full-width content below the hero grid (e.g. comparables columns). */
  belowHero?: ReactNode;
  sidebar?: ReactNode;
  footer?: ReactNode;
  interest?: ListingInterestProps | null;
};

export default function ListingHeroPanels({
  header,
  location,
  subnav,
  variant = "default",
  propertyTabs = null,
  hideStatusBadge = false,
  belowTabs,
  belowHero,
  sidebar,
  footer,
  interest = null,
}: ListingHeroPanelsProps) {
  const isSpotlight = variant === "spotlight";
  const frameClass = listingPanelCompactClass;
  const compactHero = Boolean(belowTabs || belowHero || sidebar || footer || interest);
  const isOverview = subnav.active === "overview";
  const stickyChromeRef = useRef<HTMLDivElement>(null);
  const mobileMetaPinRef = useRef<HTMLDivElement>(null);
  const mobileTabsPinRef = useRef<HTMLDivElement>(null);
  const [mobileMetaPinHeight, setMobileMetaPinHeight] = useState(0);
  // Assume desktop chrome for SSR / first paint to avoid layout flash, then
  // switch to the mobile sticky-split once we know the viewport.
  const [isDesktop, setIsDesktop] = useState(true);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // Publish sticky chrome height so scroll-to-section targets clear the pinned tabs.
  useEffect(() => {
    const publish = () => {
      const desktop = stickyChromeRef.current;
      const mobileMeta = mobileMetaPinRef.current;
      const mobileTabs = mobileTabsPinRef.current;
      const height = isDesktop
        ? (desktop?.offsetHeight ?? 0)
        : (mobileMeta?.offsetHeight ?? 0) + (mobileTabs?.offsetHeight ?? 0);
      document.documentElement.style.setProperty(
        "--listing-sticky-offset",
        `${height + 12}px`,
      );
      if (mobileMeta) setMobileMetaPinHeight(mobileMeta.offsetHeight);
    };
    publish();
    const ro = new ResizeObserver(publish);
    if (stickyChromeRef.current) ro.observe(stickyChromeRef.current);
    if (mobileMetaPinRef.current) ro.observe(mobileMetaPinRef.current);
    if (mobileTabsPinRef.current) ro.observe(mobileTabsPinRef.current);
    return () => {
      ro.disconnect();
      document.documentElement.style.removeProperty("--listing-sticky-offset");
    };
  }, [subnav.active, belowTabs, propertyTabs, isOverview, isDesktop]);

  const statusLabel = formatMlsStatus(header.status);

  const statusBadge =
    statusLabel && !hideStatusBadge ? (
      <span className="shrink-0">
        <DealBoardStatusBadge status={statusLabel} size="sm" surface="listing" />
      </span>
    ) : null;

  // Hoist the status badge to the top row of the panel so it sits top-aligned
  // regardless of page: on Spotlight next to the "Spotlight Properties" tabs,
  // and on a property detail page next to the back link (same location).
  const topRow = propertyTabs ? (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">{propertyTabs}</div>
      {statusBadge}
    </div>
  ) : !isSpotlight ? (
    <div className="mb-1.5 flex items-start justify-between gap-3">
      <ListingBackLink className="" />
      {statusBadge}
    </div>
  ) : null;

  const headerShared = {
    ...header,
    privacyMode: header.privacyMode ?? false,
    hideMarketMeta: header.hideMarketMeta ?? isSpotlight,
    insight: isOverview ? header.insight : null,
    heroAside: !isOverview,
    className: "mb-0" as const,
    compact: true as const,
  };

  const tabsNav = (
    <Suspense fallback={null}>
      <ListingSubnav {...subnav} embedded compact />
    </Suspense>
  );

  const propertyDetailsLabel = (
    <div className="mb-1.5 flex items-start justify-between gap-3">
      <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-gold">
        Property Details
      </p>
    </div>
  );

  const stickySurfaceClass =
    "bg-[#1B2A4A]/95 backdrop-blur-md border-b border-white/10";

  const propertyPanel = (
    <div className={frameClass}>
      {isDesktop ? (
        /* Desktop: single sticky chrome (hero + insight + tabs together). */
        <div
          ref={stickyChromeRef}
          className={`sticky ${STICKY_TOP_CLASS} z-30 -mx-4 px-4 pt-1 pb-2 mb-1 ${stickySurfaceClass} shadow-[0_8px_24px_-12px_rgba(0,0,0,0.65)]`}
        >
          {topRow}
          {propertyDetailsLabel}
          <ListingHeader {...headerShared} tabsSlot={tabsNav} />
        </div>
      ) : (
        /* Mobile: pin through Style/Bed/Bath/Sqft; hero + Insight scroll away; tabs pin below. */
        <>
          <div
            ref={mobileMetaPinRef}
            className={`sticky ${STICKY_TOP_CLASS} z-30 -mx-4 px-4 pt-1 pb-1 ${stickySurfaceClass}`}
          >
            {topRow}
            {propertyDetailsLabel}
            <ListingHeader {...headerShared} parts="meta" tabsSlot={null} />
          </div>

          {isOverview ? (
            <ListingHeader {...headerShared} parts="heroInsight" tabsSlot={null} />
          ) : header.heroSlot ? (
            <div className="mt-2 flex justify-end">
              <div className="shrink-0" style={{ width: "40%", maxWidth: 220 }}>
                {header.heroSlot}
              </div>
            </div>
          ) : null}

          <div
            ref={mobileTabsPinRef}
            className={`sticky z-30 -mx-4 px-4 pb-1 ${stickySurfaceClass} shadow-[0_8px_24px_-12px_rgba(0,0,0,0.65)]`}
            style={{
              top: `calc(${MOBILE_NAV_TOP_REM}rem + ${mobileMetaPinHeight}px)`,
            }}
          >
            {tabsNav}
          </div>
        </>
      )}

      {belowTabs ? (
        <div
          id={
            subnav.active === "overview"
              ? LISTING_SECTION_IDS.overview
              : undefined
          }
          className="mt-3 pt-3 border-t border-white/10 scroll-mt-[var(--listing-sticky-offset,6rem)]"
        >
          {belowTabs}
        </div>
      ) : null}
    </div>
  );

  const locationPanel = (
    <div className={`${frameClass} flex flex-col`}>
      <p className="shrink-0 font-mono text-[10px] tracking-[0.2em] uppercase text-gold mb-2">
        Location
      </p>
      <div className="relative w-full h-64 sm:h-72 lg:h-80">
        <ListingLocationMap
          latitude={location.latitude}
          longitude={location.longitude}
          addressQuery={location.addressQuery}
          variant="hero"
          className="absolute inset-0"
          hideLabel
          hidePin={location.hidePin}
          defaultZoom={location.defaultZoom}
        />
      </div>
    </div>
  );

  const interestButton = interest ? (
    <ListingInterestButton
      mlsId={interest.mlsId}
      address={interest.address}
      city={interest.city}
    />
  ) : null;

  const rightColumn = (
    <div className={`min-w-0 flex flex-col gap-4 lg:sticky ${STICKY_TOP_CLASS}`}>
      {interestButton}
      {locationPanel}
      {sidebar ? <div className="shrink-0">{sidebar}</div> : null}
    </div>
  );

  return (
    <>
      <div
        className={`grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_min(22rem,32vw)] gap-x-7 lg:gap-x-10 gap-y-4 items-start ${
          compactHero ? "" : "mb-6"
        }`}
      >
        <div className="min-w-0 order-1 lg:col-start-1 lg:row-start-1">
          {propertyPanel}
          {footer ? <div className="mt-4">{footer}</div> : null}
        </div>

        <div className="min-w-0 order-2 lg:col-start-2 lg:row-start-1">
          {rightColumn}
        </div>
      </div>
      {belowHero ? (
        <div className="mt-6 lg:mt-8 border-t border-white/10 pt-6 lg:pt-8">
          {belowHero}
        </div>
      ) : null}
    </>
  );
}
