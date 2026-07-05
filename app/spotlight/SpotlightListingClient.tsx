"use client";

import { fmtMoney, formatMlsStatus } from "@/lib/listing-history";
import { buildListingDetailsPanelProps } from "@/lib/listing-detail-panel-props";
import ListingErrorPanel from "@/components/listing/ListingErrorPanel";
import ListingHeroPhoto from "@/components/listing/ListingHeroPhoto";
import { ListingRemarksWithThumbnails } from "@/components/listing/ListingOverviewPanels";
import ListingSidebar from "@/components/listing/ListingSidebar";
import { SpotlightPageChrome } from "@/components/spotlight/SpotlightPageChrome";
import { useSpotlightListing } from "@/hooks/useSpotlightListing";
import { ListingShell } from "@/components/listing/ListingShell";
import { listingPhotoProxyUrl } from "@/lib/listing-url";
import { spotlightObfuscatesPhoto } from "@/lib/spotlight-display";
import { spotlightSectionHref } from "@/lib/spotlight-url";

export default function SpotlightListingClient() {
  const { display, loadState, mlsListing, goldilocksScore, goldilocksBreakdown } =
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

  const details = buildListingDetailsPanelProps(
    {
      mlsId: display.mlsId,
      propertyTitle: display.config.displayTitle,
      townHint: display.headerAddress.city,
      status: display.status,
      propertyType: display.propertyType,
      price: display.price,
      originalListPrice: display.originalListPrice,
      sqft: display.sqft,
      photoCount: display.photoCount,
      schools: display.schools,
      raw: mlsListing?.raw,
    },
    fmtMoney,
    { routeBase: "spotlight" },
  );
  const isClosed = details.isClosed;
  const isComingSoon = formatMlsStatus(display.status) === "Coming Soon";
  const obfuscatePhoto = (index: number) =>
    spotlightObfuscatesPhoto(display.config, index);
  const heroPhoto =
    display.photoCount > 0
      ? {
          url: listingPhotoProxyUrl(display.mlsId, 0),
          alt: display.config.displayTitle,
          href: spotlightSectionHref("photos"),
          photoCount: display.photoCount,
          obfuscate: obfuscatePhoto(0),
        }
      : null;

  return (
    <SpotlightPageChrome
      active="overview"
      display={display}
      isClosed={isClosed}
      goldilocksScore={goldilocksScore}
      goldilocksBreakdown={goldilocksBreakdown}
      belowTabs={
        <>
          <ListingRemarksWithThumbnails
            remarks={display.remarks}
            mlsId={display.mlsId}
            photoCount={display.photoCount > 0 ? display.photoCount : null}
            address={display.config.displayTitle}
            city={display.config.address.city}
            photoHref={(photoIndex) =>
              `${spotlightSectionHref("photos")}?photo=${photoIndex}`
            }
            obfuscatePhotoIndex={obfuscatePhoto}
          />
          {heroPhoto && !isComingSoon ? (
            <div className="mt-4 pt-4 border-t border-white/10">
              <ListingHeroPhoto {...heroPhoto} bare />
            </div>
          ) : null}
        </>
      }
      sidebar={<ListingSidebar details={details} />}
    />
  );
}
