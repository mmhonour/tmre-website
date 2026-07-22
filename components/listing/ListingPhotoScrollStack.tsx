"use client";

import Link from "next/link";
import type { MouseEvent } from "react";
import ListingHeroPhoto from "@/components/listing/ListingHeroPhoto";
import { listingPhotoProxyUrl } from "@/lib/listing-url";

/**
 * Vertical stack of listing photos for continuous page scroll under sticky tabs.
 * Photos are flush edge-to-edge (no gaps, borders, or radius between frames).
 * Each photo links to the Photos gallery at that index when `photoHref` is set,
 * or calls `onPhotoActivate` (e.g. switch to Photos tab) when provided instead.
 */
export default function ListingPhotoScrollStack({
  mlsId,
  photoCount,
  altBase,
  photoHref,
  onPhotoActivate,
  obfuscatePhotoIndex,
  emptyLabel = "No photos yet",
}: {
  mlsId: string;
  photoCount: number;
  altBase: string;
  /** When set, each photo navigates to the Photos gallery at that index. */
  photoHref?: (photoIndex: number) => string;
  /**
   * When set (and photoHref is not), clicking a photo runs this — used to
   * collapse the slide-up panel to Photos mode.
   */
  onPhotoActivate?: (photoIndex: number) => void;
  obfuscatePhotoIndex?: (photoIndex: number) => boolean;
  emptyLabel?: string;
}) {
  if (photoCount <= 0) {
    return (
      <div className="aspect-[16/10] flex items-center justify-center bg-white/[0.04]">
        <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-white/45">
          {emptyLabel}
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {Array.from({ length: photoCount }, (_, index) => {
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
        if (onPhotoActivate) {
          return (
            <button
              key={`${mlsId}-${index}`}
              type="button"
              className="relative block w-full cursor-pointer p-0 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold/50"
              aria-label={`Show photos · photo ${index + 1} of ${photoCount}`}
              onClick={(event: MouseEvent<HTMLButtonElement>) => {
                event.preventDefault();
                onPhotoActivate(index);
              }}
            >
              {photo}
            </button>
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
