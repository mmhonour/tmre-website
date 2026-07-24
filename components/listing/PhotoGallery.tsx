"use client";

import { useEffect } from "react";
import {
  ListingPhotoObfuscationOverlay,
  listingPhotoObfuscationImgClass,
  listingPhotoObfuscationSizeForThumb,
} from "@/components/listing/ListingPhotoObfuscation";
import ListingPhotoCycleControls from "@/components/listing/ListingPhotoCycleControls";
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
  const count = photos.length;
  const safeActive = count > 0 ? Math.min(Math.max(active, 0), count - 1) : 0;

  useEffect(() => {
    if (count <= 1) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setActive((safeActive - 1 + count) % count);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        setActive((safeActive + 1) % count);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [count, safeActive, setActive]);

  if (count === 0) {
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

  const current = photos[safeActive];
  const obfuscateActive = shouldObfuscate(safeActive);
  const canCycle = count > 1;

  return (
    <div className="space-y-3">
      <div>
        <div className="relative overflow-hidden bg-navy-dark aspect-[16/10] max-lg:rounded-none max-lg:border-x-0 max-lg:border-b border-white/10 lg:rounded-2xl lg:border">
          <ListingThumbImage
            src={current}
            alt={`${address} — photo ${safeActive + 1} of ${count}`}
            className="absolute inset-0 block w-full h-full"
            imgClassName={listingPhotoObfuscationImgClass(
              obfuscateActive,
              "absolute inset-0 w-full h-full object-cover",
            )}
          />
          {obfuscateActive ? <ListingPhotoObfuscationOverlay /> : null}
          {canCycle ? (
            <ListingPhotoCycleControls
              onPrev={() => setActive((safeActive - 1 + count) % count)}
              onNext={() => setActive((safeActive + 1) % count)}
            />
          ) : null}
        </div>
        {canCycle ? (
          <p className="mt-1.5 text-right font-mono text-[10px] tracking-[0.15em] uppercase text-white/55 max-lg:px-3">
            {safeActive + 1} / {count}
          </p>
        ) : null}
      </div>
      {canCycle && (
        <div className="grid grid-cols-6 sm:grid-cols-8 gap-2 max-lg:px-3">
          {photos.map((p, i) => {
            const obfuscateThumb = shouldObfuscate(i);
            return (
              <button
                key={`${p}-${i}`}
                type="button"
                onClick={() => setActive(i)}
                className={`relative aspect-square rounded-md overflow-hidden border transition-all ${
                  i === safeActive
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
