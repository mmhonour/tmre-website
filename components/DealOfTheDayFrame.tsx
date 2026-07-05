"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import GoldilocksScoreExplainModal, {
  type ScoreExplainTopic,
} from "@/components/GoldilocksScoreExplainModal";
import ModalPortal from "@/components/ModalPortal";
import {
  useDealOfTheDayCarousel,
  type DealCarouselPayload,
  type DealCarouselScore,
  type DealTransactionFilter,
} from "@/hooks/useDealOfTheDayCarousel";
import type { FinishQualityAssessment } from "@/lib/finish-quality-types";
import { dealOfTheDayHref, listingDetailHrefForListing } from "@/lib/listing-url";
import ListingThumbImage from "@/components/ListingThumbImage";
import { listingHoverHandlers } from "@/lib/warm-listing-cache";

function fullDealOfTheDayHref(
  town: string | null | undefined,
  deal: DealCarouselPayload | null | undefined,
  transactionFilter: DealTransactionFilter,
): string {
  const listing = deal?.listing;
  return dealOfTheDayHref(town, {
    mlsId: listing?.mlsId,
    listingKey: listing?.listingKey,
    kind: deal?.kind ?? (transactionFilter === "all" ? null : transactionFilter),
  });
}

function fmtMoney(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  return `$${n.toLocaleString()}`;
}

function fmtLotAcres(acres: number | null | undefined): string | null {
  if (acres == null || acres <= 0) return null;
  return `${acres.toFixed(2)} ac`;
}

function fmtSqft(sqft: number | null | undefined): string | null {
  if (sqft == null || sqft <= 0) return null;
  return `${sqft.toLocaleString()} sqft`;
}

