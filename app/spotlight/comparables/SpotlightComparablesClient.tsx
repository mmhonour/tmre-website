"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ListingErrorPanel from "@/components/listing/ListingErrorPanel";
import {
  ListingComparablesPageContent,
  ListingOnTheMarketPageContent,
} from "@/components/listing/ListingComparablesPanel";
import { ListingUagPageContent } from "@/components/listing/ListingUagPanel";
import ListingSidebar from "@/components/listing/ListingSidebar";
import { SpotlightPageChrome } from "@/components/spotlight/SpotlightPageChrome";
import { useSpotlightListing } from "@/hooks/useSpotlightListing";
import { ListingShell } from "@/components/listing/ListingShell";
import { formatMlsStatus, fmtMoney } from "@/lib/listing-history";
import { buildSpotlightDetailsPanelProps } from "@/lib/listing-detail-panel-props";
import { spotlightPropertySearchParam } from "@/lib/spotlight-listing";
import { spotlightSectionHref } from "@/lib/spotlight-url";
import { LISTING_SECTION_IDS } from "@/components/listing/listing-section-ids";

export default function SpotlightComparablesClient({
  comparablesKind = "sale",
  mode = "comparables",
}: {
  comparablesKind?: "sale" | "rental";
  mode?: "comparables" | "uag" | "on-the-market";
}) {
  const router = useRouter();
  const [isNarrow, setIsNarrow] = useState(false);
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

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    const update = () => setIsNarrow(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (mode !== "on-the-market" || !isNarrow) return;
    const overview = spotlightSectionHref("overview");
    const params = new URLSearchParams(window.location.search);
    const qs = params.toString();
    const hash = `#${LISTING_SECTION_IDS["on-the-market"]}`;
    router.replace(`${overview}${qs ? `?${qs}` : ""}${hash}`);
  }, [mode, isNarrow, router]);

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
  );

  const activeTab =
    mode === "uag"
      ? "uag"
      : mode === "on-the-market"
        ? "on-the-market"
        : comparablesKind === "rental"
          ? "comparable-rentals"
          : "comparables";

  const propertyParam = spotlightPropertySearchParam(propertyTab);

  const comparablesParams = new URLSearchParams();
  if (comparablesKind === "rental") comparablesParams.set("kind", "rental");
  if (propertyParam) comparablesParams.set("property", propertyParam);
  const comparablesQs = comparablesParams.toString();

  const saleParams = new URLSearchParams();
  if (propertyParam) saleParams.set("property", propertyParam);
  const saleQs = saleParams.toString();

  const rentalParams = new URLSearchParams({ kind: "rental" });
  if (propertyParam) rentalParams.set("property", propertyParam);
  const rentalQs = rentalParams.toString();

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
        ) : mode === "on-the-market" ? (
          isNarrow ? (
            <p className="font-mono text-xs text-white/45 py-8">
              Opening On The Market panels…
            </p>
          ) : (
            <ListingOnTheMarketPageContent
              mlsId={display.mlsId}
              townHint={presentation.townHint}
              saleFetchUrl={
                saleQs
                  ? `/api/spotlight/comparables?${saleQs}`
                  : "/api/spotlight/comparables"
              }
              rentalFetchUrl={`/api/spotlight/comparables?${rentalQs}`}
            />
          )
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
