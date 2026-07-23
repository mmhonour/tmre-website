"use client";

import ListingPhotoScrollStack, {
  type ListingPhotoStackMapSlot,
} from "@/components/listing/ListingPhotoScrollStack";

/**
 * Overview tab body: full-width hero stack.
 * Remarks: desktop side panel + mobile teaser/drawer in ListingHeroPanels.
 * Clicking a photo enters Photos mode (reveals Photos tab, collapses panel).
 */
export function ListingOverviewPhotoDeck({
  mlsId,
  photoCount,
  heroAlt,
  hideHero = false,
  obfuscatePhotoIndex,
  showHero = true,
  mapSlot = null,
}: {
  /** Kept for call-site compatibility; remarks render via ListingHeroPanels. */
  remarks?: string | null;
  mlsId: string;
  photoCount: number | null;
  /** @deprecated Thumbnails removed — kept for call-site compatibility. */
  address?: string;
  city?: string | null;
  heroAlt: string;
  galleryHref?: string | null;
  photoHref?: (photoIndex: number) => string;
  hideHero?: boolean;
  obfuscatePhotoIndex?: (photoIndex: number) => boolean;
  activePhotoIndex?: number;
  onPhotoSelect?: (photoIndex: number) => void;
  /** When false, hero lives in PhotoMode behind the panel. */
  showHero?: boolean;
  /** Frameless map in the 2nd stack slot (Overview). */
  mapSlot?: ListingPhotoStackMapSlot | null;
}) {
  const count = photoCount ?? 0;
  const showStack = showHero && !hideHero && (count > 0 || Boolean(mapSlot));

  if (!showStack) return null;

  return (
    <div className="min-w-0">
      <ListingPhotoScrollStack
        mlsId={mlsId}
        photoCount={count}
        altBase={heroAlt}
        obfuscatePhotoIndex={obfuscatePhotoIndex}
        mapSlot={mapSlot}
      />
    </div>
  );
}
