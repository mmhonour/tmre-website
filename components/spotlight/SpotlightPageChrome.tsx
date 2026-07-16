"use client";

import ListingHeroPanels from "@/components/listing/ListingHeroPanels";
import ListingHeroPhoto from "@/components/listing/ListingHeroPhoto";
import { ListingShell } from "@/components/listing/ListingShell";
import { type ListingTab } from "@/components/listing/ListingSubnav";
import { intelligenceSearchHrefFromListing } from "@/lib/intelligence-search-url";
import {
  listingHeaderScoreProps,
  type ListingScoreApiFields,
} from "@/lib/listing-header-score-props";
import { listingPhotoProxyUrl } from "@/lib/listing-url";
import type { SpotlightDisplay } from "@/lib/spotlight-display";
import { spotlightAllowsInterest } from "@/lib/spotlight-display";
import {
  spotlightPropertySearchParam,
  type SpotlightPropertyTabId,
} from "@/lib/spotlight-listing";
import type { SpotlightPresentation } from "@/lib/spotlight-privacy-shared";
import { spotlightSectionHref } from "@/lib/spotlight-url";
import { SpotlightPropertyTabs } from "@/components/spotlight/SpotlightPropertyTabs";
import type { ReactNode } from "react";

function spotlightPhotosHref(propertyTab: SpotlightPropertyTabId): string {
  const propertyParam = spotlightPropertySearchParam(propertyTab);
  const base = spotlightSectionHref("photos");
  return propertyParam ? `${base}?property=${propertyParam}` : base;
}

export function SpotlightPageChrome({
  active,
  display,
  propertyTab,
  presentation,
  isClosed,
  belowTabs,
  belowHero,
  sidebar,
  footer,
  heroSlot,
  goldilocksScore = null,
  goldilocksBreakdown = null,
  insight = null,
}: {
  active: ListingTab;
  display: SpotlightDisplay;
  propertyTab: SpotlightPropertyTabId;
  presentation: SpotlightPresentation;
  isClosed: boolean;
  belowTabs?: ReactNode;
  /** Full-width content below the hero grid (e.g. comparables columns). */
  belowHero?: ReactNode;
  sidebar?: ReactNode;
  footer?: ReactNode;
  /** Primary photo rendered between the meta line and the insight in the header. */
  heroSlot?: ReactNode;
  goldilocksScore?: number | null;
  goldilocksBreakdown?: ListingScoreApiFields["goldilocksBreakdown"];
  insight?: string | null;
}) {
  const bedBathSearchHref = intelligenceSearchHrefFromListing(
    display.intelligenceListing,
  );

  const effectiveHeroSlot =
    heroSlot ??
    (active !== "overview" && presentation.showHero ? (
      <ListingHeroPhoto
        url={listingPhotoProxyUrl(display.mlsId, 0)}
        alt={display.config.displayTitle}
        href={spotlightPhotosHref(propertyTab)}
        photoCount={display.photoCount}
        photoIndex={0}
        obfuscate={presentation.shouldObfuscatePhoto(0)}
        bare
      />
    ) : null);

  return (
    <ListingShell variant="spotlight">
      <ListingHeroPanels
        variant="spotlight"
        hideStatusBadge={display.config.hideStatusBadge ?? false}
        header={{
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
          heroSlot: effectiveHeroSlot,
          ...listingHeaderScoreProps({
            goldilocksScore,
            goldilocksBreakdown,
            insight,
            title: display.config.displayTitle,
            subtitle: display.config.displayLocation,
            propertyType: display.propertyType,
          }),
          privacyMode: presentation.privacyMode,
        }}
        location={{
          latitude: presentation.mapLocation.latitude,
          longitude: presentation.mapLocation.longitude,
          addressQuery: presentation.mapLocation.addressQuery,
          hidePin: presentation.mapLocation.hidePin,
          defaultZoom: presentation.mapLocation.defaultZoom,
        }}
        subnav={{
          mlsId: display.mlsId,
          active,
          addressHint: presentation.addressHint,
          townHint: presentation.townHint,
          routeBase: "spotlight",
        }}
        propertyTabs={<SpotlightPropertyTabs />}
        interest={
          spotlightAllowsInterest(display)
            ? {
                mlsId: display.config.id,
                address: presentation.interestAddress,
                city: presentation.interestCity,
              }
            : null
        }
        belowTabs={belowTabs}
        belowHero={belowHero}
        sidebar={sidebar}
        footer={footer}
      />
    </ListingShell>
  );
}
