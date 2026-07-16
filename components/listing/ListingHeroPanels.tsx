"use client";

import { Suspense, useEffect } from "react";
import { warmListingTabs } from "@/lib/warm-listing-cache";
import ListingHeader from "@/components/listing/ListingHeader";
import ListingLocationMap from "@/components/listing/ListingLocationMap";
import ListingSubnav, {
  type ListingInterestProps,
  type ListingTab,
} from "@/components/listing/ListingSubnav";
import { DealBoardStatusBadge } from "@/components/intelligence/deal-board/deal-board-shared";
import { listingPanelCompactClass } from "@/components/listing/listing-frame";
import ListingInterestButton from "@/components/listing/ListingInterestButton";
import { ListingBackLink } from "@/components/listing/ListingShell";
import { formatMlsStatus } from "@/lib/listing-history";
import type { ComponentProps, ReactNode } from "react";

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

  // On first open of a property (any tab), warm every tab's server data so
  // Comparables / Comparable Rentals / If load from cache when the user bounces
  // between tabs instead of being recomputed each visit.
  useEffect(() => {
    warmListingTabs(subnav.mlsId);
  }, [subnav.mlsId]);
  const compactHero = Boolean(belowTabs || belowHero || sidebar || footer || interest);

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
    <div className="mb-2 flex items-start justify-between gap-3">
      <ListingBackLink className="" />
      {statusBadge}
    </div>
  ) : null;

  const propertyPanel = (
    <div className={frameClass}>
      {topRow}
      <div className="mb-2 flex items-start justify-between gap-3">
        <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-gold">
          Property Details
        </p>
      </div>
      <ListingHeader
        {...header}
        privacyMode={header.privacyMode ?? false}
        hideMarketMeta={header.hideMarketMeta ?? isSpotlight}
        insight={subnav.active === "overview" ? header.insight : null}
        heroAside={subnav.active !== "overview"}
        tabsSlot={
          <Suspense fallback={null}>
            <ListingSubnav {...subnav} embedded compact />
          </Suspense>
        }
        className="mb-0"
        compact
      />
      {belowTabs ? (
        <div className="mt-3 pt-3 border-t border-white/10">{belowTabs}</div>
      ) : null}
    </div>
  );

  const locationPanel = (
    <div
      className={`${frameClass} flex flex-col min-h-[16rem] sm:min-h-[18rem] lg:min-h-[20rem]`}
    >
      <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-gold mb-2">
        Location
      </p>
      {/* Grow to fill the panel frame instead of a fixed height that left a gap. */}
      <ListingLocationMap
        latitude={location.latitude}
        longitude={location.longitude}
        addressQuery={location.addressQuery}
        variant="hero"
        className="flex-1 min-h-0"
        hideLabel
        hidePin={location.hidePin}
        defaultZoom={location.defaultZoom}
      />
    </div>
  );

  const interestButton = interest ? (
    <ListingInterestButton
      mlsId={interest.mlsId}
      address={interest.address}
      city={interest.city}
    />
  ) : null;

  // Sticky (map stays in view while the details column scrolls) but no inner
  // max-height/overflow — that produced a tacky full-height scrollbar beside
  // the map. Content flows naturally so nothing is clipped.
  const rightColumn = (
    <div className="min-w-0 flex flex-col gap-4 lg:sticky lg:top-20">
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
