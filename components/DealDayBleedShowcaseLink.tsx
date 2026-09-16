"use client";

import Link from "next/link";
import { listingHoverHandlers } from "@/lib/warm-listing-cache";

/** Full-bleed hit target on Deal of the Day — empty photo → listing showcase. */
export function DealDayBleedShowcaseLink({
  href,
  address,
  mlsId = null,
  className = "absolute inset-0 z-[1]",
}: {
  href: string;
  address: string;
  mlsId?: string | null;
  className?: string;
}) {
  return (
    <Link
      href={href}
      {...listingHoverHandlers(mlsId)}
      data-testid="dod-bleed-showcase-link"
      className={`cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/60 focus-visible:ring-inset ${className}`}
      aria-label={`Open showcase for ${address}`}
    />
  );
}
