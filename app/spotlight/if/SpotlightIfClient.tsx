"use client";

import ListingErrorPanel from "@/components/listing/ListingErrorPanel";
import { ListingIfPageContent } from "@/components/listing/ListingIfPanel";
import ListingSidebar from "@/components/listing/ListingSidebar";
import { SpotlightPageChrome } from "@/components/spotlight/SpotlightPageChrome";
import { useSpotlightListing } from "@/hooks/useSpotlightListing";
import { ListingShell } from "@/components/listing/ListingShell";
import { formatMlsStatus, fmtMoney } from "@/lib/listing-history";
import { buildSpotlightDetailsPanelProps } from "@/lib/listing-detail-panel-props";

export default function SpotlightIfClient() {
  const { display, loadState, mlsListing, goldilocksScore, goldilocksBreakdown, insight, propertyTab } =
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
  const details = buildSpotlightDetailsPanelProps(display, mlsListing, fmtMoney);

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
