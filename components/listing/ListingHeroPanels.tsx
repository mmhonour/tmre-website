"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import ListingHeader from "@/components/listing/ListingHeader";
import { ListingInsightCopy } from "@/components/listing/ListingInsightCopy";
import ListingLocationMap from "@/components/listing/ListingLocationMap";
import ListingSideDrawer from "@/components/listing/ListingSideDrawer";
import ListingSubnav, {
  type ListingInterestProps,
  type ListingTab,
} from "@/components/listing/ListingSubnav";
import { LISTING_SECTION_IDS } from "@/components/listing/listing-section-ids";
import { DealBoardStatusBadge } from "@/components/intelligence/deal-board/deal-board-shared";
import { listingPanelCompactClass } from "@/components/listing/listing-frame";
import ListingInterestButton from "@/components/listing/ListingInterestButton";
import { LISTING_CRITERIA_SLOT_ID } from "@/components/listing/ListingCriteriaSideLayout";
import { ListingBackLink } from "@/components/listing/ListingShell";
import { formatMlsStatus } from "@/lib/listing-history";
import type { ComponentProps, ReactNode } from "react";

type MobileDrawerId = "map" | "details" | null;

/** Clears the fixed site nav (`pt-20` / `lg:pt-24` on ListingShell). */
const STICKY_TOP_CLASS = "top-20 lg:top-24";