function useFinishQuality(mlsId: string | null | undefined) {
  const [assessment, setAssessment] = useState<FinishQualityAssessment | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!mlsId) {
      setAssessment(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    fetch(`/api/listings/${encodeURIComponent(mlsId)}/finish-quality`, {
      cache: "no-store",
    })
      .then(async (r) => (r.ok ? ((await r.json()) as FinishQualityAssessment) : null))
      .then((data) => {
        if (cancelled) return;
        setAssessment(data);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setAssessment(null);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [mlsId]);

  return { assessment, loading };
}

const FACTORS: {
  key: keyof DealCarouselScore["weights"];
  label: string;
  scoreKey: keyof DealCarouselScore;
  explainKey: ScoreExplainTopic;
}[] = [
  { key: "age", label: "Age", scoreKey: "age", explainKey: "age" },
  { key: "condition", label: "Condition", scoreKey: "condition", explainKey: "condition" },
  { key: "finishes", label: "Finishes", scoreKey: "finishesQuality", explainKey: "finishes" },
  { key: "ppsf", label: "PPSF fit", scoreKey: "pricePerSqftFit", explainKey: "ppsf" },
  { key: "layout", label: "Layout", scoreKey: "layoutQuality", explainKey: "layout" },
  { key: "schools", label: "Schools", scoreKey: "schoolRating", explainKey: "schools" },
];

function CarouselControls({
  paused,
  onTogglePause,
  onPrev,
  onNext,
  canNavigate,
  townLabel,
  positionLabel,
  isHero,
}: {
  paused: boolean;
  onTogglePause: () => void;
  onPrev: () => void;
  onNext: () => void;
  canNavigate: boolean;
  townLabel: string | null;
  positionLabel: string | null;
  isHero: boolean;
}) {
  const btnBase = isHero
    ? "border-white/15 text-white/70 hover:text-white hover:border-gold/40 hover:bg-white/5"
    : "border-charcoal/10 text-slate hover:text-navy hover:border-gold/40 hover:bg-cream";

  return (
    <div
      className={`px-4 py-2 flex items-center justify-between gap-2 ${
        isHero ? "border-t border-white/10 bg-white/[0.03]" : "border-t border-charcoal/[0.06] bg-cream/40"
      }`}
    >
      <div className="flex flex-1 items-center justify-center gap-1.5 min-w-0">
        <button
          type="button"
          onClick={onPrev}
          disabled={!canNavigate}
          aria-label="Previous town deal"
          className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-colors disabled:opacity-30 disabled:pointer-events-none ${btnBase}`}
        >
          ‹
        </button>
        <span
          className={`font-mono text-[9px] tracking-[0.12em] uppercase text-center truncate ${
            isHero ? "text-white/75" : "text-slate/80"
          }`}
        >
          {townLabel}
          {positionLabel ? ` · ${positionLabel}` : ""}
        </span>
        <button
          type="button"
          onClick={onNext}
          disabled={!canNavigate}
          aria-label="Next town deal"
          className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-colors disabled:opacity-30 disabled:pointer-events-none ${btnBase}`}
        >
          ›
        </button>
      </div>
      <button
        type="button"
        onClick={onTogglePause}
        disabled={!canNavigate}
        aria-label={paused ? "Resume town rotation" : "Pause town rotation"}
        className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-colors disabled:opacity-30 disabled:pointer-events-none ${btnBase}`}
      >
        {paused ? "▶" : "⏸"}
      </button>
    </div>
  );
}

function DealPhoto({
  deal,
  listing,
  isHero,
  layout,
}: {
  deal: DealCarouselPayload;
  listing: DealCarouselPayload["listing"];
  isHero: boolean;
  layout: "left" | "top-right";
}) {
  const sizeClass = isHero ? "w-20 h-[3.75rem]" : "w-20 h-16";
  const positionClass =
    layout === "top-right" ? "absolute top-3 right-3 z-10" : "shrink-0";
  const frameClass = `${
    isHero
      ? "bg-navy-dark border border-white/10"
      : "bg-cream border border-charcoal/[0.08]"
  }`;

  const photoInner = deal.photoUrl ? (
    <ListingThumbImage
      src={deal.photoUrl}
      className="relative block w-full h-full"
      imgClassName="absolute inset-0 w-full h-full object-cover"
    />
  ) : (
    <div className="w-full h-full flex items-center justify-center">
      <svg
        className={`w-5 h-5 ${isHero ? "text-white/20" : "text-slate/30"}`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1}
          d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
        />
      </svg>
    </div>
  );

  if (listing.mlsId || listing.listingKey) {
    return (
      <Link
        href={listingDetailHrefForListing(listing)}
        aria-label={`View all photos for ${listing.address.street || listing.address.full}`}
        className={`${sizeClass} ${positionClass} rounded-lg overflow-hidden transition-all hover:border-gold/40 hover:ring-2 hover:ring-gold/20 ${frameClass}`}
      >
        {photoInner}
      </Link>
    );
  }

  return (
    <div className={`${sizeClass} ${positionClass} rounded-lg overflow-hidden ${frameClass}`}>
      {deal.photoUrl ? (
        <ListingThumbImage
          src={deal.photoUrl}
          className="relative block w-full h-full"
          imgClassName="absolute inset-0 w-full h-full object-cover"
        />
      ) : null}
    </div>
  );
}

function DealContent({
  deal,
  slideDir,
  slideKey,
  isHero,
  onOpenBreakdown,
  finishQuality,
  finishLoading,
}: {
  deal: DealCarouselPayload;
  slideDir: "next" | "prev";
  slideKey: string;
  isHero: boolean;
  onOpenBreakdown: () => void;
  finishQuality: FinishQualityAssessment | null;
  finishLoading: boolean;
}) {
  const l = deal.listing;

  const detailParts = [
    fmtSqft(l.sqft),
    fmtLotAcres(deal.lotAcres),
  ].filter(Boolean);

  const finishLabel = finishQuality?.tier
    ? finishQuality.tier
    : finishLoading
      ? "Assessing…"
      : null;

  const photoLayout = isHero ? "top-right" : "left";

  return (
    <div
      key={slideKey}
      {...listingHoverHandlers(l.mlsId || l.listingKey || null)}
      className={`${isHero ? "relative p-3" : "p-4 flex gap-2.5"} ${
        slideDir === "next" ? "animate-deal-carousel-next" : "animate-deal-carousel-prev"
      }`}
      style={{ transformStyle: "preserve-3d" }}
    >
      {photoLayout === "left" ? (
        <DealPhoto deal={deal} listing={l} isHero={isHero} layout="left" />
      ) : null}

      <div className={`min-w-0 ${isHero ? "pr-[5.625rem]" : "flex-1"}`}>
        {(l.mlsId || l.listingKey) ? (
          <Link
            href={listingDetailHrefForListing(l)}
            className={`font-medium text-sm leading-snug hover:text-gold transition-colors line-clamp-2 ${
              isHero ? "text-white" : "text-navy"
            }`}
          >
            {l.address.street || l.address.full}
          </Link>
        ) : (
          <p
            className={`font-medium text-sm leading-snug line-clamp-2 ${
              isHero ? "text-white" : "text-navy"
            }`}
          >
            {l.address.street || l.address.full}
          </p>
        )}
        <p className={`font-mono text-[10px] mt-1 ${isHero ? "text-white/50" : "text-slate"}`}>
          {l.address.city}
          {l.beds && l.baths ? ` · ${l.beds}BR/${l.baths}BA` : ""}
        </p>
        {(detailParts.length > 0 || finishLabel) && (
          <p
            className={`font-mono text-[9px] mt-1 leading-relaxed ${
              isHero ? "text-white/45" : "text-slate/80"
            }`}
          >
            {detailParts.join(" · ")}
            {detailParts.length > 0 && finishLabel ? " · " : ""}
            {finishLabel ? (
              <>
                <span className={isHero ? "text-gold/90" : "text-gold"}>
                  {finishLabel} finishes
                </span>
                {finishQuality?.note && finishQuality.tier ? (
                  <span className={isHero ? "text-white/35" : "text-slate/60"}>
                    {" "}
                    — {finishQuality.note}
                  </span>
                ) : null}
              </>
            ) : null}
          </p>
        )}
        <div className="flex items-baseline justify-between gap-2 mt-2">
          <span className="font-mono text-sm tabular-nums text-gold">
            {fmtMoney(l.price)}
          </span>
          <button
            type="button"
            onClick={onOpenBreakdown}
            className={`font-mono text-[9px] tracking-[0.1em] uppercase transition-colors ${
              isHero ? "text-white/45 hover:text-gold" : "text-slate hover:text-gold"
            }`}
          >
            Score breakdown
          </button>
        </div>
      </div>

      {photoLayout === "top-right" ? (
        <DealPhoto deal={deal} listing={l} isHero={isHero} layout="top-right" />
      ) : null}
    </div>
  );
}

export default function DealOfTheDayFrame({
  city,
  theme = "hero",
  rotateTowns = true,
  transactionFilter = "all",
  className,
}: {
  city?: string;
  theme?: "hero" | "light";
  /** When false, only show the town passed in `city`. */
  rotateTowns?: boolean;
  /** Sales/rentals filter — matches Intelligence tx pills when set. */
  transactionFilter?: DealTransactionFilter;
  className?: string;
}) {
  const {
    loading,
    paused,
    togglePause,
    goNext,
    goPrev,
    slideDir,
    currentTown,
    currentDeal,
    carouselTowns,
    carouselIndex,
    canNavigate,
  } = useDealOfTheDayCarousel({
    initialTown: city,
    rotate: rotateTowns,
    transactionFilter,
  });

  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const [breakdownDeal, setBreakdownDeal] = useState<DealCarouselPayload | null>(null);
  const [explainTopic, setExplainTopic] = useState<ScoreExplainTopic | null>(null);

  const deal = currentDeal;
  const l = deal?.listing;
  const score = deal?.score;
  const modalDeal = breakdownOpen ? breakdownDeal : null;
  const modalListing = modalDeal?.listing;
  const modalScore = modalDeal?.score;

  const openBreakdown = () => {
    if (currentDeal) setBreakdownDeal(currentDeal);
    setBreakdownOpen(true);
  };

  const closeBreakdown = () => {
    setBreakdownOpen(false);
    setBreakdownDeal(null);
    setExplainTopic(null);
  };

  const composite = score?.composite;
  const { assessment: finishQuality, loading: finishLoading } = useFinishQuality(l?.mlsId);
  const isHero = theme === "hero";
  const scoreColor =
    composite != null && composite >= 85
      ? "text-sage"
      : composite != null && composite >= 70
        ? "text-gold"
        : isHero
          ? "text-white"
          : "text-navy";

  const headerTown = currentTown ?? (city && city !== "All" ? city : null);
  const positionLabel =
    carouselTowns.length > 1
      ? `${carouselIndex + 1}/${carouselTowns.length}`
      : null;

  return (
    <>
      <aside
        className={`rounded-2xl overflow-hidden w-full shrink-0 ${
          isHero
            ? "bg-white/[0.06] border border-white/10 backdrop-blur-sm"
            : "bg-white border border-charcoal/[0.06]"
        }${className ? ` ${className}` : ""}`}
      >
        <div
          className={`px-4 ${isHero ? "py-2" : "py-3"} flex items-center justify-between ${
            isHero ? "border-b border-white/10" : "border-b border-charcoal/[0.06]"
          }`}
        >
          <Link
            href={fullDealOfTheDayHref(currentTown ?? city, deal, transactionFilter)}
            className={`font-mono text-[10px] tracking-[0.2em] uppercase text-gold transition-colors ${
              isHero ? "hover:text-gold-light" : "hover:text-navy"
            }`}
          >
            Deal of the Day
            {headerTown ? (
              <span
                className={`normal-case tracking-normal ${
                  isHero ? "text-white/45" : "text-slate"
                }`}
              >
                {" "}
                · {headerTown}
              </span>
            ) : null}
          </Link>
          {loading ? (
            <span className={`font-mono text-[9px] ${isHero ? "text-white/40" : "text-slate/50"}`}>
              Loading…
            </span>
          ) : composite != null && score ? (
            <button
              type="button"
              onClick={openBreakdown}
              className={`font-mono text-sm tabular-nums font-medium underline underline-offset-2 transition-colors ${scoreColor} ${
                isHero
                  ? "decoration-white/30 hover:decoration-gold"
                  : "decoration-charcoal/20 hover:decoration-gold"
              }`}
              aria-label="View score breakdown"
            >
              {composite.toFixed(1)}
            </button>
          ) : null}
        </div>

        <div className={`overflow-hidden ${isHero ? "min-h-0" : "min-h-[9rem]"}`}>
          {loading ? (
            <div className={`p-4 ${isHero ? "h-24" : "h-32"} animate-pulse ${isHero ? "bg-white/5" : "bg-cream/80"}`} />
          ) : !deal || !l ? (
            <p
              className={`p-4 font-mono text-[10px] tracking-wide ${
                isHero ? "text-white/40" : "text-slate"
              }`}
            >
              {headerTown
                ? transactionFilter === "sale"
                  ? `No below-median sale pick in ${headerTown} right now.`
                  : transactionFilter === "rental"
                    ? `No below-median rental pick in ${headerTown} right now.`
                    : `No below-median pick in ${headerTown} right now.`
                : transactionFilter === "sale"
                  ? "No top sales picks available right now."
                  : transactionFilter === "rental"
                    ? "No top rental picks available right now."
                    : "No top picks available right now."}
            </p>
          ) : (
            <DealContent
              deal={deal}
              slideDir={slideDir}
              slideKey={`${currentTown}-${carouselIndex}`}
              isHero={isHero}
              onOpenBreakdown={openBreakdown}
              finishQuality={finishQuality}
              finishLoading={finishLoading}
            />
          )}
        </div>

        {rotateTowns && (
          <CarouselControls
            paused={paused}
            onTogglePause={togglePause}
            onPrev={goPrev}
            onNext={goNext}
            canNavigate={canNavigate}
            townLabel={currentTown}
            positionLabel={positionLabel}
            isHero={isHero}
          />
        )}
      </aside>

      <ModalPortal
        open={Boolean(breakdownOpen && modalScore)}
        onClose={closeBreakdown}
        ariaLabel="Score breakdown"
      >
        {modalScore && (
          <div
            className="relative bg-white rounded-3xl shadow-2xl shadow-navy/20 max-w-md w-full p-8 max-h-[min(85vh,calc(100vh-6rem))] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-6">
              <div>
                <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-gold mb-1">
                  Goldilocks score
                  {currentTown ? ` · ${currentTown}` : ""}
                </p>
                <h2 className="font-serif text-2xl text-navy">
                  {modalListing?.address.street ?? "Today's pick"}
                </h2>
              </div>
              <button
                type="button"
                onClick={closeBreakdown}
                className="text-slate hover:text-navy transition-colors font-mono text-lg leading-none mt-1"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="flex items-center gap-4 mb-6 pb-6 border-b border-charcoal/[0.08]">
              <button
                type="button"
                onClick={() => setExplainTopic("composite")}
                className={`font-mono text-4xl tabular-nums font-medium hover:opacity-80 transition-opacity underline underline-offset-4 decoration-charcoal/20 ${
                  modalScore.composite >= 85
                    ? "text-sage"
                    : modalScore.composite >= 70
                      ? "text-gold"
                      : "text-navy"
                }`}
              >
                {modalScore.composite.toFixed(1)}
              </button>
              <div>
                <p className="text-sm text-charcoal">Composite score out of 100</p>
                <button
                  type="button"
                  onClick={() => setExplainTopic("composite")}
                  className="font-mono text-[10px] tracking-[0.15em] uppercase text-gold hover:underline mt-1 inline-block"
                >
                  What this means →
                </button>
              </div>
            </div>

            <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-slate mb-4">
              Score breakdown
            </p>
            <div className="space-y-4 mb-6">
              {FACTORS.map(({ key, label, scoreKey, explainKey }) => {
                const value = modalScore[scoreKey] as number;
                return (
                  <div key={key}>
                    <div className="flex items-center justify-between font-mono text-[10px] tracking-[0.1em] uppercase text-charcoal/70 mb-1.5">
                      <span>{label}</span>
                      <span>
                        {Math.round(value)}
                        <button
                          type="button"
                          onClick={() => setExplainTopic(explainKey)}
                          className="text-slate/50 hover:text-gold transition-colors underline underline-offset-2 decoration-charcoal/15"
                          aria-label={`Explain ${label}`}
                        >
                          {" →"}
                        </button>
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-cream overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-navy/60 to-gold/80 rounded-full transition-all"
                        style={{ width: `${Math.min(100, value)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between gap-4 pt-4 border-t border-charcoal/[0.06]">
              {(modalListing?.mlsId || modalListing?.listingKey) && (
                <Link
                  href={listingDetailHrefForListing(modalListing)}
                  className="font-mono text-[10px] tracking-[0.15em] uppercase text-navy hover:text-gold transition-colors"
                >
                  View listing →
                </Link>
              )}
              <Link
                href={fullDealOfTheDayHref(currentTown ?? city, modalDeal, transactionFilter)}
                className="font-mono text-[10px] tracking-[0.15em] uppercase text-gold hover:underline ml-auto"
              >
                Full Deal of the Day →
              </Link>
            </div>
          </div>
        )}
      </ModalPortal>

      {explainTopic && modalScore && (
        <GoldilocksScoreExplainModal
          topic={explainTopic}
          context={{
            composite: modalScore.composite,
            factorScore:
              explainTopic === "age"
                ? modalScore.age
                : explainTopic === "condition"
                  ? modalScore.condition
                : explainTopic === "finishes"
                  ? modalScore.finishesQuality
                  : explainTopic === "ppsf"
                    ? modalScore.pricePerSqftFit
                    : explainTopic === "layout"
                      ? modalScore.layoutQuality
                      : explainTopic === "schools"
                        ? modalScore.schoolRating
                        : undefined,
            weight:
              explainTopic === "age"
                ? modalScore.weights.age
                : explainTopic === "condition"
                  ? modalScore.weights.condition
                : explainTopic === "finishes"
                  ? modalScore.weights.finishes
                  : explainTopic === "ppsf"
                    ? modalScore.weights.ppsf
                    : explainTopic === "layout"
                      ? modalScore.weights.layout
                      : explainTopic === "schools"
                        ? modalScore.weights.schools
                        : undefined,
          }}
          onClose={() => setExplainTopic(null)}
          layered
        />
      )}
    </>
  );
}
