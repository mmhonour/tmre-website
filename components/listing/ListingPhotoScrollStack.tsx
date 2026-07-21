"use client";

import Link from "next/link";
import ListingHeroPhoto from "@/components/listing/ListingHeroPhoto";
import { listingPhotoProxyUrl } from "@/lib/listing-url";

/**
 * Vertical stack of listing photos for continuous page scroll under sticky tabs.
 * Each photo links to the Photos gallery at that index when `photoHref` is set.
 */
export default function ListingPhotoScrollStack({
  mlsId,
  photoCount,
  altBase,
  photoHref,
  obfuscatePhotoIndex,
  emptyLabel = "No photos yet",
}: {
  mlsId: string;
  photoCount: number;
  altBase: string;
  /** When set, each photo navigates to the Photos tab at that index. */
  photoHref?: (photoIndex: number) => string;
  obfuscatePhotoIndex?: (photoIndex: number) => boolean;
  emptyLabel?: string;
}) {
  if (photoCount <= 0) {
    return (
      <div className="my-2 rounded-xl border border-white/10 bg-white/[0.04] aspect-[16/10] flex items-center justify-center">
        <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-white/45">
          {emptyLabel}
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0">
      {Array.from({ length: photoCount }, (_, index) => {
        const photo = (
          <ListingHeroPhoto
            url={listingPhotoProxyUrl(mlsId, index)}
            alt={`${altBase} · photo ${index + 1}`}
            photoCount={photoCount}
            photoIndex={index}
            obfuscate={obfuscatePhotoIndex?.(index) ?? false}
            priority={index === 0}
            bare
          />
        );
        const href = photoHref?.(index);
        if (!href) {
          return (
            <div
              key={`${mlsId}-${index}`}
              className="relative w-full border-y border-white/10 first:border-t-0"
            >
              {photo}
            </div>
          );
        }
        return (
          <Link
            key={`${mlsId}-${index}`}
            href={href}
            className="relative block w-full border-y border-white/10 first:border-t-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold/50"
            aria-label={`View photo ${index + 1} of ${photoCount}`}
          >
            {photo}
          </Link>
        );
      })}
    </div>
  );
}
