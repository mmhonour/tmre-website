"use client";

import { useRecordLookedAtListing } from "@/hooks/useRecordLookedAtListing";
import { useListingChrome } from "@/hooks/useListingChrome";
import { formatMlsStatus, fmtMoney } from "@/lib/listing-history";
import { buildListingDetailsPanelProps } from "@/lib/listing-detail-panel-props";
import ListingHeroPanels from "@/components/listing/ListingHeroPanels";
import ListingHeroPhoto from "@/components/listing/ListingHeroPhoto";
import ListingSidebar from "@/components/listing/ListingSidebar";
import ListingErrorPanel from "@/components/listing/ListingErrorPanel";
import { listingPhotoProxyUrl, listingPhotosHref } from "@/lib/listing-url";
import { ListingComparablesPageContent } from "@/components/listing/ListingComparablesPanel";
import { ListingUagPageContent } from "@/components/listing/ListingUagPanel";
import { intelligenceSearchHrefFromListing } from "@/lib/intelligence-search-url";
import { listingHeaderScoreProps } from "@/lib/listing-header-score-props";
import { ListingShell } from "@/components/listing/ListingShell";

type Schools = {
  elementary: string | null;
  middle: string | null;
  high: string | null;
  district: string | null;
};

type Listing = {
  mlsId: string;
  listingKey: string;
  status: string;
  propertyType: string;
  style: string;
  address: {
    street: string;
    unit: string;
    city: string;
    state: string;
    postalCode: string;
    full: string;
  };
  price: number | null;
  originalListPrice: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  yearBuilt: number | null;
  dom: number | null;
  photoCount: number | null;
  latitude: number | null;
  longitude: number | null;
  schools: Schools;
  raw: Record<string, string>;
};

export default function ListingComparablesClient({
  mlsId,
  addressHint,
  townHint,
  comparablesKind = "sale",
  mode = "comparables",
}: {
  mlsId: string;
  addressHint?: string | null;
  townHint?: string | null;
  comparablesKind?: "sale" | "rental";
  mode?: "comparables" | "uag";
}) {
  const {
    listing,
    goldilocksScore,
    edgeScore,
    goldilocksBreakdown,
    insight,
    cityMedianPpsf,
    pricePerSqft,
    medianPpsfBand,
    state,
  } = useListingChrome<Listing>(mlsId);
  const activeTab =
    mode === "uag"
      ? "uag"
      : comparablesKind === "rental"
        ? "comparable-rentals"
        : "comparables";

  useRecordLookedAtListing(state === "ready", listing, {
    addressHint,
    townHint,
  });

  if (state === "loading") {
    return (
      <ListingShell>
        <div className="text-center text-white/60 font-mono text-xs tracking-wide py-32">
          <span className="inline-flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-gold animate-pulse-dot" />
            Loading comparables…
          </span>
        </div>
      </ListingShell>
    );
  }

  if (state === "not-found") {
    return (
      <ListingShell>
        <ListingErrorPanel
          title="Listing not found"
          body={`${addressHint?.trim() || "This listing"} isn't available right now.`}
        />
      </ListingShell>
    );
  }

  if (state === "error" || !listing) {
    return (
      <ListingShell>
        <ListingErrorPanel
          title="Couldn't load this listing"
          body="Try again in a moment."
        />
      </ListingShell>
    );
  }

  const street = listing.address.street || listing.address.full;
  const resolvedTown = townHint || listing.address.city;
  const mapsQuery =
    listing.address.full?.trim() ||
    [
      street,
      listing.address.city,
      listing.address.state,
      listing.address.postalCode,
    ]
      .filter(Boolean)
      .join(", ");
  const isClosed = formatMlsStatus(listing.status) === "Closed";
  const photoCount = listing.photoCount ?? 0;
  const galleryHref = listingPhotosHref(
    mlsId,
    street || addressHint,
    resolvedTown,
  );
  const heroSlot =
    photoCount > 0 ? (
      <ListingHeroPhoto
        url={listingPhotoProxyUrl(listing.mlsId, 0)}
        alt={street || "Listing photo"}
        href={galleryHref}
        photoCount={photoCount}
        photoIndex={0}
        bare
      />
    ) : null;
  const details = buildListingDetailsPanelProps(
    { ...listing, townHint: townHint ?? null },
    fmtMoney,
    {
      listingId: mlsId,
      addressHint: street || addressHint,
      townHint: resolvedTown,
      cityMedianPpsf,
      listingPricePerSqft: pricePerSqft,
      medianPpsfBand,
    },
  );

  return (
    <ListingShell>
      <ListingHeroPanels
        header={{
          mlsId: listing.mlsId,
          status: listing.status,
          address: listing.address,
          propertyType: listing.propertyType,
          style: listing.style,
          beds: listing.beds,
          baths: listing.baths,
          sqft: listing.sqft,
          yearBuilt: listing.yearBuilt,
          bedBathSearchHref: intelligenceSearchHrefFromListing(listing),
          heroSlot,
          ...listingHeaderScoreProps({
            goldilocksScore: edgeScore ?? goldilocksScore,
            goldilocksBreakdown,
            insight,
            title: street,
            subtitle: resolvedTown,
            propertyType: listing.propertyType,
          }),
        }}
        location={{
          latitude: listing.latitude,
          longitude: listing.longitude,
          addressQuery: mapsQuery,
        }}
        subnav={{
          mlsId,
          active: activeTab,
          addressHint: street || addressHint,
          townHint: resolvedTown,
        }}
        interest={
          !isClosed
            ? {
                mlsId: listing.mlsId,
                address: street,
                city: resolvedTown,
              }
            : null
        }
        sidebar={<ListingSidebar details={details} />}
        belowTabs={
          mode === "uag" ? (
            <ListingUagPageContent
              mlsId={listing.mlsId}
              townHint={resolvedTown}
            />
          ) : (
            <ListingComparablesPageContent
              mlsId={listing.mlsId}
              townHint={resolvedTown}
              kind={comparablesKind}
            />
          )
        }
      />
    </ListingShell>
  );
}
