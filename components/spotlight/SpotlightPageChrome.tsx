"use client";

import ListingHeroPanels from "@/components/listing/ListingHeroPanels";
import { ListingShell } from "@/components/listing/ListingShell";
import { type ListingTab } from "@/components/listing/ListingSubnav";
import { intelligenceSearchHrefFromListing } from "@/lib/intelligence-search-url";
import {
  listingHeaderScoreProps,
  type ListingScoreApiFields,
} from "@/lib/listing-header-score-props";
import type { SpotlightDisplay } from "@/lib/spotlight-display";
import { spotlightAllowsInterest } from "@/lib/spotlight-display";
import { SpotlightPropertyTabs } from "@/components/spotlight/SpotlightPropertyTabs";
import type { ReactNode } from "react";

export function SpotlightPageChrome({
  active,
  display,
  isClosed,
  belowTabs,
  belowHero,
  sidebar,
  footer,
  goldilocksScore = null,
  goldilocksBreakdown = null,
}: {
  active: ListingTab;
  display: SpotlightDisplay;
  isClosed: boolean;
  belowTabs?: ReactNode;
  /** Full-width content below the hero grid (e.g. comparables columns). */
  belowHero?: ReactNode;
  sidebar?: ReactNode;
  footer?: ReactNode;
  goldilocksScore?: number | null;
  goldilocksBreakdown?: ListingScoreApiFields["goldilocksBreakdown"];
}) {
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
          dom: display.dom,
          address: display.headerAddress,
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
            title: display.config.displayTitle,
            subtitle: display.config.displayLocation,
            propertyType: display.propertyType,
          }),
        }}
        location={{
          latitude: display.latitude,
          longitude: display.longitude,
          addressQuery: display.mapsQuery,
        }}
        subnav={{
          mlsId: display.mlsId,
          active,
          addressHint: display.config.hideAddress
            ? null
            : display.config.displayTitle,
          townHint: display.config.address.city,
          routeBase: "spotlight",
        }}
        propertyTabs={<SpotlightPropertyTabs />}
        interest={
          spotlightAllowsInterest(display.config)
            ? {
                mlsId: display.config.id,
                address: display.config.hideAddress
                  ? display.config.displayLocation
                  : display.config.displayTitle,
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
