"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
// heroSlot renders the primary photo between the meta line and the insight.
import ListingScoreBreakdownModal from "@/components/ListingScoreBreakdownModal";
import ListingValueScoreBadge from "@/components/listing/ListingValueScoreBadge";
import { ListingInsightCopy } from "@/components/listing/ListingInsightCopy";
import type { ScoreBreakdown } from "@/lib/goldilocks-score-info";
import { abbreviateUsState } from "@/lib/us-states";

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
  /** Primary/hero photo, rendered between the meta line and the insight. */
  heroSlot?: ReactNode;
  /**
   * When true, the hero photo sits right-aligned and top-aligned to the
   * address instead of floated below the meta line (used on non-Overview
   * tabs where there is no insight copy to wrap around it).
   */
  heroAside?: boolean;
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
  heroSlot = null,
  heroAside = false,
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

  const titleAndMeta = (
    <>
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
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
        <div className="min-w-0 flex-1">
          <h1
            className={`font-serif text-white leading-tight min-w-0 ${
              compact ? "text-2xl lg:text-3xl" : "text-3xl lg:text-4xl"
            }`}
          >
            {title}
          </h1>
          {(!privacyMode && (address.city || address.postalCode)) ||
          !hideMeta ? (
            <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              {!privacyMode && (address.city || address.postalCode) ? (
                <span className="font-mono text-[11px] sm:text-xs tracking-[0.12em] uppercase text-white/65">
                  {[
                    address.city,
                    abbreviateUsState(address.state),
                    address.postalCode,
                  ]
                    .filter(Boolean)
                    .join(" ")}
                </span>
              ) : null}
              {!hideMeta ? (
                <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-gold whitespace-nowrap">
                  #{mlsId}
                </span>
              ) : null}
            </div>
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
          yearBuilt ? `Built ${yearBuilt}` : null,
        ])}
      </p>
    </>
  );

  // Secondary meta (style / beds+baths / sqft) renders full-width just above
  // the section tabs, keeping the bed/bath search hyperlink intact.
  const metaSecondary = joinMetaSegments([
    style,
    bedBathSegment,
    sqft ? `${sqft.toLocaleString()} sqft` : null,
  ]);

  return (
    <div className={className ? className : "mb-6"}>
      {heroAside && heroSlot ? (
        // Non-Overview tabs: hero sits right-aligned, top-aligned to the
        // address, and links to the Photos tab.
        <div className="flex items-start gap-4">
          <div className="min-w-0 flex-1">{titleAndMeta}</div>
          {/* Inline width avoids depending on the Tailwind `w-2/5` utility,
              which the Turbopack dev server sometimes fails to emit (leaving
              the hero collapsed to ~0px). */}
          <div className="shrink-0" style={{ width: "40%", maxWidth: 220 }}>
            {heroSlot}
          </div>
        </div>
      ) : (
        <>
          {titleAndMeta}
          {heroSlot || insight ? (
            <div className={compact ? "mt-2" : "mt-3"}>
              {heroSlot ? (
                // Float the hero (half width) so the insight starts at its
                // top-right and wraps back to full width below the image.
                // Inline `float` avoids depending on the Tailwind `float-left`
                // utility (Turbopack dev sometimes fails to emit new classes).
                <div className="mr-4 mb-3 w-1/2" style={{ float: "left" }}>
                  {heroSlot}
                </div>
              ) : null}
              {insight ? (
                <>
                  <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-gold mb-1">
                    Insight
                  </p>
                  <ListingInsightCopy text={insight} />
                </>
              ) : null}
              {/* Clear the float so the subnav below never wraps beside it. */}
              <div style={{ clear: "both" }} aria-hidden />
            </div>
          ) : null}
        </>
      )}

      {metaSecondary ? (
        <p
          className={`font-mono text-[10px] tracking-[0.15em] uppercase text-white/45 ${
            compact ? "mt-3" : "mt-4"
          }`}
        >
          {metaSecondary}
        </p>
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
