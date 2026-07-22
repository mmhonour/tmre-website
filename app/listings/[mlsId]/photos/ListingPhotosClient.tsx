"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useRecordLookedAtListing } from "@/hooks/useRecordLookedAtListing";
import ListingHeroPanels from "@/components/listing/ListingHeroPanels";
import ListingSidebar from "@/components/listing/ListingSidebar";
import { intelligenceSearchHrefFromListing } from "@/lib/intelligence-search-url";
import { ListingShell } from "@/components/listing/ListingShell";
import PhotoGallery from "@/components/listing/PhotoGallery";
import ListingErrorPanel from "@/components/listing/ListingErrorPanel";
import { formatMlsStatus, fmtMoney } from "@/lib/listing-history";
import { buildListingDetailsPanelProps } from "@/lib/listing-detail-panel-props";
import {
  listingHeaderScoreProps,
  type ListingScoreApiFields,
} from "@/lib/listing-header-score-props";
import { listingPhotoProxyUrlAsFull, listingPhotoProxyUrlsFromCount } from "@/lib/listing-url";

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
    full: string;
    city: string;
    state: string;
    postalCode: string;
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

type ApiResponse = ListingScoreApiFields & {
  listing: Listing;
  photos: string[];
};

type LoadState = "loading" | "ready" | "error" | "not-found";

function initialPhotoIndex(param: string | null, photoCount: number): number {
  if (!param) return 0;
  const idx = Number.parseInt(param, 10);
  if (!Number.isFinite(idx) || idx < 0) return 0;
  return photoCount > 0 ? Math.min(idx, photoCount - 1) : 0;
}

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
  const searchParams = useSearchParams();
  const photoParam = searchParams.get("photo");

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    fetch(`/api/listings/${encodeURIComponent(mlsId)}`)
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
        const count =
          d.photos.length > 0
            ? d.photos.length
            : Math.min(d.listing.photoCount ?? 0, 60);
        setActivePhoto(initialPhotoIndex(photoParam, count));
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
  }, [mlsId, photoParam]);

  const galleryPhotos = useMemo(() => {
    if (!data) return [] as string[];
    const raw =
      data.photos.length > 0
        ? data.photos
        : listingPhotoProxyUrlsFromCount(
            mlsId,
            data.listing.photoCount ?? 0,
            60,
            { size: "full" },
          );
    return raw.map(listingPhotoProxyUrlAsFull);
  }, [data, mlsId]);

  useEffect(() => {
    if (state !== "ready" || !data) return;
    setActivePhoto(initialPhotoIndex(photoParam, galleryPhotos.length));
  }, [state, data, photoParam, galleryPhotos.length]);

  // Photos tab: widen on-demand warm so cold Active / associated Closed galleries
  // pull into R2 instead of staying on "No photos available".
  useEffect(() => {
    if (state !== "ready") return;
    void fetch(`/api/listings/${encodeURIComponent(mlsId)}/warm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ gallery: true }),
    }).catch(() => undefined);
  }, [mlsId, state]);

  useRecordLookedAtListing(state === "ready", data?.listing ?? null, {
    addressHint,
    townHint,
  });

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
        <ListingErrorPanel
          title="Listing not found"
          body={`${addressHint?.trim() || "This listing"} isn't in the active feed right now.`}
        />
      </ListingShell>
    );
  }

  if (state === "error" || !data) {
    return (
      <ListingShell>
        <ListingErrorPanel
          title="Couldn't load photos"
          body={errorMsg ?? "Try again in a moment."}
        />
      </ListingShell>
    );
  }

  const { listing } = data;
  const photos = galleryPhotos;
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
  const isClosed = formatMlsStatus(listing.status) === "Closed";
  const details = buildListingDetailsPanelProps(
    { ...listing, townHint: townHint ?? null },
    fmtMoney,
    {
      listingId: mlsId,
      addressHint: street || addressHint,
      townHint: townHint || listing.address.city,
      cityMedianPpsf: data.cityMedianPpsf,
      listingPricePerSqft: data.pricePerSqft,
      medianPpsfBand: data.medianPpsfBand,
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
          ...listingHeaderScoreProps({
            goldilocksScore: data.goldilocksScore,
            goldilocksBreakdown: data.goldilocksBreakdown,
            insight: data.insight,
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
          active: "photos",
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
          <PhotoGallery
            photos={photos}
            active={activePhoto}
            setActive={setActivePhoto}
            address={street}
          />
        }
        sidebar={<ListingSidebar details={details} />}
      />
    </ListingShell>
  );
}
