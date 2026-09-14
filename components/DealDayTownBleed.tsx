"use client";

import { useEffect, useState } from "react";

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

/**
 * Full-bleed wash from the town-name line down to the town filter.
 * Carousel steps cycle three paints: edges→center, center→edges, top→down.
 */
export default function DealDayTownBleed({
  carouselIndex,
  slideDir = null,
  playOnMount = true,
}: {
  carouselIndex: number;
  slideDir?: "next" | "prev" | null;
  playOnMount?: boolean;
}) {
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
      className="pointer-events-none absolute inset-y-0 left-1/2 z-0 w-screen -translate-x-1/2 overflow-hidden"
      aria-hidden
    >
      <div className="dod-town-bleed-rest absolute inset-0" />
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
