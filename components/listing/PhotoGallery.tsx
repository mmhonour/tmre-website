"use client";

import {
  ListingPhotoObfuscationOverlay,
  listingPhotoObfuscationImgClass,
  listingPhotoObfuscationSizeForThumb,
} from "@/components/listing/ListingPhotoObfuscation";
import ListingThumbImage from "@/components/ListingThumbImage";

export default function PhotoGallery({
  photos,
  active,
  setActive,
  address,
  obfuscateFirstPhoto = false,
  obfuscatePhotoIndex,
}: {
  photos: string[];
  active: number;
  setActive: (i: number) => void;
  address: string;
  /** When true, obfuscates coming-soon lead photos (indices 0 and 1). */
  obfuscateFirstPhoto?: boolean;
  /** Per-index override; takes precedence over `obfuscateFirstPhoto`. */
  obfuscatePhotoIndex?: (index: number) => boolean;
}) {
  if (photos.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] aspect-[16/10] flex items-center justify-center">
        <span className="font-mono text-[10px] tracking-[0.25em] uppercase text-white/45">
          No photos available
        </span>
      </div>
    );
  }
  const shouldObfuscate = (index: number) =>
    obfuscatePhotoIndex?.(index) ??
    (obfuscateFirstPhoto && (index === 0 || index === 1));

  const current = photos[Math.min(active, photos.length - 1)];
  const obfuscateActive = shouldObfuscate(active);
  return (
    <div className="space-y-3">
      <div className="relative rounded-2xl overflow-hidden bg-navy-dark border border-white/10 aspect-[16/10]">
        <ListingThumbImage
          src={current}
          alt={`${address} — photo ${active + 1} of ${photos.length}`}
          className="absolute inset-0 block w-full h-full"
          imgClassName={listingPhotoObfuscationImgClass(
            obfuscateActive,
            "absolute inset-0 w-full h-full object-cover",
          )}
        />
        {obfuscateActive ? <ListingPhotoObfuscationOverlay /> : null}
        <span className="absolute bottom-3 right-3 font-mono text-[10px] tracking-[0.15em] uppercase text-white/80 bg-black/50 backdrop-blur-sm rounded-full px-3 py-1">
          {active + 1} / {photos.length}
        </span>
      </div>
      {photos.length > 1 && (
        <div className="grid grid-cols-6 sm:grid-cols-8 gap-2">
          {photos.map((p, i) => {
            const obfuscateThumb = shouldObfuscate(i);
            return (
              <button
                key={`${p}-${i}`}
                type="button"
                onClick={() => setActive(i)}
                className={`relative aspect-square rounded-md overflow-hidden border transition-all ${
                  i === active
                    ? "border-gold ring-2 ring-gold/40"
                    : "border-white/10 hover:border-white/30"
                }`}
                aria-label={`Photo ${i + 1}`}
              >
                <ListingThumbImage
                  src={p}
                  priority={i < 8}
                  className="absolute inset-0 block w-full h-full"
                  imgClassName={listingPhotoObfuscationImgClass(
                    obfuscateThumb,
                    "absolute inset-0 w-full h-full object-cover",
                    listingPhotoObfuscationSizeForThumb(i),
                  )}
                />
                {obfuscateThumb ? <ListingPhotoObfuscationOverlay /> : null}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
