"use client";

import { Suspense } from "react";
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
  belowTabs,
  belowHero,
  sidebar,
  footer,
  interest = null,
}: ListingHeroPanelsProps) {
  const isSpotlight = variant === "spotlight";
  const frameClass = listingPanelCompactClass;
  const compactHero = Boolean(belowTabs || belowHero || sidebar || footer || interest);

  const statusLabel = formatMlsStatus(header.status);

  const propertyPanel = (
    <div className={frameClass}>
      {!isSpotlight ? <ListingBackLink className="mb-4" /> : null}
      {propertyTabs}
      <div className="mb-2 flex items-start justify-between gap-3">
        <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-gold">
          Property Details
        </p>
        {statusLabel ? (
          <span className="shrink-0">
            <DealBoardStatusBadge
              status={statusLabel}
              size="sm"
              surface="listing"
            />
          </span>
        ) : null}
      </div>
      <ListingHeader
        {...header}
        privacyMode={header.privacyMode ?? false}
        hideMarketMeta={header.hideMarketMeta ?? isSpotlight}
        className="mb-0"
        compact
      />
      <Suspense fallback={null}>
        <ListingSubnav {...subnav} embedded compact />
      </Suspense>
      {belowTabs ? (
        <div className="mt-3 pt-3 border-t border-white/10">{belowTabs}</div>
      ) : null}
    </div>
  );

  const locationMapHeight = "h-[12rem] sm:h-[14rem] lg:h-[16rem]";

  const locationPanel = (
    <div
      className={`${frameClass} flex flex-col min-h-[16rem] sm:min-h-[18rem] lg:min-h-[20rem]`}
    >
      <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-gold mb-2">
        Location
      </p>
      <ListingLocationMap
        latitude={location.latitude}
        longitude={location.longitude}
        addressQuery={location.addressQuery}
        variant="hero"
        className={locationMapHeight}
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

  const rightColumn = (
    <div className="min-w-0 flex flex-col gap-4 lg:sticky lg:top-20 lg:max-h-[calc(100dvh-5rem)] lg:overflow-y-auto lg:overscroll-contain">
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
