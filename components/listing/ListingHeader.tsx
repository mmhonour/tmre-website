"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
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
  /** Primary/hero photo — rendered full-width under score + address. */
  heroSlot?: ReactNode;
  /**
   * Tab nav bar. Rendered under the hero so the photo sits directly under the
   * address stack. Insight lives in ListingHeroPanels (right of Property Details).
   */
  tabsSlot?: ReactNode;
  /**
   * @deprecated Kept for call-site compat; hero is always under score/address now.
   */
  heroAside?: boolean;
  /**
   * Render only a slice of the header (for sticky split in HeroPanels).
   * - full: default complete header
   * - meta: title through Style / Bed/Bath / Sqft
   * - heroInsight: full-width hero (+ optional legacy insight) only
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

/** Phone: break out to viewport width. Desktop: bleed to panel edges (cancel p-4). */
const HERO_BLEED_CLASS =
  "max-lg:relative max-lg:left-1/2 max-lg:right-1/2 max-lg:-ml-[50vw] max-lg:-mr-[50vw] max-lg:w-screen max-lg:max-w-[100vw] lg:-mx-4";

export default function ListingHeader({
  mlsId,
  status: _status,
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
  heroAside: _heroAside = false,
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

  const heroBlock = heroSlot ? (
    <div className={`${compact ? "mt-0" : "mt-4"} ${HERO_BLEED_CLASS}`}>
      <div className="listing-hero-under-address [&_a]:rounded-none [&_a]:border-0 [&>div>div>a]:rounded-none [&>div>div>div]:rounded-none">
        {heroSlot}
      </div>
    </div>
  ) : null;

  const insightBlock = insight ? (
    <div className={compact ? "mt-3" : "mt-4"}>
      <p className="mb-0.5 text-center font-mono text-[10px] tracking-[0.2em] uppercase text-gold">
        Insight
      </p>
      <ListingInsightCopy text={insight} />
    </div>
  ) : null;

  // Insight sits above the hero so a continuous photo stack can scroll under sticky tabs
  // without pushing the summary far down the page.
  const heroInsightBlock =
    heroBlock || insightBlock ? (
      <>
        {insightBlock}
        {heroBlock}
      </>
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
    return (
      <div className={className ? className : undefined}>{heroInsightBlock}</div>
    );
  }

  return (
    <div className={className ? className : "mb-6"}>
      {titleAndMeta}
      {heroInsightBlock}
      {tabsSlot ? (
        <div className={compact ? "mt-2" : "mt-3"}>{tabsSlot}</div>
      ) : null}
      {scoreModal}
    </div>
  );
}
