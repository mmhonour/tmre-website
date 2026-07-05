"use client";

import ListingErrorPanel from "@/components/listing/ListingErrorPanel";
import ListingHistoryPanel from "@/components/ListingHistoryPanel";
import ListingSidebar from "@/components/listing/ListingSidebar";
import { SpotlightPageChrome } from "@/components/spotlight/SpotlightPageChrome";
import { useSpotlightListing } from "@/hooks/useSpotlightListing";
import { ListingShell } from "@/components/listing/ListingShell";
import { formatMlsStatus, fmtMoney } from "@/lib/listing-history";
import { buildListingDetailsPanelProps } from "@/lib/listing-detail-panel-props";

export default function SpotlightHistoryClient() {
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

  const isClosed = formatMlsStatus(display.status) === "Closed";
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

  return (
    <SpotlightPageChrome
      active="history"
      display={display}
      isClosed={isClosed}
      goldilocksScore={goldilocksScore}
      goldilocksBreakdown={goldilocksBreakdown}
      belowTabs={
        <ListingHistoryPanel
          mlsId={display.mlsId}
          townHint={display.config.address.city}
          variant="page"
        />
      }
      sidebar={<ListingSidebar details={details} />}
    />
  );
}
