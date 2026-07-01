"use client";

import { Suspense } from "react";
import { useEffect, useState } from "react";
import { recordLookedAtListing } from "@/lib/looked-at-listings";
import { formatMlsStatus } from "@/lib/listing-history";
import ListingHeader from "@/components/listing/ListingHeader";
import { ListingShell } from "@/components/listing/ListingShell";
import ListingSubnav from "@/components/listing/ListingSubnav";
import ListingHistoryPanel from "@/components/ListingHistoryPanel";

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
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  yearBuilt: number | null;
  dom: number | null;
};

type LoadState = "loading" | "ready" | "error" | "not-found";

export default function ListingHistoryClient({
  mlsId,
  addressHint,
  townHint,
}: {
  mlsId: string;
  addressHint?: string | null;
  townHint?: string | null;
}) {
  const [listing, setListing] = useState<Listing | null>(null);
  const [state, setState] = useState<LoadState>("loading");

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    fetch(`/api/listings/${encodeURIComponent(mlsId)}`, { cache: "no-store" })
      .then(async (r) => {
        if (r.status === 404) {
          if (!cancelled) setState("not-found");
          return null;
        }
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as { listing: Listing };
      })
      .then((d) => {
        if (!d || cancelled) return;
        setListing(d.listing);
        setState("ready");
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [mlsId]);

  useEffect(() => {
    if (state !== "ready" || !listing) return;
    const id = listing.listingKey?.trim() || listing.mlsId;
    const address =
      listing.address.street?.trim() ||
      listing.address.full?.trim() ||
      addressHint?.trim() ||
      id;
    recordLookedAtListing({
      id,
      address,
      city: townHint || listing.address.city || null,
      zip: listing.address.postalCode || null,
      price: listing.price,
      propertyType: listing.propertyType || null,
    });
  }, [state, listing, addressHint, townHint]);

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
  const isClosed = formatMlsStatus(listing.status) === "Closed";

  return (
    <ListingShell>
      <ListingHeader
        mlsId={listing.mlsId}
        status={listing.status}
        dom={listing.dom}
        address={listing.address}
        propertyType={listing.propertyType}
        style={listing.style}
        beds={listing.beds}
        baths={listing.baths}
        sqft={listing.sqft}
        yearBuilt={listing.yearBuilt}
      />
      <Suspense fallback={null}>
        <ListingSubnav
          mlsId={mlsId}
          active="history"
          addressHint={street || addressHint}
          townHint={townHint}
          interest={
            !isClosed
              ? {
                  mlsId: listing.mlsId,
                  address: street,
                  city: townHint || listing.address.city,
                }
              : null
          }
        />
      </Suspense>
      <ListingHistoryPanel mlsId={listing.mlsId} townHint={townHint} variant="page" />
    </ListingShell>
  );
}
