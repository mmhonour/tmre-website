"use client";

import ListingErrorPanel from "@/components/listing/ListingErrorPanel";
import { ListingComparablesPageContent } from "@/components/listing/ListingComparablesPanel";
import ListingSidebar from "@/components/listing/ListingSidebar";
import { SpotlightPageChrome } from "@/components/spotlight/SpotlightPageChrome";
import { useSpotlightListing } from "@/hooks/useSpotlightListing";
import { ListingShell } from "@/components/listing/ListingShell";
import { formatMlsStatus, fmtMoney } from "@/lib/listing-history";
import { buildSpotlightDetailsPanelProps } from "@/lib/listing-detail-panel-props";
import { spotlightPropertySearchParam } from "@/lib/spotlight-listing";

export default function SpotlightComparablesClient({
  comparablesKind = "sale",
}: {
  comparablesKind?: "sale" | "rental";
}) {
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

  const activeTab =
    comparablesKind === "rental" ? "comparable-rentals" : "comparables";

  const comparablesParams = new URLSearchParams();
  if (comparablesKind === "rental") comparablesParams.set("kind", "rental");
  const propertyParam = spotlightPropertySearchParam(propertyTab);
  if (propertyParam) comparablesParams.set("property", propertyParam);
  const comparablesQs = comparablesParams.toString();

  return (
    <SpotlightPageChrome
      active={activeTab}
      display={display}
      propertyTab={propertyTab}
      mlsListing={mlsListing}
      isClosed={isClosed}
      goldilocksScore={goldilocksScore}
      goldilocksBreakdown={goldilocksBreakdown}
      insight={insight}
      belowTabs={
        <ListingComparablesPageContent
          mlsId={display.mlsId}
          townHint={display.config.address.city}
          kind={comparablesKind}
          fetchUrl={
            comparablesQs
              ? `/api/spotlight/comparables?${comparablesQs}`
              : "/api/spotlight/comparables"
          }
        />
      }
      sidebar={<ListingSidebar details={details} />}
    />
  );
}
