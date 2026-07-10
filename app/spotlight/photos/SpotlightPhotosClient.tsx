"use client";

import PhotoGallery from "@/components/listing/PhotoGallery";
import ListingErrorPanel from "@/components/listing/ListingErrorPanel";
import ListingSidebar from "@/components/listing/ListingSidebar";
import { SpotlightPageChrome } from "@/components/spotlight/SpotlightPageChrome";
import { useSpotlightListing } from "@/hooks/useSpotlightListing";
import { ListingShell } from "@/components/listing/ListingShell";
import { formatMlsStatus, fmtMoney } from "@/lib/listing-history";
import { buildSpotlightDetailsPanelProps } from "@/lib/listing-detail-panel-props";
import {
  spotlightObfuscatesPhotoWithPrivacy,
  spotlightEffectiveHeaderAddress,
} from "@/lib/spotlight-privacy-shared";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

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
    privacy,
  } = useSpotlightListing({
    photos: true,
  });
  const [activePhoto, setActivePhoto] = useState(0);
  const searchParams = useSearchParams();
  const photoParam = searchParams.get("photo");

  useEffect(() => {
    if (photos.length > 0) {
      setActivePhoto(initialPhotoIndex(photoParam, photos.length));
    }
  }, [photoParam, photos.length]);

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
  const obfuscatePhoto = (index: number) =>
    spotlightObfuscatesPhotoWithPrivacy(display.config, index, privacy);
  const headerAddress = spotlightEffectiveHeaderAddress(
    display.config,
    mlsListing,
    privacy,
  );
  const publicAddressLabel = headerAddress.street;
  const details = buildSpotlightDetailsPanelProps(display, mlsListing, fmtMoney);

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
    ) : photos.length > 0 ? (
      <PhotoGallery
        photos={photos}
        active={activePhoto}
        setActive={setActivePhoto}
        address={publicAddressLabel}
        obfuscatePhotoIndex={obfuscatePhoto}
      />
    ) : (
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] aspect-[16/10] flex flex-col items-center justify-center gap-3 px-6 text-center">
        <span className="font-mono text-[10px] tracking-[0.25em] uppercase text-gold">
          Spotlight
        </span>
        <p className="font-serif italic text-2xl sm:text-3xl text-white">
          Coming Soon...
        </p>
        <p className="font-mono text-[10px] tracking-[0.15em] uppercase text-white/45">
          Photography releasing shortly
        </p>
      </div>
    );

  return (
    <SpotlightPageChrome
      active="photos"
      display={display}
      propertyTab={propertyTab}
      mlsListing={mlsListing}
      isClosed={isClosed}
      goldilocksScore={goldilocksScore}
      goldilocksBreakdown={goldilocksBreakdown}
      insight={insight}
      belowTabs={belowTabs}
      sidebar={<ListingSidebar details={details} />}
    />
  );
}
