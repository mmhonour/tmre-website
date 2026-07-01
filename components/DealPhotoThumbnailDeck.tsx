"use client";

import Link from "next/link";
import { listingPhotoThumbUrls } from "@/lib/listing-url";

const CARD_W = 52;
const CARD_H = 40;
const STAGGER_Y = 48;

export default function DealPhotoThumbnailDeck({
  mlsId,
  photoCount,
  photosHref,
  address,
  priority = false,
}: {
  mlsId: string;
  photoCount: number | null;
  photosHref: string;
  address: string;
  /** When true, load immediately (active showcase). */
  priority?: boolean;
}) {
  // Skip photo 0 — same image as the hero; show photos 2–6 (indices 1–5).
  const thumbs = listingPhotoThumbUrls(mlsId, photoCount, 5, 1);
  if (thumbs.length === 0) return null;

  const totalShown = 1 + thumbs.length;
  const extra =
    photoCount != null && photoCount > totalShown ? photoCount - totalShown : 0;
  const deckHeight = CARD_H + STAGGER_Y * (thumbs.length - 1);

  return (
    <Link
      href={photosHref}
      className="group/deck relative z-30 block shrink-0 transition-opacity hover:opacity-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/60 rounded-md"
      style={{ width: CARD_W, height: deckHeight }}
      aria-label={`View all ${photoCount ?? thumbs.length} photos of ${address}`}
      onClick={(e) => e.stopPropagation()}
    >
      {thumbs.map((src, i) => {
        const isFront = i === thumbs.length - 1;
        return (
          <div
            key={`${src}-${i}`}
            className="absolute right-0 rounded-md overflow-hidden bg-navy-dark shadow-md shadow-black/45 transition-shadow duration-300 group-hover/deck:shadow-lg"
            style={{
              width: CARD_W,
              height: CARD_H,
              top: i * STAGGER_Y,
              zIndex: i + 1,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
              loading={priority ? "eager" : "lazy"}
              decoding="async"
            />
            {isFront && extra > 0 ? (
              <span className="absolute bottom-0.5 right-0.5 font-mono text-[8px] tracking-wide text-white bg-black/65 rounded px-1 py-px">
                +{extra}
              </span>
            ) : null}
          </div>
        );
      })}
    </Link>
  );
}
