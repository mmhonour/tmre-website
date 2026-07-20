"use client";

import PhotoGallery from "@/components/listing/PhotoGallery";
import ListingErrorPanel from "@/components/listing/ListingErrorPanel";
import ListingSidebar from "@/components/listing/ListingSidebar";
import { SpotlightPageChrome } from "@/components/spotlight/SpotlightPageChrome";
import { useSpotlightListing } from "@/hooks/useSpotlightListing";
import { ListingShell } from "@/components/listing/ListingShell";
import { formatMlsStatus, fmtMoney } from "@/lib/listing-history";
import { buildSpotlightDetailsPanelProps } from "@/lib/listing-detail-panel-props";
import { listingPhotoProxyUrlsFromCount } from "@/lib/listing-url";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

function initialPhotoIndex(param: string | null, photoCount: number): number {
  if (photoCount <= 0) return 0;
  const n = Number.parseInt(param ?? "", 10);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, photoCount - 1);
}

export default function SpotlightPhotosClient() {
  const {
    display,
    loadState,
    mlsListing,
    goldilocksScore,
    goldilocksBreakdown,
    insight,
    photos,
    photosState,
    propertyTab,
    presentation,
  } = useSpotlightListing({
    photos: true,
  });
  const [activePhoto, setActivePhoto] = useState(0);
  const searchParams = useSearchParams();
  const photoParam = searchParams.get("photo");

  const galleryPhotos = useMemo(() => {
    if (photos.length > 0) return photos;
    return listingPhotoProxyUrlsFromCount(
      display.mlsId,
      display.photoCount ?? 0,
    );
  }, [photos, display.mlsId, display.photoCount]);

  useEffect(() => {
    if (galleryPhotos.length > 0) {
      setActivePhoto(initialPhotoIndex(photoParam, galleryPhotos.length));
    }
  }, [photoParam, galleryPhotos.length]);

  useEffect(() => {
    if (loadState === "error" || !display.mlsId) return;
    void fetch(`/api/listings/${encodeURIComponent(display.mlsId)}/warm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ gallery: true }),
    }).catch(() => undefined);
  }, [display.mlsId, loadState]);

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

  const belowTabs =
    photosState === "loading" ? (
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] aspect-[16/10] flex items-center justify-center">
        <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-white/45">
          Loading photography…
        </span>
      </div>
    ) : photosState === "error" ? (
      <ListingErrorPanel
        title="Couldn't load photos"
        body="Try again in a moment."
      />
    ) : galleryPhotos.length > 0 ? (
      <PhotoGallery
        photos={galleryPhotos}
        active={activePhoto}
        setActive={setActivePhoto}
        address={presentation.headerAddress.street}
        obfuscatePhotoIndex={presentation.shouldObfuscatePhoto}
      />
    ) : (
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] aspect-[16/10] flex flex-col items-center justify-center gap-3 px-6 text-center">
        <span className="font-mono text-[10px] tracking-[0.25em] uppercase text-gold">
          Spotlight
        </span>
        <p className="font-serif italic text-2xl sm:text-3xl text-white">
          {presentation.isComingSoon
            ? "Coming Soon..."
            : presentation.headerAddress.street || "Spotlight"}
        </p>
        <p className="font-mono text-[10px] tracking-[0.15em] uppercase text-white/45">
          {presentation.isComingSoon
            ? "Photography releasing shortly"
            : "Photos unavailable right now"}
        </p>
      </div>
    );

  return (
    <SpotlightPageChrome
      active="photos"
      display={display}
      propertyTab={propertyTab}
      presentation={presentation}
      isClosed={isClosed}
      goldilocksScore={goldilocksScore}
      goldilocksBreakdown={goldilocksBreakdown}
      insight={insight}
      belowTabs={belowTabs}
      sidebar={<ListingSidebar details={details} />}
    />
  );
}
