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
   * Tab nav bar. Rendered directly under the style / beds-baths / sqft meta
   * line so it hugs the header and reclaims dead space beside a tall hero
   * thumbnail on non-Overview tabs. On Overview the floated hero stays put and
   * the tabs fall below it.
   */
  tabsSlot?: ReactNode;
  /**
   * When true, the hero photo sits right-aligned and top-aligned to the
   * address instead of floated below the meta line (used on non-Overview
   * tabs where there is no insight copy to wrap around it).
   */
  heroAside?: boolean;
  /**
   * Render only a slice of the header (for mobile sticky split in HeroPanels).
   * - full: default complete header
   * - meta: title through Style / Bed/Bath / Sqft
   * - heroInsight: floated hero + Insight block only
   */
  parts?: "full" | "meta" | "heroInsight";
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
  tabsSlot = null,
  heroAside = false,
  compact = false,
  className = "",
  parts = "full",
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

  // Secondary meta (style / beds+baths / sqft) sits directly under the type /
  // year-built line so listing + spotlight headers share the same stack.
  const metaSecondary = joinMetaSegments([
    style,
    bedBathSegment,
    sqft ? `${sqft.toLocaleString()} sqft` : null,
  ]);

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
      {metaSecondary ? (
        <p className="mt-1 font-mono text-[10px] tracking-[0.15em] uppercase text-white/45">
          {metaSecondary}
        </p>
      ) : null}
    </>
  );

  const heroInsightBlock =
    heroSlot || insight ? (
      <div className={compact ? "mt-2" : "mt-3"}>
        {heroSlot ? (
          // Float the hero (half width) so the insight starts at its
          // top-right and wraps back to full width below the image.
          <div className="mr-4 mb-2 w-1/2" style={{ float: "left" }}>
            {heroSlot}
          </div>
        ) : null}
        {insight ? (
          <>
            <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-gold mb-0.5">
              Insight
            </p>
            <ListingInsightCopy text={insight} />
          </>
        ) : null}
        <div style={{ clear: "both" }} aria-hidden />
      </div>
    ) : null;

  const scoreModal =
    goldilocksBreakdown && scoreOpen ? (
      <ListingScoreBreakdownModal
        open={scoreOpen}
        onClose={() => setScoreOpen(false)}
        score={goldilocksBreakdown}
        title={scoreTitle ?? title}
        subtitle={scoreSubtitle}
        isRental={isRental}
      />
    ) : null;

  if (parts === "meta") {
    return (
      <div className={className ? className : undefined}>
        {titleAndMeta}
        {scoreModal}
      </div>
    );
  }

  if (parts === "heroInsight") {
    if (!heroInsightBlock) return null;
    return <div className={className ? className : undefined}>{heroInsightBlock}</div>;
  }

  return (
    <div className={className ? className : "mb-6"}>
      {heroAside && heroSlot ? (
        // Non-Overview tabs: hero sits right-aligned, top-aligned to the
        // address, and links to the Photos tab. The tab bar slots into the
        // left column directly under the meta line so it fills the dead space
        // beside the taller hero thumbnail instead of dropping below the row.
        <div className="flex items-start gap-4">
          <div className="min-w-0 flex-1">
            {titleAndMeta}
            {tabsSlot ? (
              <div className={compact ? "mt-1" : "mt-3"}>{tabsSlot}</div>
            ) : null}
          </div>
          <div className="shrink-0" style={{ width: "40%", maxWidth: 220 }}>
            {heroSlot}
          </div>
        </div>
      ) : (
        <>
          {titleAndMeta}
          {heroInsightBlock}
          {tabsSlot ? (
            <div className={compact ? "mt-1" : "mt-3"}>{tabsSlot}</div>
          ) : null}
        </>
      )}

      {scoreModal}
    </div>
  );
}
