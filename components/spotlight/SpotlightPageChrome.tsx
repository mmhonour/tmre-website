"use client";

import ListingHeroPanels from "@/components/listing/ListingHeroPanels";
import ListingHeroPhoto from "@/components/listing/ListingHeroPhoto";
import { ListingShell } from "@/components/listing/ListingShell";
import { type ListingTab } from "@/components/listing/ListingSubnav";
import { useSpotlightPrivacy } from "@/hooks/useSpotlightPrivacy";
import { intelligenceSearchHrefFromListing } from "@/lib/intelligence-search-url";
import {
  listingHeaderScoreProps,
  type ListingScoreApiFields,
} from "@/lib/listing-header-score-props";
import { formatMlsStatus } from "@/lib/listing-history";
import { listingPhotoProxyUrl } from "@/lib/listing-url";
import type { SpotlightDisplay, SpotlightMlsListing } from "@/lib/spotlight-display";
import { spotlightAllowsInterest } from "@/lib/spotlight-display";
import {
  spotlightPropertySearchParam,
  type SpotlightPropertyTabId,
} from "@/lib/spotlight-listing";
import {
  spotlightEffectiveHeaderAddress,
  spotlightEffectiveMapLocation,
  spotlightObfuscatesPhotoWithPrivacy,
} from "@/lib/spotlight-privacy-shared";
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
  mlsListing = null,
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
  mlsListing?: SpotlightMlsListing | null;
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

  // On non-Overview tabs the Overview client doesn't supply a heroSlot, so
  // build a default (index 0) hero here that links to the Photos tab. The
  // Overview tab supplies its own thumbnail-driven hero via `heroSlot`.
  const isComingSoon = formatMlsStatus(display.status) === "Coming Soon";
  const effectiveHeroSlot =
    heroSlot ??
    (active !== "overview" && !isComingSoon && display.photoCount > 0 ? (
      <ListingHeroPhoto
        url={listingPhotoProxyUrl(display.mlsId, 0)}
        alt={display.config.displayTitle}
        href={spotlightPhotosHref(propertyTab)}
        photoCount={display.photoCount}
        photoIndex={0}
        obfuscate={spotlightObfuscatesPhotoWithPrivacy(
          display.config,
          0,
          privacy,
        )}
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
          address: headerAddress,
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
