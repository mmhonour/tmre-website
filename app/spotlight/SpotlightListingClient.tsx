"use client";

import { fmtMoney, formatMlsStatus } from "@/lib/listing-history";
import { buildSpotlightDetailsPanelProps } from "@/lib/listing-detail-panel-props";
import ListingErrorPanel from "@/components/listing/ListingErrorPanel";
import { ListingOverviewPhotoDeck } from "@/components/listing/ListingOverviewPhotoDeck";
import ListingSidebar from "@/components/listing/ListingSidebar";
import { SpotlightPageChrome } from "@/components/spotlight/SpotlightPageChrome";
import { useSpotlightListing } from "@/hooks/useSpotlightListing";
import { ListingShell } from "@/components/listing/ListingShell";
import {
  spotlightObfuscatesPhotoWithPrivacy,
  spotlightEffectiveHeaderAddress,
} from "@/lib/spotlight-privacy-shared";
import { spotlightSectionHref } from "@/lib/spotlight-url";
import type { SpotlightPropertyTabId } from "@/lib/spotlight-listing";
import { spotlightPropertySearchParam } from "@/lib/spotlight-listing";

function spotlightPhotosHref(
  propertyTab: SpotlightPropertyTabId,
  photoIndex?: number,
): string {
  const params = new URLSearchParams();
  const propertyParam = spotlightPropertySearchParam(propertyTab);
  if (propertyParam) params.set("property", propertyParam);
  if (photoIndex != null) params.set("photo", String(photoIndex));
  const qs = params.toString();
  return qs ? `${spotlightSectionHref("photos")}?${qs}` : spotlightSectionHref("photos");
}

export default function SpotlightListingClient() {
  const { display, loadState, mlsListing, goldilocksScore, goldilocksBreakdown, insight, propertyTab, privacy } =
    useSpotlightListing();

  if (loadState === "error") {
    return (
      <ListingShell variant="spotlight">
        <ListingErrorPanel
          title="Couldn't load spotlight"
          body="Try again in a moment."
        />
      </ListingShell>
    );
  }

  const details = buildSpotlightDetailsPanelProps(display, mlsListing, fmtMoney);
  const isClosed = details.isClosed;
  const isComingSoon = formatMlsStatus(display.status) === "Coming Soon";
  const obfuscatePhoto = (index: number) =>
    spotlightObfuscatesPhotoWithPrivacy(display.config, index, privacy);

  const headerAddress = spotlightEffectiveHeaderAddress(
    display.config,
    mlsListing,
    privacy,
  );
  const publicAddressLabel = headerAddress.street;

  return (
    <SpotlightPageChrome
      active="overview"
      display={display}
      propertyTab={propertyTab}
      mlsListing={mlsListing}
      isClosed={isClosed}
      goldilocksScore={goldilocksScore}
      goldilocksBreakdown={goldilocksBreakdown}
      insight={insight}
      belowTabs={
        <ListingOverviewPhotoDeck
          remarks={display.remarks}
          mlsId={display.mlsId}
          photoCount={display.photoCount > 0 ? display.photoCount : null}
          address={publicAddressLabel}
          city={privacy.showAddress ? display.config.address.city : null}
          heroAlt={display.config.displayTitle}
          galleryHref={spotlightPhotosHref(propertyTab)}
          hideHero={isComingSoon}
          obfuscatePhotoIndex={obfuscatePhoto}
        />
      }
      sidebar={<ListingSidebar details={details} />}
    />
  );
}
