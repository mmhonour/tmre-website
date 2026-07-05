"use client";

import { useEffect } from "react";
import { recordLookedAtListing } from "@/lib/looked-at-listings";

type LookedAtListingSource = {
  mlsId: string;
  listingKey?: string | null;
  address: {
    street?: string | null;
    full?: string | null;
    city?: string | null;
    postalCode?: string | null;
  };
  price?: number | null;
  propertyType?: string | null;
};

/** Record a listing view once listing data has loaded. */
export function useRecordLookedAtListing(
  ready: boolean,
  listing: LookedAtListingSource | null | undefined,
  hints?: { addressHint?: string | null; townHint?: string | null },
): void {
  useEffect(() => {
    if (!ready || !listing) return;
    const id = listing.listingKey?.trim() || listing.mlsId;
    const address =
      listing.address.street?.trim() ||
      listing.address.full?.trim() ||
      hints?.addressHint?.trim() ||
      id;
    recordLookedAtListing({
      id,
      address,
      city: hints?.townHint || listing.address.city || null,
      zip: listing.address.postalCode || null,
      price: listing.price ?? null,
      propertyType: listing.propertyType || null,
    });
  }, [ready, listing, hints?.addressHint, hints?.townHint]);
}
