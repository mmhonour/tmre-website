"use client";

import Link from "next/link";
import type { ReactNode } from "react";

function joinMetaSegments(segments: ReactNode[]): ReactNode {
  const filtered = segments.filter(
    (segment) => segment != null && segment !== "",
  );
  if (filtered.length === 0) return null;

  return filtered.map((segment, index) => (
    <span key={index}>
      {index > 0 ? " · " : null}
      {segment}
    </span>
  ));
}

export type ListingPropertyFactsProps = {
  propertyType: string;
  style: string;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  yearBuilt: number | null;
  bedBathSearchHref?: string | null;
  className?: string;
};

/**
 * Property type / year / subtype / beds-baths / sqft — shared by the listing
 * header (desktop) and the mobile Overview meta dock.
 */
export default function ListingPropertyFacts({
  propertyType,
  style,
  beds,
  baths,
  sqft,
  yearBuilt,
  bedBathSearchHref = null,
  className = "",
}: ListingPropertyFactsProps) {
  const bedBathLabel =
    beds != null && baths != null && beds > 0 && baths > 0
      ? `${beds}BR/${baths}BA`
      : null;

  const bedBathSegment =
    bedBathLabel && bedBathSearchHref ? (
      <Link
        href={bedBathSearchHref}
        className="text-gold hover:text-gold-light transition-colors"
        title="Search Intelligence for similar bed and bath counts in this area"
      >
        {bedBathLabel}
      </Link>
    ) : (
      bedBathLabel
    );

  const primary = joinMetaSegments([
    propertyType?.replace(/ For Sale$/i, ""),
    yearBuilt ? `Built ${yearBuilt}` : null,
  ]);
  const secondary = joinMetaSegments([
    style,
    bedBathSegment,
    sqft ? `${sqft.toLocaleString()} sqft` : null,
  ]);

  if (!primary && !secondary) return null;

  return (
    <div className={className}>
      {primary ? (
        <p className="font-mono text-[10px] tracking-[0.15em] uppercase text-white/45">
          {primary}
        </p>
      ) : null}
      {secondary ? (
        <p
          className={`font-mono text-[10px] tracking-[0.15em] uppercase text-white/45 ${
            primary ? "mt-1" : ""
          }`}
        >
          {secondary}
        </p>
      ) : null}
    </div>
  );
}
