"use client";

import { Suspense } from "react";
import ListingHeader from "@/components/listing/ListingHeader";
import ListingLocationMap from "@/components/listing/ListingLocationMap";
import ListingSubnav, {
  type ListingInterestProps,
  type ListingTab,
} from "@/components/listing/ListingSubnav";
import { listingPanelCompactClass } from "@/components/listing/listing-frame";
import ListingInterestButton from "@/components/listing/ListingInterestButton";
import { ListingBackLink } from "@/components/listing/ListingShell";
import type { ComponentProps, ReactNode } from "react";

type ListingHeroPanelsProps = {
  header: ComponentProps<typeof ListingHeader>;
  location: {
    latitude: number | null;
    longitude: number | null;
    addressQuery: string;
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
  belowTabs,
  belowHero,
  sidebar,
  footer,
  interest = null,
}: ListingHeroPanelsProps) {
  const isSpotlight = variant === "spotlight";
  const frameClass = listingPanelCompactClass;
  const compactHero = Boolean(belowTabs || belowHero || sidebar || footer || interest);

  const propertyPanel = (
    <div className={frameClass}>
      {!isSpotlight ? <ListingBackLink className="mb-4" /> : null}
      <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-gold mb-2">
        Property Details
      </p>
      <ListingHeader
        {...header}
        privacyMode={header.privacyMode ?? isSpotlight}
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

  const locationPanel = (
    <div className={`${frameClass} flex flex-col`}>
      <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-gold mb-2">
        Location
      </p>
      <ListingLocationMap
        latitude={location.latitude}
        longitude={location.longitude}
        addressQuery={location.addressQuery}
        variant="hero"
        className="h-[9rem] lg:h-[10rem]"
        hideLabel
        hidePin={isSpotlight}
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
    <div className="min-w-0 flex flex-col gap-4 lg:sticky lg:top-20">
      {interestButton}
      {locationPanel}
      {sidebar}
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
