"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import ListingScoreBreakdownModal from "@/components/ListingScoreBreakdownModal";
import ListingValueScoreBadge from "@/components/listing/ListingValueScoreBadge";
import { ListingInsightCopy } from "@/components/listing/ListingInsightCopy";
import type { ScoreBreakdown } from "@/lib/goldilocks-score-info";

type ListingHeaderProps = {
  mlsId: string;
  status: string;
  address: {
    street: string;
    full: string;
    city: string;
    state: string;
    postalCode: string;
  };
  propertyType: string;
  style: string;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  yearBuilt: number | null;
  bedBathSearchHref?: string | null;
  hideMarketMeta?: boolean;
  /** Spotlight: hide street/city address line (title-only header). MLS status renders on the panel label row. */
  privacyMode?: boolean;
  goldilocksScore?: number | null;
  goldilocksBreakdown?: ScoreBreakdown | null;
  insight?: string | null;
  scoreTitle?: string | null;
  scoreSubtitle?: string | null;
  isRental?: boolean;
};

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

export default function ListingHeader({
  mlsId,
  status,
  address,
  propertyType,
  style,
  beds,
  baths,
  sqft,
  yearBuilt,
  bedBathSearchHref,
  hideMarketMeta = false,
  privacyMode = false,
  goldilocksScore = null,
  goldilocksBreakdown = null,
  insight = null,
  scoreTitle,
  scoreSubtitle = null,
  isRental = false,
  compact = false,
  className = "",
}: ListingHeaderProps & { className?: string; compact?: boolean }) {
  const hideMeta = hideMarketMeta || privacyMode;
  const [scoreOpen, setScoreOpen] = useState(false);
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

  const title = address.street || address.full;
  const showScore = goldilocksScore != null && goldilocksScore > 0;

  return (
    <div className={className ? className : "mb-6"}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {showScore ? (
          <ListingValueScoreBadge
            score={goldilocksScore}
            compact={compact}
            onClick={
              goldilocksBreakdown
                ? () => setScoreOpen(true)
                : undefined
            }
          />
        ) : null}
        <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1
            className={`font-serif text-white leading-tight min-w-0 ${
              compact ? "text-2xl lg:text-3xl" : "text-3xl lg:text-4xl"
            }`}
          >
            {title}
          </h1>
          {!privacyMode && (address.city || address.postalCode) ? (
            <span className="font-mono text-[11px] sm:text-xs tracking-[0.12em] uppercase text-white/65 shrink-0">
              {[address.city, address.postalCode].filter(Boolean).join(" · ")}
            </span>
          ) : null}
          {!hideMeta ? (
            <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-gold whitespace-nowrap shrink-0">
              #{mlsId}
            </span>
          ) : null}
        </div>
      </div>
      <p
        className={`font-mono text-[10px] tracking-[0.15em] uppercase text-white/45 ${
          compact ? "mt-2" : "mt-3"
        }`}
      >
        {joinMetaSegments([
          propertyType?.replace(/ For Sale$/i, ""),
          style,
          bedBathSegment,
          sqft ? `${sqft.toLocaleString()} sqft` : null,
          yearBuilt ? `Built ${yearBuilt}` : null,
        ])}
      </p>

      {insight ? (
        <div className={compact ? "mt-2" : "mt-3"}>
          <ListingInsightCopy text={insight} />
        </div>
      ) : null}

      {goldilocksBreakdown && scoreOpen ? (
        <ListingScoreBreakdownModal
          open={scoreOpen}
          onClose={() => setScoreOpen(false)}
          score={goldilocksBreakdown}
          title={scoreTitle ?? title}
          subtitle={scoreSubtitle}
          isRental={isRental}
        />
      ) : null}
    </div>
  );
}
