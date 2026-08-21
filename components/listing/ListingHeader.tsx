"use client";

import { useState, type ReactNode } from "react";
import { useSiteUnlocked } from "@/components/SiteUnlockProvider";
import ListingScoreBreakdownModal from "@/components/ListingScoreBreakdownModal";
import ListingShareButton from "@/components/listing/ListingShareButton";
import ListingPropertyFacts from "@/components/listing/ListingPropertyFacts";
import ListingValueScoreBadge from "@/components/listing/ListingValueScoreBadge";
import { ListingInsightCopy } from "@/components/listing/ListingInsightCopy";
import type { ScoreBreakdown } from "@/lib/goldilocks-score-info";
import { formatListingHeaderPrice } from "@/lib/listing-header-price";
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
  /** MLS ModificationTimestamp — shown small on property facts. */
  modificationTimestamp?: string | null;
  /** List/ask, or Closed sale/lease amount (History close) when `priceIsClosed`. */
  price?: number | null;
  /** When true, `price` is the final close — aria / semantics say Closed, not List. */
  priceIsClosed?: boolean;
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
  /**
   * Short canonical share path (`/listings/{id}` or `/spotlight`).
   * When set, shows Share/Copy that always uses this URL.
   */
  shareHref?: string | null;
  /**
   * Hide type / year / subtype / beds / sqft below the `lg` breakpoint
   * (mobile Overview moves those into the lower meta dock).
   */
  hideFactsOnMobile?: boolean;
  /**
   * Real city / state / zip for Admin when `privacyMode` blanks the public
   * address (Spotlight). MLS # sits to the right of this zip.
   */
  adminAddress?: {
    city?: string;
    state?: string;
    postalCode?: string;
  } | null;
};

/**
 * Phone: shell is already full-bleed (`px-0`), so the hero just spans the
 * content width. Desktop: bleed to panel edges (cancel inner padding).
 */
const HERO_BLEED_CLASS = "max-lg:w-full lg:-mx-4";

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
  modificationTimestamp = null,
  price = null,
  priceIsClosed = false,
  bedBathSearchHref,
  hideMarketMeta: _hideMarketMeta = false,
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
  shareHref = null,
  hideFactsOnMobile = false,
  adminAddress = null,
}: ListingHeaderProps & { className?: string; compact?: boolean }) {
  const siteUnlocked = useSiteUnlocked();
  const [scoreOpen, setScoreOpen] = useState(false);

  const title = address.street || address.full;
  const showScore = goldilocksScore != null && goldilocksScore > 0;
  const priceLabel =
    price != null && price > 0 ? formatListingHeaderPrice(price) : null;
  const publicLocation =
    !privacyMode && (address.city || address.postalCode) ? address : null;
  const unlockedLocation =
    siteUnlocked && adminAddress && (adminAddress.city || adminAddress.postalCode)
      ? adminAddress
      : siteUnlocked && !privacyMode
        ? address
        : null;
  const location = publicLocation ?? unlockedLocation;
  const locationText = location
    ? [
        location.city,
        abbreviateUsState(location.state),
        location.postalCode,
      ]
        .filter(Boolean)
        .join(" ")
    : "";
  const showMls = siteUnlocked && Boolean(mlsId.trim());

  const titleAndMeta = (
    <>
      {/*
        Three tracks: address (the only flexible one), score, price. The price
        never shrinks below its own text, so it cannot ride over the score; when
        the line genuinely runs out of room the price wraps to its own row.
      */}
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-start gap-x-3 gap-y-1.5">
          <div className="min-w-[8.5rem] shrink basis-0 grow">
            <h1
              className={`font-serif text-white leading-tight min-w-0 break-words ${
                compact ? "text-2xl lg:text-3xl" : "text-3xl lg:text-4xl"
              }`}
            >
              {title}
            </h1>
            {locationText || showMls || shareHref ? (
              <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                {locationText || showMls ? (
                  <span className="font-mono text-[11px] sm:text-xs tracking-[0.12em] uppercase text-white/65">
                    {locationText}
                    {showMls ? (
                      <span className="ml-2 tracking-[0.2em] text-gold whitespace-nowrap">
                        #{mlsId}
                      </span>
                    ) : null}
                  </span>
                ) : null}
                {shareHref ? (
                  <ListingShareButton href={shareHref} title={title} />
                ) : null}
              </div>
            ) : null}
          </div>
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
          {priceLabel ? (
            <div className="ml-auto flex shrink-0 items-start justify-end">
              <span
                className={`inline-flex shrink-0 items-start whitespace-nowrap font-serif font-bold tabular-nums leading-none text-gold max-lg:pr-1 ${
                  compact ? "text-2xl lg:text-3xl" : "text-3xl lg:text-4xl"
                }`}
                aria-label={
                  isRental
                    ? priceIsClosed
                      ? `Closed rent ${priceLabel}`
                      : `Monthly rent ${priceLabel}`
                    : priceIsClosed
                      ? `Closed price ${priceLabel}`
                      : `List price ${priceLabel}`
                }
              >
                {priceLabel}
                {isRental ? (
                  <span className="ml-0.5 self-end pb-0.5 font-mono text-[10px] font-normal tracking-[0.08em] uppercase text-gold/70">
                    /mo
                  </span>
                ) : null}
              </span>
            </div>
          ) : null}
        </div>
      </div>
      <ListingPropertyFacts
        propertyType={propertyType}
        style={style}
        beds={beds}
        baths={baths}
        sqft={sqft}
        yearBuilt={yearBuilt}
        bedBathSearchHref={bedBathSearchHref}
        modificationTimestamp={modificationTimestamp}
        className={`${compact ? "mt-2" : "mt-3"}${
          hideFactsOnMobile ? " max-lg:hidden" : ""
        }`}
      />
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
