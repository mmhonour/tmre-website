"use client";

import Link from "next/link";
import ListingThumbImage from "@/components/ListingThumbImage";
import {
  ListingPhotoObfuscationOverlay,
  listingPhotoObfuscationImgClass,
  listingPhotoObfuscationSizeForThumb,
} from "@/components/listing/ListingPhotoObfuscation";
import { listingPhotoThumbUrls, listingPhotosHref } from "@/lib/listing-url";

/** Listing photos 2–8 (0-based indices 1–7). */
const STRIP_COUNT = 7;
const STRIP_START_INDEX = 1;
const THUMB_W = 64;
const THUMB_H = 48;
const GAP = 6;

type ListingPhotoThumbGridProps = {
  mlsId: string;
  photoCount: number | null;
  address: string;
  city?: string | null;
  priority?: boolean;
  /** Override link target per photo index (e.g. spotlight `/spotlight/photos`). */
  photoHref?: (photoIndex: number) => string;
  /** Blur specific photos (e.g. coming-soon exterior shots). */
  obfuscatePhotoIndex?: (photoIndex: number) => boolean;
};

export default function ListingPhotoThumbGrid({
  mlsId,
  photoCount,
  address,
  city,
  priority = true,
  photoHref,
  obfuscatePhotoIndex,
}: ListingPhotoThumbGridProps) {
  const photos = listingPhotoThumbUrls(
    mlsId,
    photoCount,
    STRIP_COUNT,
    STRIP_START_INDEX,
  );
  if (photos.length === 0) return null;

  return (
    <div
      className="flex shrink-0 flex-col"
      style={{ width: THUMB_W, gap: GAP }}
    >
      {photos.map((src, slot) => {
        const photoIndex = STRIP_START_INDEX + slot;
        const obfuscate = obfuscatePhotoIndex?.(photoIndex) ?? false;
        return (
          <Link
            key={photoIndex}
            href={
              photoHref?.(photoIndex) ??
              listingPhotosHref(mlsId, address, city, photoIndex)
            }
            aria-label={`View photo ${photoIndex + 1} for ${address}`}
            className="relative block shrink-0 overflow-hidden rounded-md shadow-sm transition-opacity hover:brightness-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/60"
            style={{ width: THUMB_W, height: THUMB_H }}
          >
            <ListingThumbImage
              src={src}
              priority={priority && slot === 0}
              className="absolute inset-0 block h-full w-full"
              imgClassName={listingPhotoObfuscationImgClass(
                obfuscate,
                "absolute inset-0 h-full w-full object-cover",
                listingPhotoObfuscationSizeForThumb(photoIndex),
              )}
            />
            {obfuscate ? <ListingPhotoObfuscationOverlay /> : null}
          </Link>
        );
      })}
    </div>
  );
}
