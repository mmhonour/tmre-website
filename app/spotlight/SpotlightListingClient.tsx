"use client";

import { fmtMoney } from "@/lib/listing-history";
import { buildSpotlightDetailsPanelProps } from "@/lib/listing-detail-panel-props";
import ListingErrorPanel from "@/components/listing/ListingErrorPanel";
import { ListingMobileScrollSections } from "@/components/listing/ListingMobileScrollSections";
import { ListingOverviewPhotoDeck } from "@/components/listing/ListingOverviewPhotoDeck";
import ListingPhotoScrollStack from "@/components/listing/ListingPhotoScrollStack";
import ListingSidebar from "@/components/listing/ListingSidebar";
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
    cityMedianPpsf,
    pricePerSqft,
    medianPpsfBand,
    propertyTab,
    presentation,
  } = useSpotlightListing();

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
    {
      cityMedianPpsf,
      listingPricePerSqft: pricePerSqft,
      medianPpsfBand,
    },
  );
  const isClosed = details.isClosed;

  const heroSlot = presentation.showHero ? (
    <ListingPhotoScrollStack
      mlsId={display.mlsId}
      photoCount={display.photoCount}
      altBase={display.config.displayTitle}
      photoHref={(i) => spotlightPhotosHref(propertyTab, i)}
      obfuscatePhotoIndex={presentation.shouldObfuscatePhoto}
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
        <ListingOverviewPhotoDeck
          remarks={display.remarks}
          mlsId={display.mlsId}
          photoCount={display.photoCount > 0 ? display.photoCount : null}
          heroAlt={display.config.displayTitle}
          hideHero={presentation.hidePhotoDeckHero}
          obfuscatePhotoIndex={presentation.shouldObfuscatePhoto}
          showHero
        />
      }
      remarks={display.remarks}
      sections={
        <ListingMobileScrollSections
          mlsId={display.mlsId}
          addressHint={presentation.ifAddressHint}
          townHint={presentation.townHint}
          routeBase="spotlight"
          propertyParam={spotlightPropertySearchParam(propertyTab)}
          mode="panel"
        />
      }
      sidebar={<ListingSidebar details={details} />}
    />
  );
}
