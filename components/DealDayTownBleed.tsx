"use client";

import { useEffect, useState } from "react";
import ListingThumbImage from "@/components/ListingThumbImage";
import { listingPhotoProxyUrlAsFull } from "@/lib/listing-url";

export const DEAL_TOWN_BLEED_MS = 900;

export const DEAL_TOWN_BLEED_PATTERNS = [
  "meet-center",
  "center-out",
  "top-down",
] as const;

export type DealTownBleedPattern = (typeof DEAL_TOWN_BLEED_PATTERNS)[number];

export const DEAL_TOWN_BLEED_LABELS: Record<DealTownBleedPattern, string> = {
  "meet-center": "Edges meet in the center",
  "center-out": "Center lines paint out",
  "top-down": "Line from the top paints down",
};

export function dealTownBleedPattern(index: number): DealTownBleedPattern {
  const i = ((index % 3) + 3) % 3;
  return DEAL_TOWN_BLEED_PATTERNS[i];
}

function bleedPhotoSrc(photoUrl: string | null | undefined): string | null {
  const src = photoUrl?.trim() ?? "";
  if (!src) return null;
  return listingPhotoProxyUrlAsFull(src);
}

/**
 * Listing photo behind the town-filter row only — not the “Today’s score /
 * One listing” headline above. Carousel paints: edges→center, center→edges,
 * top→down.
 */
export default function DealDayTownBleed({
  carouselIndex,
  slideDir = null,
  playOnMount = true,
  photoUrl = null,
  photoAlt = "",
}: {
  carouselIndex: number;
  slideDir?: "next" | "prev" | null;
  playOnMount?: boolean;
  photoUrl?: string | null;
  photoAlt?: string;
}) {
  const src = bleedPhotoSrc(photoUrl);
  const [paint, setPaint] = useState<{
    key: number;
    pattern: DealTownBleedPattern;
  } | null>(() =>
    playOnMount ? { key: 0, pattern: dealTownBleedPattern(carouselIndex) } : null,
  );

  useEffect(() => {
    if (!slideDir) return;
    setPaint({
      key: Date.now(),
      pattern: dealTownBleedPattern(carouselIndex),
    });
  }, [carouselIndex, slideDir]);

  return (
    <div
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
      aria-hidden
    >
      {src ? (
        <ListingThumbImage
          src={src}
          alt={photoAlt}
          className="absolute inset-0"
          imgClassName="absolute inset-0 h-full w-full object-cover"
          placeholderClassName="absolute inset-0 bg-navy-light/50"
        />
      ) : null}
      <div
        className={
          src
            ? "dod-town-bleed-photo-wash absolute inset-0"
            : "dod-town-bleed-rest absolute inset-0"
        }
      />
      {paint ? <BleedPaint key={paint.key} pattern={paint.pattern} /> : null}
    </div>
  );
}

function BleedPaint({ pattern }: { pattern: DealTownBleedPattern }) {
  if (pattern === "top-down") {
    return (
      <div className="dod-town-bleed-fill animate-dod-bleed-top-down absolute inset-0 origin-top" />
    );
  }

  const left =
    pattern === "meet-center"
      ? "animate-dod-bleed-meet-left origin-left"
      : "animate-dod-bleed-out-left origin-right";
  const right =
    pattern === "meet-center"
      ? "animate-dod-bleed-meet-right origin-right"
      : "animate-dod-bleed-out-right origin-left";

  return (
    <>
      <div className={`dod-town-bleed-fill absolute inset-y-0 left-0 w-1/2 ${left}`} />
      <div className={`dod-town-bleed-fill absolute inset-y-0 right-0 w-1/2 ${right}`} />
    </>
  );
}
