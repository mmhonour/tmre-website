"use client";

import ListingErrorPanel from "@/components/listing/ListingErrorPanel";
import { ListingIfPageContent } from "@/components/listing/ListingIfPanel";
import ListingSidebar from "@/components/listing/ListingSidebar";
import { SpotlightPageChrome } from "@/components/spotlight/SpotlightPageChrome";
import { useSpotlightListing } from "@/hooks/useSpotlightListing";
import { useSpotlightPrivacy } from "@/hooks/useSpotlightPrivacy";
import { ListingShell } from "@/components/listing/ListingShell";
import { formatMlsStatus, fmtMoney } from "@/lib/listing-history";
import { buildSpotlightDetailsPanelProps } from "@/lib/listing-detail-panel-props";

export default function SpotlightIfClient() {
  const { display, loadState, mlsListing, goldilocksScore, goldilocksBreakdown, insight, propertyTab } =
    useSpotlightListing();
  const privacy = useSpotlightPrivacy(propertyTab);

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
  const details = buildSpotlightDetailsPanelProps(display, mlsListing, fmtMoney);

  // Only expose the street address in the IF blurb when the "show address"
  // site control is enabled for this spotlight tab; otherwise the blurb shows
  // the math alone (no address, no MLS #).
  const ifAddressHint = privacy.showAddress
    ? mlsListing?.address?.street?.trim() ||
      display.config.address.street?.trim() ||
      null
    : null;

  return (
    <SpotlightPageChrome
      active="if"
      display={display}
      propertyTab={propertyTab}
      mlsListing={mlsListing}
      isClosed={isClosed}
      belowTabs={
        <ListingIfPageContent
          mlsId={display.mlsId}
          addressHint={ifAddressHint}
          townHint={display.config.address.city}
          routeBase="spotlight"
        />
      }
      sidebar={<ListingSidebar details={details} />}
      goldilocksScore={goldilocksScore}
      goldilocksBreakdown={goldilocksBreakdown}
      insight={insight}
    />
  );
}
