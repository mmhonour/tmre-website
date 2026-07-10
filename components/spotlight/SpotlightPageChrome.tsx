"use client";

import ListingHeroPanels from "@/components/listing/ListingHeroPanels";
import { ListingShell } from "@/components/listing/ListingShell";
import { type ListingTab } from "@/components/listing/ListingSubnav";
import { useSpotlightPrivacy } from "@/hooks/useSpotlightPrivacy";
import { intelligenceSearchHrefFromListing } from "@/lib/intelligence-search-url";
import {
  listingHeaderScoreProps,
  type ListingScoreApiFields,
} from "@/lib/listing-header-score-props";
import type { SpotlightDisplay, SpotlightMlsListing } from "@/lib/spotlight-display";
import { spotlightAllowsInterest } from "@/lib/spotlight-display";
import type { SpotlightPropertyTabId } from "@/lib/spotlight-listing";
import {
  spotlightEffectiveHeaderAddress,
  spotlightEffectiveMapLocation,
} from "@/lib/spotlight-privacy-shared";
import { SpotlightPropertyTabs } from "@/components/spotlight/SpotlightPropertyTabs";
import type { ReactNode } from "react";

export function SpotlightPageChrome({
  active,
  display,
  propertyTab,
  mlsListing = null,
  isClosed,
  belowTabs,
  belowHero,
  sidebar,
  footer,
  goldilocksScore = null,
  goldilocksBreakdown = null,
  insight = null,
}: {
  active: ListingTab;
  display: SpotlightDisplay;
  propertyTab: SpotlightPropertyTabId;
  mlsListing?: SpotlightMlsListing | null;
  isClosed: boolean;
  belowTabs?: ReactNode;
  /** Full-width content below the hero grid (e.g. comparables columns). */
  belowHero?: ReactNode;
  sidebar?: ReactNode;
  footer?: ReactNode;
  goldilocksScore?: number | null;
  goldilocksBreakdown?: ListingScoreApiFields["goldilocksBreakdown"];
  insight?: string | null;
}) {
  const privacy = useSpotlightPrivacy(propertyTab);
  const headerAddress = spotlightEffectiveHeaderAddress(
    display.config,
    mlsListing,
    privacy,
  );
  const mapLocation = spotlightEffectiveMapLocation(
    display.config,
    mlsListing,
    privacy,
  );
  const streetAddress =
    mlsListing?.address?.street?.trim() ||
    display.config.address.street.trim() ||
    display.config.displayTitle;

  const bedBathSearchHref = intelligenceSearchHrefFromListing(
    display.intelligenceListing,
  );

  return (
    <ListingShell variant="spotlight">
      <ListingHeroPanels
        variant="spotlight"
        header={{
          mlsId: display.mlsId,
          status: display.status,
          address: headerAddress,
          propertyType: display.propertyType,
          style: display.style,
          beds: display.beds,
          baths: display.baths,
          sqft: display.sqft,
          yearBuilt: display.yearBuilt,
          bedBathSearchHref,
          ...listingHeaderScoreProps({
            goldilocksScore,
            goldilocksBreakdown,
            insight,
            title: display.config.displayTitle,
            subtitle: display.config.displayLocation,
            propertyType: display.propertyType,
          }),
          privacyMode: !privacy.showAddress,
        }}
        location={{
          latitude: mapLocation.latitude,
          longitude: mapLocation.longitude,
          addressQuery: mapLocation.addressQuery,
          hidePin: mapLocation.hidePin,
          defaultZoom: mapLocation.defaultZoom,
        }}
        subnav={{
          mlsId: display.mlsId,
          active,
          addressHint: privacy.showAddress ? streetAddress : null,
          townHint: display.config.address.city,
          routeBase: "spotlight",
        }}
        propertyTabs={<SpotlightPropertyTabs />}
        interest={
          spotlightAllowsInterest(display.config)
            ? {
                mlsId: display.config.id,
                address: privacy.showAddress
                  ? streetAddress
                  : display.config.displayLocation,
                city: display.config.address.city,
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
