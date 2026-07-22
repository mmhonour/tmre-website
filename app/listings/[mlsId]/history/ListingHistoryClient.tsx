"use client";

import { useRecordLookedAtListing } from "@/hooks/useRecordLookedAtListing";
import { useListingChrome } from "@/hooks/useListingChrome";
import { formatMlsStatus, fmtMoney } from "@/lib/listing-history";
import { buildListingDetailsPanelProps } from "@/lib/listing-detail-panel-props";
import ListingHeroPanels from "@/components/listing/ListingHeroPanels";
import ListingHeroPhoto from "@/components/listing/ListingHeroPhoto";
import ListingSidebar from "@/components/listing/ListingSidebar";
import { listingPhotoProxyUrl, listingPhotosHref } from "@/lib/listing-url";
import { intelligenceSearchHrefFromListing } from "@/lib/intelligence-search-url";
import { listingHeaderScoreProps } from "@/lib/listing-header-score-props";
import { ListingShell } from "@/components/listing/ListingShell";
import ListingHistoryPanel from "@/components/ListingHistoryPanel";

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

export default function ListingHistoryClient({
  mlsId,
  addressHint,
  townHint,
}: {
  mlsId: string;
  addressHint?: string | null;
  townHint?: string | null;
}) {
  const {
    listing,
    goldilocksScore,
    goldilocksBreakdown,
    insight,
    cityMedianPpsf,
    pricePerSqft,
    medianPpsfBand,
    state,
  } =
    useListingChrome<Listing>(mlsId);

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
            Loading history…
          </span>
        </div>
      </ListingShell>
    );
  }

  if (state === "not-found" || !listing) {
    return (
      <ListingShell>
        <div className="max-w-lg mx-auto text-center py-24">
          <h1 className="font-serif text-3xl text-white">Listing not found</h1>
          <p className="text-white/70 mt-4">
            {addressHint?.trim() || "This listing"} isn&apos;t available right now.
          </p>
        </div>
      </ListingShell>
    );
  }

  const street = listing.address.street || listing.address.full;
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
  const resolvedTown = townHint || listing.address.city;
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
            goldilocksScore,
            goldilocksBreakdown,
            insight,
            title: street,
            subtitle: townHint || listing.address.city,
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
          active: "history",
          addressHint: street || addressHint,
          townHint,
        }}
        interest={
          !isClosed
            ? {
                mlsId: listing.mlsId,
                address: street,
                city: townHint || listing.address.city,
              }
            : null
        }
        belowTabs={
          <ListingHistoryPanel
            mlsId={listing.mlsId}
            townHint={townHint}
            variant="page"
          />
        }
        sidebar={<ListingSidebar details={details} />}
      />
    </ListingShell>
  );
}
