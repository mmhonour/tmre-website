"use client";

import ListingErrorPanel from "@/components/listing/ListingErrorPanel";
import { ListingComparablesPageContent } from "@/components/listing/ListingComparablesPanel";
import { ListingUagPageContent } from "@/components/listing/ListingUagPanel";
import ListingSidebar from "@/components/listing/ListingSidebar";
import { SpotlightPageChrome } from "@/components/spotlight/SpotlightPageChrome";
import { useSpotlightListing } from "@/hooks/useSpotlightListing";
import { ListingShell } from "@/components/listing/ListingShell";
import { formatMlsStatus, fmtMoney } from "@/lib/listing-history";
import { buildSpotlightDetailsPanelProps } from "@/lib/listing-detail-panel-props";
import { spotlightPropertySearchParam } from "@/lib/spotlight-listing";

export default function SpotlightComparablesClient({
  comparablesKind = "sale",
  mode = "comparables",
}: {
  comparablesKind?: "sale" | "rental";
  mode?: "comparables" | "uag";
}) {
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

  const isClosed = formatMlsStatus(display.status) === "Closed";
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

  const activeTab =
    mode === "uag"
      ? "uag"
      : comparablesKind === "rental"
        ? "comparable-rentals"
        : "comparables";

  const propertyParam = spotlightPropertySearchParam(propertyTab);

  const comparablesParams = new URLSearchParams();
  if (comparablesKind === "rental") comparablesParams.set("kind", "rental");
  if (propertyParam) comparablesParams.set("property", propertyParam);
  const comparablesQs = comparablesParams.toString();

  const uagParams = new URLSearchParams();
  if (propertyParam) uagParams.set("property", propertyParam);
  const uagQs = uagParams.toString();

  return (
    <SpotlightPageChrome
      active={activeTab}
      display={display}
      propertyTab={propertyTab}
      presentation={presentation}
      isClosed={isClosed}
      goldilocksScore={goldilocksScore}
      goldilocksBreakdown={goldilocksBreakdown}
      insight={insight}
      belowTabs={
        mode === "uag" ? (
          <ListingUagPageContent
            mlsId={display.mlsId}
            townHint={presentation.townHint}
            fetchUrl={
              uagQs ? `/api/spotlight/uag?${uagQs}` : "/api/spotlight/uag"
            }
          />
        ) : (
          <ListingComparablesPageContent
            mlsId={display.mlsId}
            townHint={presentation.townHint}
            kind={comparablesKind}
            fetchUrl={
              comparablesQs
                ? `/api/spotlight/comparables?${comparablesQs}`
                : "/api/spotlight/comparables"
            }
          />
        )
      }
      sidebar={<ListingSidebar details={details} />}
    />
  );
}
