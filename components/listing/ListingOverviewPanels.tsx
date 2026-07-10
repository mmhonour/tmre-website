import { listingFrameClass, listingPanelClass } from "@/components/listing/listing-frame";
import { ListingBackLink } from "@/components/listing/ListingShell";
import ListingSidebar from "@/components/listing/ListingSidebar";
import ListingTabLayout from "@/components/listing/ListingTabLayout";
import ListingPhotoThumbGrid from "@/components/listing/ListingPhotoThumbGrid";
import type { ListingDetailsSchoolsPanelProps } from "@/components/listing/ListingDetailsSchoolsPanel";

export type { ListingOverviewSchools } from "@/components/listing/ListingDetailsSchoolsPanel";

export function ListingRemarksContent({ remarks }: { remarks: string | null }) {
  if (remarks) {
    return (
      <div>
        <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-white/45 mb-3">
          Listing remarks
        </p>
        <p className="text-white/80 text-sm leading-relaxed whitespace-pre-line">
          {remarks}
        </p>
      </div>
    );
  }

  return (
    <p className="text-white/50 text-sm leading-relaxed">
      No public remarks for this listing.
    </p>
  );
}

export function ListingRemarksWithThumbnails({
  remarks,
  mlsId,
  photoCount,
  address,
  city,
  photoHref,
  onPhotoSelect,
  activePhotoIndex,
  obfuscatePhotoIndex,
}: {
  remarks: string | null;
  mlsId: string;
  photoCount: number | null;
  address: string;
  city?: string | null;
  photoHref?: (photoIndex: number) => string;
  onPhotoSelect?: (photoIndex: number) => void;
  activePhotoIndex?: number;
  obfuscatePhotoIndex?: (photoIndex: number) => boolean;
}) {
  const hasExtraPhotos = photoCount == null || photoCount > 1;

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-5">
      <div className="min-w-0 flex-1">
        <ListingRemarksContent remarks={remarks} />
      </div>
      {hasExtraPhotos ? (
        <ListingPhotoThumbGrid
          mlsId={mlsId}
          photoCount={photoCount}
          address={address}
          city={city}
          photoHref={photoHref}
          onPhotoSelect={onPhotoSelect}
          activePhotoIndex={activePhotoIndex}
          obfuscatePhotoIndex={obfuscatePhotoIndex}
        />
      ) : null}
    </div>
  );
}

export type ListingOverviewPanelsProps = {
  remarks: string | null;
  details: ListingDetailsSchoolsPanelProps;
  heroPhoto?: {
    url: string;
    alt: string;
    href?: string | null;
    photoCount: number;
  } | null;
  showBackLink?: boolean;
  unframed?: boolean;
};

export default function ListingOverviewPanels({
  remarks,
  details,
  heroPhoto = null,
  showBackLink = false,
  unframed = false,
}: ListingOverviewPanelsProps) {
  const panelClass = unframed ? listingPanelClass : listingFrameClass;

  return (
    <ListingTabLayout
      main={
        <>
          <div className={panelClass}>
            <ListingRemarksContent remarks={remarks} />
          </div>
          {showBackLink ? (
            <div className={panelClass}>
              <ListingBackLink className="mb-0" />
            </div>
          ) : null}
        </>
      }
      sidebar={
        <ListingSidebar
          details={details}
          heroPhoto={heroPhoto}
          unframed={unframed}
        />
      }
    />
  );
}