type ListingHeroPanelsProps = {
  header: ComponentProps<typeof ListingHeader>;
  location: {
    latitude: number | null;
    longitude: number | null;
    addressQuery: string;
    hidePin?: boolean;
    /** Spotlight privacy: outline this town with a ? instead of a property pin. */
    outlineTown?: string | null;
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
  const [mobileDrawer, setMobileDrawer] = useState<MobileDrawerId>(null);
  const closeMobileDrawer = useCallback(() => setMobileDrawer(null), []);

  // Publish sticky chrome height so scroll-to-section targets clear the pinned tabs.
  useEffect(() => {
    const publish = () => {
      const height = stickyChromeRef.current?.offsetHeight ?? 0;
      document.documentElement.style.setProperty(
        "--listing-sticky-offset",
        `${height + 12}px`,
      );
    };
    publish();
    const el = stickyChromeRef.current;
    if (!el) return;
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    return () => {
      ro.disconnect();
      document.documentElement.style.removeProperty("--listing-sticky-offset");
    };
  }, [subnav.active, belowTabs, propertyTabs, isOverview, header.insight]);

  const statusLabel = formatMlsStatus(header.status);
  const overviewInsight =
    isOverview && header.insight?.trim() ? header.insight.trim() : null;

  const statusBadge =
    statusLabel && !hideStatusBadge ? (
      <span className="shrink-0">
        <DealBoardStatusBadge status={statusLabel} size="sm" surface="listing" />
      </span>
    ) : null;

  const insightPanel = overviewInsight ? (
    <aside className="w-full text-left" aria-label="Listing insight">
      <p className="mb-1 font-mono text-[10px] tracking-[0.2em] uppercase text-gold">
        Insight
      </p>
      <ListingInsightCopy
        text={overviewInsight}
        className="text-[12px] sm:text-[13px] leading-snug text-white/70"
      />
    </aside>
  ) : null;

  /** Status + insight stack — right side of Property Details. */
  const statusInsightColumn =
    statusBadge || insightPanel ? (
      <div className="flex w-full shrink-0 flex-col items-end gap-2 sm:w-[min(17.5rem,42%)]">
        {statusBadge ? (
          <div className="flex w-full justify-end">{statusBadge}</div>
        ) : null}
        {insightPanel}
      </div>
    ) : null;

  const topLeft = propertyTabs ? (
    <div className="min-w-0">{propertyTabs}</div>
  ) : !isSpotlight ? (
    <ListingBackLink className="" />
  ) : null;

  const headerShared = {
    ...header,
    privacyMode: header.privacyMode ?? false,
    hideMarketMeta: header.hideMarketMeta ?? isSpotlight,
    // Insight renders in the Property Details right panel, not above the photos.
    insight: null,
    className: "mb-0" as const,
    compact: true as const,
  };

  const heroOnly = (
    <ListingHeader {...headerShared} parts="heroInsight" tabsSlot={null} />
  );

  const tabsNav = (
    <Suspense fallback={null}>
      <ListingSubnav {...subnav} embedded compact />
    </Suspense>
  );

  const stickySurfaceClass =
    "bg-[#1B2A4A]/95 backdrop-blur-md border-b border-white/10";

  const propertyPanel = (
    <div className={frameClass}>
      {/* Meta + section tabs stay pinned under the site nav while photos/content scroll. */}
      <div
        ref={stickyChromeRef}
        className={`sticky ${STICKY_TOP_CLASS} z-30 -mx-4 px-4 pt-1 pb-1 ${stickySurfaceClass} shadow-[0_8px_24px_-12px_rgba(0,0,0,0.65)]`}
      >
        {topLeft ? (
          <div className={propertyTabs ? undefined : "mb-1.5"}>{topLeft}</div>
        ) : null}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="min-w-0 flex-1">
            <p className="mb-1.5 font-mono text-[10px] tracking-[0.2em] uppercase text-gold">
              Property Details
            </p>
            <ListingHeader {...headerShared} parts="meta" tabsSlot={null} />
          </div>
          {statusInsightColumn}
        </div>

        <div className="mt-2">{tabsNav}</div>
      </div>

      {heroOnly}
    </div>
  );

  const mapBlock = (heightClass: string, showLabel: boolean) => (
    <div className={`${frameClass} flex flex-col`}>
      {showLabel ? (
        <p className="mb-2 shrink-0 font-mono text-[10px] tracking-[0.2em] uppercase text-gold">
          Location
        </p>
      ) : null}
      <div className={`relative w-full ${heightClass}`}>
        <ListingLocationMap
          latitude={location.latitude}
          longitude={location.longitude}
          addressQuery={location.addressQuery}
          variant="hero"
          className="absolute inset-0"
          hideLabel
          hidePin={location.hidePin}
          outlineTown={location.outlineTown}
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

  const detailsBlock = (
    <div className="flex min-w-0 flex-col gap-4">
      {interestButton}
      {sidebar ? <div className="shrink-0">{sidebar}</div> : null}
    </div>
  );

  const rightColumn = (
    <div
      className={`hidden min-w-0 flex-col gap-4 lg:sticky lg:flex ${STICKY_TOP_CLASS}`}
    >
      {interestButton}
      {mapBlock("h-64 sm:h-72 lg:h-80", true)}
      {sidebar ? <div className="shrink-0">{sidebar}</div> : null}
    </div>
  );

  const belowTabsBlock = belowTabs ? (
    <div
      id={
        subnav.active === "overview" ? LISTING_SECTION_IDS.overview : undefined
      }
      className="mt-3 scroll-mt-[var(--listing-sticky-offset,6rem)] border-t border-white/10 pt-3"
    >
      {belowTabs}
    </div>
  ) : null;

  const edgeTabClass = (active: boolean) =>
    `flex items-center justify-center rounded-l-lg border border-r-0 px-1.5 py-3 shadow-[-4px_0_16px_-8px_rgba(0,0,0,0.55)] transition-colors ${
      active
        ? "border-gold/50 bg-gold text-navy"
        : "border-white/15 bg-[#1B2A4A]/95 text-gold backdrop-blur-md hover:border-gold/40 hover:text-gold-light"
    }`;

  return (
    <>
      <div
        className={`grid grid-cols-1 items-start gap-x-7 gap-y-4 lg:grid-cols-[minmax(0,1fr)_min(22rem,32vw)] lg:gap-x-10 ${
          compactHero ? "" : "mb-6"
        }`}
      >
        <div className="order-1 min-w-0 lg:col-start-1 lg:row-start-1">
          {propertyPanel}
        </div>

        <div className="order-2 min-w-0 lg:col-start-2 lg:row-start-1">
          {rightColumn}
        </div>

        {belowTabsBlock ? (
          <div className="order-3 min-w-0 lg:col-start-1 lg:row-start-2">
            {belowTabsBlock}
            {footer ? <div className="mt-4">{footer}</div> : null}
          </div>
        ) : footer ? (
          <div className="order-3 min-w-0 lg:col-start-1 lg:row-start-2">
            <div className="mt-4">{footer}</div>
          </div>
        ) : null}

        {/* Under Details, top-aligned with Comparables / tab content — Criteria portals in. */}
        <div
          id={LISTING_CRITERIA_SLOT_ID}
          className={`order-4 hidden min-w-0 empty:hidden lg:col-start-2 lg:row-start-2 lg:sticky lg:block ${STICKY_TOP_CLASS}`}
        />
      </div>
      {belowHero ? (
        <div className="mt-6 border-t border-white/10 pt-6 lg:mt-8 lg:pt-8">
          {belowHero}
        </div>
      ) : null}

      {/* Mobile: Map + Details peek from the right edge and open as slide-overs. */}
      <div
        className="fixed right-0 top-[42%] z-[60] flex -translate-y-1/2 flex-col gap-2 lg:hidden"
        role="group"
        aria-label="Listing side panels"
      >
        <button
          type="button"
          className={edgeTabClass(mobileDrawer === "map")}
          aria-expanded={mobileDrawer === "map"}
          aria-controls="listing-map-drawer"
          onClick={() =>
            setMobileDrawer((prev) => (prev === "map" ? null : "map"))
          }
        >
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] [writing-mode:vertical-rl] rotate-180">
            Map
          </span>
        </button>
        {sidebar || interest ? (
          <button
            type="button"
            className={edgeTabClass(mobileDrawer === "details")}
            aria-expanded={mobileDrawer === "details"}
            aria-controls="listing-details-drawer"
            onClick={() =>
              setMobileDrawer((prev) =>
                prev === "details" ? null : "details",
              )
            }
          >
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] [writing-mode:vertical-rl] rotate-180">
              Details
            </span>
          </button>
        ) : null}
      </div>

      <ListingSideDrawer
        open={mobileDrawer === "map"}
        onClose={closeMobileDrawer}
        title="Map"
      >
        <div id="listing-map-drawer">
          {mapBlock("h-[min(70vh,28rem)]", false)}
        </div>
      </ListingSideDrawer>

      <ListingSideDrawer
        open={mobileDrawer === "details"}
        onClose={closeMobileDrawer}
        title="Details"
      >
        <div id="listing-details-drawer">{detailsBlock}</div>
      </ListingSideDrawer>
    </>
  );
}
