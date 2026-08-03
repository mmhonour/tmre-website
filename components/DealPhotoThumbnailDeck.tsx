"use client";

import Link from "next/link";
import { useLayoutEffect, useRef, useState } from "react";
import { listingPhotoThumbUrls } from "@/lib/listing-url";
import ListingThumbImage from "@/components/ListingThumbImage";

const DECK_CARD_W = 52;
const DECK_CARD_H = 40;
const DECK_STAGGER_Y = 48;

/** Fallback until the first thumb reports its intrinsic size (common MLS landscape). */
const DEFAULT_PHOTO_ASPECT = 4 / 3;

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
  const stripRef = useRef<HTMLAnchorElement>(null);
  const [stripHeight, setStripHeight] = useState(0);
  /** width / height from the first decoded listing photo. */
  const [photoAspect, setPhotoAspect] = useState(DEFAULT_PHOTO_ASPECT);

  useLayoutEffect(() => {
    if (variant !== "strip") return;
    const el = stripRef.current;
    if (!el) return;
    const sync = () => {
      const h = el.getBoundingClientRect().height;
      if (h > 0) setStripHeight(h);
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, [variant, thumbs.length]);

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

  const n = thumbs.length;
  // Column width so each thumb is photoAspect (w/h) at equal height shares of the hero.
  const stripWidth =
    stripHeight > 0 && n > 0
      ? Math.max(1, (stripHeight / n) * photoAspect)
      : undefined;

  return (
    <Link
      ref={stripRef}
      href={photosHref}
      className="group/strip flex h-full min-h-0 shrink-0 flex-col gap-0 self-stretch focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/60 focus-visible:ring-inset"
      style={stripWidth != null ? { width: stripWidth } : { width: "4.5rem" }}
      aria-label={`View all ${photoCount ?? thumbs.length} photos of ${address}`}
      onClick={(e) => e.stopPropagation()}
    >
      {thumbs.map((src, i) => {
        const isLast = i === thumbs.length - 1;
        return (
          <div
            key={`${src}-${i}`}
            className="relative min-h-0 w-full flex-1 overflow-hidden bg-navy-dark"
          >
            <ListingThumbImage
              src={src}
              priority={priority && i === 0}
              className="absolute inset-0 block h-full w-full"
              imgClassName="absolute inset-0 h-full w-full object-cover"
              onNaturalSize={(w, h) => {
                if (i !== 0 || h <= 0) return;
                const next = w / h;
                if (!Number.isFinite(next) || next <= 0) return;
                setPhotoAspect((prev) =>
                  Math.abs(prev - next) < 0.01 ? prev : next,
                );
              }}
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
