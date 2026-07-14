"use client";

import { useEffect, useState } from "react";
import { fmtMoney, formatMlsStatus } from "@/lib/listing-history";
import { buildSpotlightDetailsPanelProps } from "@/lib/listing-detail-panel-props";
import ListingErrorPanel from "@/components/listing/ListingErrorPanel";
import ListingHeroPhoto from "@/components/listing/ListingHeroPhoto";
import { ListingOverviewPhotoDeck } from "@/components/listing/ListingOverviewPhotoDeck";
import ListingSidebar from "@/components/listing/ListingSidebar";
import { listingPhotoProxyUrl } from "@/lib/listing-url";
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
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);

  useEffect(() => {
    setActivePhotoIndex(0);
  }, [display.mlsId]);

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

  const heroSlot =
    !isComingSoon && display.photoCount > 0 ? (
      <ListingHeroPhoto
        url={listingPhotoProxyUrl(display.mlsId, activePhotoIndex)}
        alt={display.config.displayTitle}
        href={spotlightPhotosHref(propertyTab)}
        photoCount={display.photoCount}
        photoIndex={activePhotoIndex}
        obfuscate={obfuscatePhoto(activePhotoIndex)}
        bare
      />
    ) : null;

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
      heroSlot={heroSlot}
      belowTabs={
        <ListingOverviewPhotoDeck
          remarks={display.remarks}
          mlsId={display.mlsId}
          photoCount={display.photoCount > 0 ? display.photoCount : null}
          address={publicAddressLabel}
          city={privacy.showAddress ? display.config.address.city : null}
          heroAlt={display.config.displayTitle}
          galleryHref={spotlightPhotosHref(propertyTab)}
          photoHref={(i) => spotlightPhotosHref(propertyTab, i)}
          hideHero={isComingSoon}
          obfuscatePhotoIndex={obfuscatePhoto}
          activePhotoIndex={activePhotoIndex}
          onPhotoSelect={setActivePhotoIndex}
          showHero={false}
        />
      }
      sidebar={<ListingSidebar details={details} />}
    />
  );
}
