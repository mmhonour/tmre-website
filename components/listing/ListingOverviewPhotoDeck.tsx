"use client";

import { useEffect, useState } from "react";
import ListingHeroPhoto from "@/components/listing/ListingHeroPhoto";
import { ListingRemarksWithThumbnails } from "@/components/listing/ListingOverviewPanels";
import { listingPhotoProxyUrl } from "@/lib/listing-url";

export function ListingOverviewPhotoDeck({
  remarks,
  mlsId,
  photoCount,
  address,
  city,
  heroAlt,
  galleryHref = null,
  hideHero = false,
  obfuscatePhotoIndex,
}: {
  remarks: string | null;
  mlsId: string;
  photoCount: number | null;
  address: string;
  city?: string | null;
  heroAlt: string;
  galleryHref?: string | null;
  hideHero?: boolean;
  obfuscatePhotoIndex?: (photoIndex: number) => boolean;
}) {
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);
  const count = photoCount ?? 0;

  useEffect(() => {
    setActivePhotoIndex(0);
  }, [mlsId]);

  return (
    <>
      <ListingRemarksWithThumbnails
        remarks={remarks}
        mlsId={mlsId}
        photoCount={photoCount}
        address={address}
        city={city}
        onPhotoSelect={setActivePhotoIndex}
        activePhotoIndex={activePhotoIndex}
        obfuscatePhotoIndex={obfuscatePhotoIndex}
      />
      {!hideHero && count > 0 ? (
        <div className="mt-4 pt-4 border-t border-white/10">
          <ListingHeroPhoto
            url={listingPhotoProxyUrl(mlsId, activePhotoIndex)}
            alt={heroAlt}
            href={galleryHref}
            photoCount={count}
            photoIndex={activePhotoIndex}
            obfuscate={obfuscatePhotoIndex?.(activePhotoIndex) ?? false}
            bare
          />
        </div>
      ) : null}
    </>
  );
}
