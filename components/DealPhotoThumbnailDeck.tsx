"use client";

import Link from "next/link";
import { listingPhotoThumbUrls } from "@/lib/listing-url";
import ListingThumbImage from "@/components/ListingThumbImage";

const DECK_CARD_W = 52;
const DECK_CARD_H = 40;
const DECK_STAGGER_Y = 48;

const STRIP_THUMB_W = 64;
const STRIP_THUMB_H = 48;

export default function DealPhotoThumbnailDeck({
  mlsId,
  photoCount,
  photosHref,
  address,
  priority = false,
  variant = "strip",
}: {
  mlsId: string;
  photoCount: number | null;
  photosHref: string;
  address: string;
  /** When true, load immediately (active showcase). */
  priority?: boolean;
  /** strip — vertical column beside hero; deck — stacked overlay (legacy). */
  variant?: "strip" | "deck";
}) {
  // Skip photo 0 — same image as the hero; show photos 2–6 (indices 1–5).
  const thumbs = listingPhotoThumbUrls(mlsId, photoCount, 5, 1);
  if (thumbs.length === 0) return null;

  const totalShown = 1 + thumbs.length;
  const extra =
    photoCount != null && photoCount > totalShown ? photoCount - totalShown : 0;

  if (variant === "deck") {
    const deckHeight = DECK_CARD_H + DECK_STAGGER_Y * (thumbs.length - 1);

    return (
      <Link
        href={photosHref}
        className="group/deck relative z-30 block shrink-0 transition-opacity hover:opacity-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/60 rounded-md"
        style={{ width: DECK_CARD_W, height: deckHeight }}
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
                width: DECK_CARD_W,
                height: DECK_CARD_H,
                top: i * DECK_STAGGER_Y,
                zIndex: i + 1,
              }}
            >
              <ListingThumbImage
                src={src}
                priority={priority}
                className="absolute inset-0 block w-full h-full"
                imgClassName="absolute inset-0 w-full h-full object-cover"
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

  return (
    <Link
      href={photosHref}
      className="group/strip flex shrink-0 flex-col gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/60 rounded-md"
      style={{ width: STRIP_THUMB_W }}
      aria-label={`View all ${photoCount ?? thumbs.length} photos of ${address}`}
      onClick={(e) => e.stopPropagation()}
    >
      {thumbs.map((src, i) => {
        const isLast = i === thumbs.length - 1;
        return (
          <div
            key={`${src}-${i}`}
            className="relative overflow-hidden rounded-md border border-white/15 bg-navy-dark shadow-md shadow-black/40 transition-all duration-200 group-hover/strip:border-gold/35 group-hover/strip:shadow-lg group-hover/strip:shadow-black/50"
            style={{ width: STRIP_THUMB_W, height: STRIP_THUMB_H }}
          >
            <ListingThumbImage
              src={src}
              priority={priority && i === 0}
              className="absolute inset-0 block h-full w-full"
              imgClassName="absolute inset-0 h-full w-full object-cover"
            />
            {isLast && extra > 0 ? (
              <span className="absolute inset-0 flex items-center justify-center bg-navy/55 font-mono text-[10px] tracking-wide text-white">
                +{extra}
              </span>
            ) : null}
          </div>
        );
      })}
    </Link>
  );
}
