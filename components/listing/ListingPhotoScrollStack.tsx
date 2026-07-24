"use client";

import Link from "next/link";
import { useEffect, type MouseEvent } from "react";
import ListingHeroPhoto from "@/components/listing/ListingHeroPhoto";
import ListingLocationMap from "@/components/listing/ListingLocationMap";
import ListingPhotoCycleControls from "@/components/listing/ListingPhotoCycleControls";
import { useListingPhotosMode } from "@/components/listing/ListingPhotosModeContext";
import { listingPhotoProxyUrl } from "@/lib/listing-url";

export type ListingPhotoStackMapSlot = {
  latitude: number | null;
  longitude: number | null;
  addressQuery: string;
  hidePin?: boolean;
  outlineTown?: string | null;
  defaultZoom?: number;
};

type StackSlot =
  | { kind: "photo"; index: number }
  | { kind: "map" };

function buildSlots(
  photoCount: number,
  includeMap: boolean,
): StackSlot[] {
  if (photoCount <= 0) {
    return includeMap ? [{ kind: "map" }] : [];
  }
  const slots: StackSlot[] = [{ kind: "photo", index: 0 }];
  if (includeMap) slots.push({ kind: "map" });
  for (let i = 1; i < photoCount; i++) {
    slots.push({ kind: "photo", index: i });
  }
  return slots;
}

/**
 * Vertical stack of listing photos for continuous page scroll under sticky tabs.
 * Photos are flush edge-to-edge (no gaps, borders, or radius between frames).
 * Each photo links to the Photos gallery at that index when `photoHref` is set,
 * or calls `onPhotoActivate` / Overview photos-mode context when provided.
 * When Photos mode is active, collapses to a single hero with prev/next cycle.
 * When `mapSlot` is set, a frameless Location map sits in the 2nd stack position.
 */
export default function ListingPhotoScrollStack({
  mlsId,
  photoCount,
  altBase,
  photoHref,
  onPhotoActivate,
  obfuscatePhotoIndex,
  mapSlot = null,
  emptyLabel = "No photos yet",
}: {
  mlsId: string;
  photoCount: number;
  altBase: string;
  /** When set, each photo navigates to the Photos gallery at that index. */
  photoHref?: (photoIndex: number) => string;
  /**
   * When set, clicking a photo runs this — used to collapse the slide-up panel
   * to Photos mode. Overview context also activates photos mode when present.
   */
  onPhotoActivate?: (photoIndex: number) => void;
  obfuscatePhotoIndex?: (photoIndex: number) => boolean;
  /** Overview: frameless map in the second stack slot (same aspect as photos). */
  mapSlot?: ListingPhotoStackMapSlot | null;
  emptyLabel?: string;
}) {
  const photosMode = useListingPhotosMode();
  const carouselActive = Boolean(photosMode?.active && photoCount > 0);
  const activeIndex = carouselActive
    ? Math.min(
        Math.max(photosMode!.photoIndex, 0),
        Math.max(photoCount - 1, 0),
      )
    : 0;

  useEffect(() => {
    photosMode?.registerPhotoCount(photoCount);
  }, [photosMode, photoCount]);

  useEffect(() => {
    if (!carouselActive || !photosMode || photoCount <= 1) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        photosMode.cycle(-1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        photosMode.cycle(1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [carouselActive, photoCount, photosMode]);

  if (carouselActive && photosMode) {
    const canCycle = photoCount > 1;
    return (
      <div className="relative w-full">
        <ListingHeroPhoto
          url={listingPhotoProxyUrl(mlsId, activeIndex, { size: "full" })}
          alt={`${altBase} · photo ${activeIndex + 1}`}
          photoCount={photoCount}
          photoIndex={activeIndex}
          obfuscate={obfuscatePhotoIndex?.(activeIndex) ?? false}
          priority
          seamless
        />
        {canCycle ? (
          <ListingPhotoCycleControls
            onPrev={() => photosMode.cycle(-1)}
            onNext={() => photosMode.cycle(1)}
          />
        ) : null}
      </div>
    );
  }

  const slots = buildSlots(photoCount, Boolean(mapSlot));

  if (slots.length === 0) {
    return (
      <div className="aspect-[16/10] flex items-center justify-center bg-white/[0.04]">
        <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-white/45">
          {emptyLabel}
        </span>
      </div>
    );
  }

  const mapFrame = mapSlot ? (
    <div className="relative w-full aspect-[4/3] max-lg:aspect-[16/10] bg-navy-dark">
      <ListingLocationMap
        latitude={mapSlot.latitude}
        longitude={mapSlot.longitude}
        addressQuery={mapSlot.addressQuery}
        variant="hero"
        className="absolute inset-0"
        hideLabel
        seamless
        hidePin={mapSlot.hidePin}
        outlineTown={mapSlot.outlineTown}
        defaultZoom={mapSlot.defaultZoom}
      />
    </div>
  ) : null;

  return (
    <div className="flex flex-col">
      {slots.map((slot) => {
        if (slot.kind === "map") {
          return (
            <div
              key={`${mlsId}-map`}
              className="relative w-full"
              aria-label="Property location map"
            >
              {mapFrame}
            </div>
          );
        }

        const index = slot.index;
        const photo = (
          <ListingHeroPhoto
            url={listingPhotoProxyUrl(mlsId, index, { size: "full" })}
            alt={`${altBase} · photo ${index + 1}`}
            photoCount={photoCount}
            photoIndex={index}
            obfuscate={obfuscatePhotoIndex?.(index) ?? false}
            priority={index === 0}
            seamless
          />
        );

        const activate =
          onPhotoActivate != null
            ? () => onPhotoActivate(index)
            : photosMode
              ? () => photosMode.enter(index)
              : null;

        // Overview photos-mode (context or prop) wins over gallery links so a
        // photo click reveals the Photos tab instead of leaving the page.
        if (activate) {
          return (
            <button
              key={`${mlsId}-${index}`}
              type="button"
              className="relative block w-full cursor-pointer p-0 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold/50"
              aria-label={`Show photos · photo ${index + 1} of ${photoCount}`}
              onClick={(event: MouseEvent<HTMLButtonElement>) => {
                event.preventDefault();
                activate();
              }}
            >
              {photo}
            </button>
          );
        }

        const href = photoHref?.(index);
        if (href) {
          return (
            <Link
              key={`${mlsId}-${index}`}
              href={href}
              className="relative block w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold/50"
              aria-label={`View photo ${index + 1} of ${photoCount}`}
            >
              {photo}
            </Link>
          );
        }

        return (
          <div key={`${mlsId}-${index}`} className="relative w-full">
            {photo}
          </div>
        );
      })}
    </div>
  );
}
