"use client";

import { useEffect, useState } from "react";
import { fmtMoney } from "@/lib/listing-history";
import { buildSpotlightDetailsPanelProps } from "@/lib/listing-detail-panel-props";
import ListingErrorPanel from "@/components/listing/ListingErrorPanel";
import ListingHeroPhoto from "@/components/listing/ListingHeroPhoto";
import { ListingMobileScrollSections } from "@/components/listing/ListingMobileScrollSections";
import { ListingOverviewPhotoDeck } from "@/components/listing/ListingOverviewPhotoDeck";
import ListingSidebar from "@/components/listing/ListingSidebar";
import { listingPhotoProxyUrl } from "@/lib/listing-url";
import { SpotlightPageChrome } from "@/components/spotlight/SpotlightPageChrome";
import { useSpotlightListing } from "@/hooks/useSpotlightListing";
import { ListingShell } from "@/components/listing/ListingShell";
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
  const {
    display,
    loadState,
    mlsListing,
    goldilocksScore,
    goldilocksBreakdown,
    insight,
    propertyTab,
    presentation,
  } = useSpotlightListing();
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

  const details = buildSpotlightDetailsPanelProps(
    display,
    mlsListing,
    fmtMoney,
    presentation,
  );
  const isClosed = details.isClosed;

  const heroSlot = presentation.showHero ? (
    <ListingHeroPhoto
      url={listingPhotoProxyUrl(display.mlsId, activePhotoIndex)}
      alt={display.config.displayTitle}
      href={spotlightPhotosHref(propertyTab)}
      photoCount={display.photoCount}
      photoIndex={activePhotoIndex}
      obfuscate={presentation.shouldObfuscatePhoto(activePhotoIndex)}
      bare
    />
  ) : null;

  return (
    <SpotlightPageChrome
      active="overview"
      display={display}
      propertyTab={propertyTab}
      presentation={presentation}
      isClosed={isClosed}
      goldilocksScore={goldilocksScore}
      goldilocksBreakdown={goldilocksBreakdown}
      insight={insight}
      heroSlot={heroSlot}
      belowTabs={
        <>
          <ListingOverviewPhotoDeck
            remarks={display.remarks}
            mlsId={display.mlsId}
            photoCount={display.photoCount > 0 ? display.photoCount : null}
            address={presentation.headerAddress.street}
            city={presentation.photoDeckCity}
            heroAlt={display.config.displayTitle}
            galleryHref={spotlightPhotosHref(propertyTab)}
            photoHref={(i) => spotlightPhotosHref(propertyTab, i)}
            hideHero={presentation.hidePhotoDeckHero}
            obfuscatePhotoIndex={presentation.shouldObfuscatePhoto}
            activePhotoIndex={activePhotoIndex}
            onPhotoSelect={setActivePhotoIndex}
            showHero={false}
          />
          <ListingMobileScrollSections
            mlsId={display.mlsId}
            addressHint={presentation.ifAddressHint}
            townHint={presentation.townHint}
            routeBase="spotlight"
            propertyParam={spotlightPropertySearchParam(propertyTab)}
          />
        </>
      }
      sidebar={<ListingSidebar details={details} />}
    />
  );
}
