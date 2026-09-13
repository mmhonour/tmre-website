"use client";

import { useCallback, useState } from "react";
import ShowcasePhotoFocus from "@/components/listing/showcase/ShowcasePhotoFocus";

function swatch(color: string, label: string): string {
  return `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1067"><rect fill="${color}" width="100%" height="100%"/><text x="50%" y="50%" fill="white" font-size="72" text-anchor="middle" font-family="Georgia,serif">${label}</text></svg>`,
  )}`;
}

const PHOTOS = [
  swatch("#1b3a4b", "Living room"),
  swatch("#3d2b1f", "Kitchen"),
  swatch("#2c4a3a", "Garden"),
];

export default function ListingPhotoFocusPreview() {
  const [index, setIndex] = useState(0);
  const [photoFocus, setPhotoFocus] = useState(false);

  const step = useCallback((delta: number) => {
    setIndex((current) => (current + delta + PHOTOS.length) % PHOTOS.length);
  }, []);

  const openFocus = (photoIndex?: number) => {
    if (photoIndex != null) setIndex(photoIndex);
    setPhotoFocus(true);
  };

  return (
    <div className="min-h-screen bg-cream">
      <div className="mx-auto max-w-[430px] px-4 pb-16 pt-28">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-gold">
          UI preview
        </p>
        <h1 className="mb-2 font-serif text-3xl text-navy">
          Listing photo full screen
        </h1>
        <p className="mb-6 text-sm leading-relaxed text-slate">
          Phone-width demo. Tap the full-bleed photo or a thumbnail. Rail
          glyphs and type hide; Close (or swipe down) exits. Fixture swatches —
          not a live listing.
        </p>

        <div className="relative min-h-[70vh] overflow-hidden bg-navy-dark text-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={PHOTOS[index]}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
          {!photoFocus ? (
            <button
              type="button"
              className="absolute inset-0 z-[15]"
              aria-label="View photo full screen"
              onClick={() => openFocus()}
            />
          ) : null}
          {!photoFocus ? (
            <>
              <div className="pointer-events-none relative z-20 flex min-h-[70vh] flex-col justify-between p-5">
                <p className="font-serif text-2xl">12 Preview Lane</p>
                <div className="flex justify-between font-mono text-[10px] uppercase tracking-[0.2em] text-white/70">
                  <span>Pause</span>
                  <span>See all photos</span>
                </div>
              </div>
              <div className="pointer-events-none absolute right-3 top-1/3 z-20 flex flex-col gap-2">
                <span className="flex h-10 w-10 items-center justify-center bg-[#0d1424]/85 text-xs">
                  I
                </span>
                <span className="flex h-10 w-10 items-center justify-center bg-[#0d1424]/85 text-xs">
                  C
                </span>
                <span className="flex h-10 w-10 items-center justify-center bg-[#0d1424]/85 text-xs">
                  ?
                </span>
              </div>
            </>
          ) : null}
        </div>

        <div className="mt-4 grid grid-cols-3 gap-1">
          {PHOTOS.map((src, i) => (
            <button
              key={src}
              type="button"
              onClick={() => openFocus(i)}
              aria-label={`Show photo ${i + 1}`}
              className="relative aspect-[4/3] overflow-hidden"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>

        {photoFocus ? (
          <ShowcasePhotoFocus
            photos={PHOTOS}
            index={index}
            altBase="12 Preview Lane"
            onClose={() => setPhotoFocus(false)}
            onStep={step}
          />
        ) : null}
      </div>
    </div>
  );
}
