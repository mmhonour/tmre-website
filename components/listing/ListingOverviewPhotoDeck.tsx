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
  photoHref,
  hideHero = false,
  obfuscatePhotoIndex,
  activePhotoIndex: controlledIndex,
  onPhotoSelect,
  showHero = true,
}: {
  remarks: string | null;
  mlsId: string;
  photoCount: number | null;
  address: string;
  city?: string | null;
  heroAlt: string;
  galleryHref?: string | null;
  /** When provided, thumbnails navigate to the Photos section at that index (revealing the Photos tab) instead of selecting in-place. */
  photoHref?: (photoIndex: number) => string;
  hideHero?: boolean;
  obfuscatePhotoIndex?: (photoIndex: number) => boolean;
  /** When provided, the active photo is controlled by the parent (state lifted so the hero can render elsewhere). */
  activePhotoIndex?: number;
  onPhotoSelect?: (photoIndex: number) => void;
  /** Render the hero photo inside the deck. Set false when the hero is rendered elsewhere (e.g. in the header). */
  showHero?: boolean;
}) {
  const [internalIndex, setInternalIndex] = useState(0);
  const isControlled = controlledIndex != null;
  const activePhotoIndex = isControlled ? controlledIndex : internalIndex;
  const handleSelect = onPhotoSelect ?? setInternalIndex;
  const count = photoCount ?? 0;

  useEffect(() => {
    if (!isControlled) setInternalIndex(0);
  }, [mlsId, isControlled]);

  return (
    <>
      <ListingRemarksWithThumbnails
        remarks={remarks}
        mlsId={mlsId}
        photoCount={photoCount}
        address={address}
        city={city}
        photoHref={photoHref}
        onPhotoSelect={photoHref ? undefined : handleSelect}
        activePhotoIndex={activePhotoIndex}
        obfuscatePhotoIndex={obfuscatePhotoIndex}
      />
      {showHero && !hideHero && count > 0 ? (
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
