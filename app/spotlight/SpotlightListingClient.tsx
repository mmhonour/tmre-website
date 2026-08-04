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
import { spotlightPropertySearchParam } from "@/lib/spotlight-listing";
import { spotlightSectionHref } from "@/lib/spotlight-url";
import { isRentalListing } from "@/lib/listing-kind";

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
    marketBandLabel,
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
      marketBandLabel,
    },
  );
  const isClosed = details.isClosed;

  const propertyParam = spotlightPropertySearchParam(propertyTab);
  const photosHrefForIndex = (photoIndex: number) => {
    const base = spotlightSectionHref("photos");
    const qs = new URLSearchParams();
    if (propertyParam) qs.set("property", propertyParam);
    if (photoIndex >= 0) qs.set("photo", String(photoIndex));
    const q = qs.toString();
    return q ? `${base}?${q}` : base;
  };

  const heroSlot = presentation.showHero ? (
    <ListingPhotoScrollStack
      mlsId={display.mlsId}
      photoCount={display.photoCount}
      altBase={display.config.displayTitle}
      obfuscatePhotoIndex={presentation.shouldObfuscatePhoto}
      photoHref={photosHrefForIndex}
      mapSlot={presentation.mapLocation}
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
          photoHref={photosHrefForIndex}
          showHero
          mapSlot={presentation.mapLocation}
        />
      }
      remarks={display.remarks}
      sections={
        <ListingMobileScrollSections
          mlsId={display.mlsId}
          addressHint={presentation.ifAddressHint}
          townHint={presentation.townHint}
          routeBase="spotlight"
          propertyParam={propertyParam}
          mode="panel"
          isRental={isRentalListing({
            propertyType: display.propertyType,
            raw: mlsListing?.raw,
          })}
        />
      }
      sidebar={<ListingSidebar details={details} />}
    />
  );
}
