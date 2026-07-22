"use client";

import { ListingRemarksContent } from "@/components/listing/ListingOverviewPanels";
import ListingPhotoScrollStack from "@/components/listing/ListingPhotoScrollStack";
import { useListingPhotosMode } from "@/components/listing/ListingPhotosModeContext";

/**
 * Overview tab body: remarks on small screens + full-width hero stack.
 * Desktop remarks live in ListingHeroPanels (above Location).
 * Clicking the hero switches to the Photos tab (collapses the slide-up panel).
 */
export function ListingOverviewPhotoDeck({
  remarks,
  mlsId,
  photoCount,
  heroAlt,
  hideHero = false,
  obfuscatePhotoIndex,
  showHero = true,
}: {
  remarks: string | null;
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
  /** When false, only remarks (hero lives in PhotoMode behind the panel). */
  showHero?: boolean;
}) {
  const goToPhotos = useListingPhotosMode();
  const count = photoCount ?? 0;
  const showStack = showHero && !hideHero && count > 0;

  return (
    <div className="min-w-0">
      {/* Mobile / narrow: remarks stay in the Overview slide panel. */}
      <div className="px-4 lg:hidden">
        <ListingRemarksContent remarks={remarks} />
      </div>
      {showStack ? (
        <div className="mt-4 max-lg:mt-4 lg:mt-0">
          <ListingPhotoScrollStack
            mlsId={mlsId}
            photoCount={count}
            altBase={heroAlt}
            obfuscatePhotoIndex={obfuscatePhotoIndex}
            onPhotoActivate={goToPhotos ? () => goToPhotos() : undefined}
          />
        </div>
      ) : null}
    </div>
  );
}
