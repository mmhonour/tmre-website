"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import ListingHeader from "@/components/listing/ListingHeader";
import { ListingShell } from "@/components/listing/ListingShell";
import ListingSubnav from "@/components/listing/ListingSubnav";
import PhotoGallery from "@/components/listing/PhotoGallery";
import { formatMlsStatus } from "@/lib/listing-history";
import { listingDetailHref } from "@/lib/listing-url";

type Listing = {
  mlsId: string;
  listingKey: string;
  status: string;
  propertyType: string;
  style: string;
  address: {
    street: string;
    full: string;
    city: string;
    state: string;
    postalCode: string;
  };
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  yearBuilt: number | null;
  dom: number | null;
  photoCount: number | null;
};

type ApiResponse = {
  listing: Listing;
  photos: string[];
};

type LoadState = "loading" | "ready" | "error" | "not-found";

export default function ListingPhotosClient({
  mlsId,
  addressHint,
  townHint,
}: {
  mlsId: string;
  addressHint?: string | null;
  townHint?: string | null;
}) {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activePhoto, setActivePhoto] = useState(0);

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
        return (await r.json()) as ApiResponse;
      })
      .then((d) => {
        if (!d || cancelled) return;
        setData(d);
        setActivePhoto(0);
        setState("ready");
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("[listing photos] fetch failed", err);
        setErrorMsg(err instanceof Error ? err.message : "Fetch failed");
        setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [mlsId]);

  if (state === "loading") {
    return (
      <ListingShell>
        <div className="text-center text-white/60 font-mono text-xs tracking-wide py-32">
          <span className="inline-flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-gold animate-pulse-dot" />
            Loading photos…
          </span>
        </div>
      </ListingShell>
    );
  }

  if (state === "not-found") {
    return (
      <ListingShell>
        <ErrorPanel
          title="Listing not found"
          body={`${addressHint?.trim() || "This listing"} isn't in the active feed right now.`}
        />
      </ListingShell>
    );
  }

  if (state === "error" || !data) {
    return (
      <ListingShell>
        <ErrorPanel
          title="Couldn't load photos"
          body={errorMsg ?? "Try again in a moment."}
        />
      </ListingShell>
    );
  }

  const { listing, photos } = data;
  const street = listing.address.street || listing.address.full;
  const isClosed = formatMlsStatus(listing.status) === "Closed";
  const detailHref = listingDetailHref(
    mlsId,
    street || addressHint,
    townHint || listing.address.city,
  );

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
          active="photos"
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
      <div className="mb-6">
        <Link
          href={detailHref}
          className="inline-flex items-center gap-2 font-mono text-[10px] tracking-[0.15em] uppercase text-gold hover:text-gold-light transition-colors"
        >
          ← Property details
        </Link>
      </div>
      <PhotoGallery
        photos={photos}
        active={activePhoto}
        setActive={setActivePhoto}
        address={street}
      />
    </ListingShell>
  );
}

function ErrorPanel({ title, body }: { title: string; body: string }) {
  return (
    <div className="text-center py-24 max-w-md mx-auto">
      <h1 className="font-serif text-2xl text-white mb-3">{title}</h1>
      <p className="text-white/60 text-sm leading-relaxed">{body}</p>
    </div>
  );
}
