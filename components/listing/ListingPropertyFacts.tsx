"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { formatMlsModificationStamp } from "@/lib/format-mls-mod-stamp";

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
  /** MLS ModificationTimestamp — legal/advertising freshness (not /latest event). */
  modificationTimestamp?: string | null;
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
  modificationTimestamp = null,
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
  const modStamp = formatMlsModificationStamp(modificationTimestamp);

  if (!primary && !secondary && !modStamp) return null;

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
      {modStamp ? (
        <p
          className={`font-mono text-[8px] tracking-[0.1em] uppercase text-white/30 tabular-nums ${
            primary || secondary ? "mt-1" : ""
          }`}
          title="MLS ModificationTimestamp — advertising/legal freshness; not the Latest event clock"
        >
          {modStamp}
        </p>
      ) : null}
    </div>
  );
}
