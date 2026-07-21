"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import GoldilocksScoreExplainModal, {
  type ScoreExplainTopic,
} from "@/components/GoldilocksScoreExplainModal";
import { TMRE_TOWNS, TMRE_TOWNS_LABEL } from "@/lib/tmre-towns";
import { dealOfTheDayHref, listingDetailHref, listingPhotosHref } from "@/lib/listing-url";
import { listingHoverHandlers } from "@/lib/warm-listing-cache";
import DealPhotoThumbnailDeck from "@/components/DealPhotoThumbnailDeck";
import ListingThumbImage from "@/components/ListingThumbImage";
import { usePersonalizedTowns } from "@/hooks/usePersonalizedTowns";
import {
  useDealOfTheDayCarousel,
  type DealCarouselPayload,
  type DealPropertyClassFilter,
} from "@/hooks/useDealOfTheDayCarousel";
import { usePersistedFilter } from "@/hooks/usePersistedFilter";
import {
  formatScoreWeightPct,
  useSiteUnlocked,
} from "@/components/SiteUnlockProvider";
import {
  filterPillButtonClass,
  filterPillContainerClass,
} from "@/lib/filter-pill-styles";
import {
  deriveDealSuperlatives,
  type DealSuperlativeInput,
} from "@/lib/deal-superlatives";
import { splitSentences } from "@/lib/split-sentences";
import { formatDealOfTheDayHeaderSubtitle } from "@/lib/deal-of-the-day-header";
import { listingPropertyClassLabel } from "@/lib/listing-property-class";

const DEAL_PROPERTY_CLASS_VALUES = ["homes", "multi", "condos"] as const;

type ListingKind = "sale" | "rental";

function formatScannedTowns(towns: readonly string[]): string {
  return towns.join(", ");
}

function scannedTownsLabel(options: {
  isDay: boolean;
  city: string | null;
  currentTown: string | null;
  scopeTowns?: readonly string[] | null;
}): string {
  if (options.isDay) {
    const town = options.city?.trim() || options.currentTown;
    if (town) return formatScannedTowns([town]);
  }
  const towns =
    options.scopeTowns && options.scopeTowns.length > 0
      ? options.scopeTowns
      : TMRE_TOWNS;
  return formatScannedTowns(towns);
}

type ApiResponse = {
  generatedAt: string;
  totalReviewed: number;
  qualifiedCount: number;
  scope?: { towns: string[] };
  salesReviewed?: number;
  rentalsReviewed?: number;
  kind: ListingKind;
  insight: string;
  superlatives?: string[];
  score: {
    age: number;
    condition: number;
    finishesQuality: number;
    pricePerSqftFit: number;
    layoutQuality: number;
    schoolRating: number;
    domRating?: number;
    composite: number;
    weights: {
      age: number;
      condition: number;
      finishes: number;
      ppsf: number;
      layout: number;
      schools: number;
      dom?: number;
    };
  };
  pricePerSqft: number | null;
  cityMedianPricePerSqft: number | null;
  cityMedianPrice?: number | null;
  valueDiscountPct?: number | null;
  photoUrl: string | null;
  lotAcres?: number | null;
  listing: {
    mlsId: string;
    propertyType: string;
    style: string;
    address: { street: string; city: string; state: string; full: string };
    price: number | null;
    originalListPrice: number | null;
    beds: number | null;
    baths: number | null;
    sqft: number | null;
    yearBuilt: number | null;
    dom: number | null;
    listDate: string | null;
    photoCount: number | null;
    schools: {
      elementary: string | null;
      middle: string | null;
      high: string | null;
      district: string | null;
    };
  };
};

const FALLBACK: ApiResponse = {
  generatedAt: new Date().toISOString(),
  totalReviewed: 0,
  qualifiedCount: 0,
  kind: "sale",
  insight:
    `Our Goldilocks model scans active listings across ${TMRE_TOWNS_LABEL} each morning — weighting age, condition, finishes, price-per-sqft fit, layout, schools, and days on market. This week's pick is loading — refresh in a moment to see it.`,
  superlatives: ["Value", "Turnkey", "Fresh", "Layout"],
  score: {
    age: 88,
    condition: 92,
    finishesQuality: 82,
    pricePerSqftFit: 88,
    layoutQuality: 84,
    schoolRating: 88,
    domRating: 100,
    composite: 87.0,
    weights: {
      age: 0.08,
      condition: 0.18,
      finishes: 0.22,
      ppsf: 0.22,
      layout: 0.1,
      schools: 0.1,
      dom: 0.1,
    },
  },
  pricePerSqft: 378,
  cityMedianPricePerSqft: 425,
  photoUrl: null,
  lotAcres: 0.28,
  listing: {
    mlsId: "—",
    propertyType: "Single Family",
    style: "Colonial",
    address: {
      street: "27 Rowayton Woods Dr",
      city: "Norwalk",
      state: "CT",
      full: "27 Rowayton Woods Dr, Norwalk, CT",
    },
    price: 695000,
    originalListPrice: 720000,
    beds: 3,
    baths: 2,
    sqft: 1840,
    yearBuilt: 2017,
    dom: 6,
    listDate: null,
    photoCount: 28,
    schools: {
      elementary: "Rowayton Elementary",
      middle: "Roton Middle",
      high: "Brien McMahon High School",
      district: "Norwalk Public Schools",
    },
  },
};

function fmtMoney(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  return `$${n.toLocaleString()}`;
}

function shortType(t: string): string {
  return t.replace(/ For Sale$/i, "").replace(/ For Lease$/i, "");
}

const townCarouselBtnClass =
  "inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/15 text-white/70 hover:text-white hover:border-gold/40 hover:bg-white/5 transition-colors disabled:opacity-30 disabled:pointer-events-none";

const DEAL_TOWN_TRANSITION_MS = 520;

const townLinkClass = (active: boolean) =>
  `transition-colors duration-300 underline-offset-2 hover:underline ${
    active
      ? "text-gold font-bold hover:text-gold-light"
      : "text-white/45 font-normal hover:text-white/70"
  }`;

function DealDayTownListTagline() {
  return (
    <p className="text-white/45 mt-1">BELOW THE TOWN MEDIAN · established homes</p>
  );
}

function DealDayTownListDesktop({ activeTown }: { activeTown: string | null }) {
  const towns = usePersonalizedTowns(TMRE_TOWNS);
  const activeKey = activeTown?.trim().toLowerCase() ?? null;

  return (
    <div className="hidden md:block font-mono text-[10px] tracking-[0.15em] uppercase mb-4 animate-fade-up">
      <p>
        {towns.map((town, i) => {
          const isActive = activeKey === town.toLowerCase();
          const separator =
            i === 0 ? null : i === towns.length - 1 ? ", and " : ", ";
          return (
            <span key={town}>
              {separator ? (
                <span className="text-white/45">{separator}</span>
              ) : null}
              <Link
                href={dealOfTheDayHref(town)}
                aria-current={isActive ? "page" : undefined}
                className={townLinkClass(isActive)}
              >
                {town}
              </Link>
            </span>
          );
        })}
      </p>
      <DealDayTownListTagline />
    </div>
  );
}

function DealDayTownListMobile({
  activeTown,
  slideDir = "next",
}: {
  activeTown: string | null;
  slideDir?: "next" | "prev";
}) {
  const prevTownRef = useRef<string | null>(activeTown);
  const [exitingTown, setExitingTown] = useState<string | null>(null);

  useEffect(() => {
    const prev = prevTownRef.current;
    const next = activeTown?.trim() || null;

    if (!next) {
      prevTownRef.current = null;
      setExitingTown(null);
      return;
    }

    if (!prev || prev.toLowerCase() === next.toLowerCase()) {
      prevTownRef.current = next;
      setExitingTown(null);
      return;
    }

    setExitingTown(prev);
    prevTownRef.current = next;

    const id = window.setTimeout(() => {
      setExitingTown(null);
    }, DEAL_TOWN_TRANSITION_MS);

    return () => window.clearTimeout(id);
  }, [activeTown]);

  const town = activeTown?.trim() || null;
  const exitAnimClass =
    slideDir === "prev" ? "animate-deal-town-exit-prev" : "animate-deal-town-exit-next";

  return (
    <div className="md:hidden font-mono text-[10px] tracking-[0.15em] uppercase mb-4 animate-fade-up">
      <p className="flex flex-wrap items-baseline gap-x-0 overflow-hidden min-h-[1.25rem]">
        {town ? (
          <>
            {exitingTown ? (
              <span
                key={`exit-${exitingTown}`}
                className={`inline-flex items-baseline shrink-0 ${exitAnimClass}`}
                aria-hidden
              >
                <span className="text-white/45 font-normal">{exitingTown}</span>
                <span className="text-white/45">, </span>
              </span>
            ) : null}
            <Link
              key={town}
              href={dealOfTheDayHref(town)}
              aria-current="page"
              className={`${townLinkClass(true)} ${
                exitingTown ? "animate-deal-town-enter" : ""
              }`}
            >
              {town}
            </Link>
          </>
        ) : null}
      </p>
      <DealDayTownListTagline />
    </div>
  );
}

function DealDayTownList({
  activeTown,
  slideDir,
}: {
  activeTown: string | null;
  slideDir?: "next" | "prev";
}) {
  return (
    <>
      <DealDayTownListDesktop activeTown={activeTown} />
      <DealDayTownListMobile activeTown={activeTown} slideDir={slideDir} />
    </>
  );
}

function fmtLotAcres(acres: number | null | undefined): string | null {
  if (acres == null || acres <= 0) return null;
  return `${acres.toFixed(2)} ac`;
}

const dealInsightCopyClass = "text-base text-white/70 leading-relaxed";

function DealInsightCopy({
  text,
  className,
  paragraphKey,
}: {
  text: string;
  className?: string;
  paragraphKey?: string;
}) {
  const sentences = splitSentences(text);
  const copyClass = className ?? dealInsightCopyClass;

  if (sentences.length <= 1) {
    return <p className={copyClass}>{text}</p>;
  }

  return (
    <div className="space-y-3">
      {sentences.map((sentence, index) => (
        <p key={paragraphKey ? `${paragraphKey}-${index}` : index} className={copyClass}>
          {sentence}
        </p>
      ))}
    </div>
  );
}

function resolveSuperlatives(
  deal: Pick<
    ApiResponse,
    "score" | "listing" | "valueDiscountPct" | "lotAcres" | "superlatives"
  > & { pickMode?: DealSuperlativeInput["pickMode"] },
): string[] {
  if (deal.superlatives?.length) return deal.superlatives;
  return deriveDealSuperlatives({
    score: deal.score,
    listing: deal.listing,
    valueDiscountPct: deal.valueDiscountPct,
    pickMode: deal.pickMode,
    lotAcres: deal.lotAcres,
  });
}

function DealSuperlatives({ words }: { words: string[] }) {
  if (!words.length) return null;
  return (
    <div className="animate-fade-up-delay-1">
      <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold mb-2.5">
        Superlatives
      </p>
      <div className="flex flex-wrap gap-2">
        {words.map((word) => (
          <span
            key={word}
            className="inline-flex items-center rounded-full border border-gold/25 bg-gold/5 px-3 py-1 font-mono text-[10px] tracking-[0.15em] uppercase text-gold/90"
          >
            {word}
          </span>
        ))}
      </div>
    </div>
  );
}

function mapDayDealToApi(deal: DealCarouselPayload): ApiResponse {
  const l = deal.listing;
  return {
    generatedAt: new Date().toISOString(),
    totalReviewed: deal.totalReviewed ?? 0,
    qualifiedCount: deal.qualifiedCount ?? 0,
    kind: deal.kind ?? "sale",
    insight: deal.insight ?? "",
    superlatives: deal.superlatives,
    score: deal.score,
    pricePerSqft: deal.pricePerSqft ?? null,
    cityMedianPricePerSqft: deal.cityMedianPricePerSqft ?? null,
    cityMedianPrice: deal.cityMedianPrice ?? null,
    valueDiscountPct: deal.valueDiscountPct ?? null,
    lotAcres: deal.lotAcres ?? null,
    photoUrl: deal.photoUrl,
    listing: {
      mlsId: l.mlsId,
      propertyType: l.propertyType ?? "Single Family",
      style: l.style ?? "",
      address: {
        street: l.address.street,
        city: l.address.city,
        state: l.address.state ?? "CT",
        full: l.address.full,
      },
      price: l.price,
      originalListPrice: l.originalListPrice ?? null,
      beds: l.beds,
      baths: l.baths,
      sqft: l.sqft ?? null,
      yearBuilt: l.yearBuilt ?? null,
      dom: l.dom,
      listDate: l.listDate ?? null,
      photoCount: l.photoCount ?? null,
      schools: l.schools ?? {
        elementary: null,
        middle: null,
        high: null,
        district: null,
      },
    },
  };
}

export default function DealOfTheWeekHero({
  mode = "week",
  /** When true, nav padding is already handled by HomeMethodOverview above. */
  afterOverview = false,
}: {
  mode?: "week" | "day";
  afterOverview?: boolean;
}) {
  const searchParams = useSearchParams();
  const city = searchParams.get("city");
  const listingParam = searchParams.get("listing");
  const kindParam = searchParams.get("kind");
  const propertyParam = searchParams.get("property");
  const pinnedKind =
    kindParam === "sale" || kindParam === "rental" ? kindParam : null;
  const pinnedProperty: DealPropertyClassFilter | null =
    propertyParam === "homes" ||
    propertyParam === "multi" ||
    propertyParam === "condos"
      ? propertyParam
      : null;
  const periodLabel = mode === "day" ? "Day" : "Week";
  const headlineLead = mode === "day" ? "Today's" : "This week's";
  const apiPath =
    mode === "day"
      ? city
        ? `/api/deal-of-the-day?city=${encodeURIComponent(city)}`
        : "/api/deal-of-the-day"
      : "/api/deal-of-the-week";
  const isDay = mode === "day";
  const [txFilter, setTxFilter] = usePersistedFilter<"sale" | "rental">(
    "deal-of-the-day-tx",
    "sale",
    ["sale", "rental"],
  );
  const [propertyClass, setPropertyClass] =
    usePersistedFilter<DealPropertyClassFilter>(
      "deal-of-the-day-property",
      "homes",
      DEAL_PROPERTY_CLASS_VALUES,
    );
  useEffect(() => {
    if (isDay && pinnedKind) setTxFilter(pinnedKind);
  }, [isDay, pinnedKind, setTxFilter]);
  useEffect(() => {
    if (isDay && pinnedProperty) setPropertyClass(pinnedProperty);
  }, [isDay, pinnedProperty, setPropertyClass]);
  const dayTxFilter = pinnedKind ?? txFilter;
  const dayPropertyClass = pinnedProperty ?? propertyClass;
  const carousel = useDealOfTheDayCarousel({
    initialTown: city,
    rotate: isDay && !city && !listingParam,
    enabled: isDay,
    transactionFilter: dayTxFilter,
    propertyClass: dayPropertyClass,
    pinnedListingId: listingParam,
  });
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [usedFallback, setUsedFallback] = useState(false);

  useEffect(() => {
    if (isDay) return;
    let cancelled = false;
    setLoading(true);
    fetch(apiPath)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as ApiResponse;
      })
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setLoading(false);
        // Warm the hero image as soon as the API returns a local proxy URL.
        if (d.photoUrl && typeof window !== "undefined") {
          const img = new Image();
          img.decoding = "async";
          img.src = d.photoUrl;
        }
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("[deal-of-the-week] fetch failed, using fallback", err);
        setData(FALLBACK);
        setUsedFallback(true);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [apiPath, city, mode, isDay]);

  const dayShowing =
    isDay && carousel.currentDeal ? mapDayDealToApi(carousel.currentDeal) : null;
  const dayEmpty = isDay && !carousel.loading && !dayShowing;
  const showing = isDay ? dayShowing : (data ?? FALLBACK);
  const loadingState = isDay ? carousel.loading : loading;
  const slideDir = carousel.slideDir;
  const slideKey = isDay
    ? `${dayTxFilter}-${dayPropertyClass}-${listingParam ?? "auto"}-${carousel.currentTown ?? "none"}-${carousel.carouselIndex}`
    : "static";
  const dayInsight = dayEmpty
    ? dayTxFilter === "rental"
      ? `No below-median ${listingPropertyClassLabel(dayPropertyClass).toLowerCase()} rental picks${city ? ` in ${city}` : " available"} right now.`
      : `No below-median ${listingPropertyClassLabel(dayPropertyClass).toLowerCase()} for-sale picks${city ? ` in ${city}` : " available"} right now.`
    : showing?.insight ?? "Scanning listings…";
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const dayHeaderTown = city?.trim() || carousel.currentTown;
  const dayHeaderSubtitle = formatDealOfTheDayHeaderSubtitle(new Date(), dayHeaderTown);
  const l = showing?.listing ?? FALLBACK.listing;
  const typeLine = [
    shortType(l.propertyType || "Home"),
    l.beds && l.baths ? `${l.beds}BR/${l.baths}BA` : null,
    l.sqft ? `${l.sqft.toLocaleString()} sqft` : null,
    fmtLotAcres(showing?.lotAcres),
    l.yearBuilt ? `Built ${l.yearBuilt}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const reductionPct =
    l.price && l.originalListPrice && l.originalListPrice > l.price
      ? Math.round(((l.originalListPrice - l.price) / l.originalListPrice) * 100)
      : null;
  const ppsfDiscount =
    showing?.pricePerSqft && showing?.cityMedianPricePerSqft
      ? Math.round(
          ((showing.pricePerSqft - showing.cityMedianPricePerSqft) /
            showing.cityMedianPricePerSqft) *
            100,
        )
      : null;
  const detailHref =
    l.mlsId && l.mlsId !== "—"
      ? listingDetailHref(
          l.mlsId,
          l.address.street || l.address.full,
          l.address.city,
        )
      : null;
  const photosHref =
    isDay && detailHref
      ? listingPhotosHref(
          l.mlsId,
          l.address.street || l.address.full,
          l.address.city,
        )
      : null;
  const townsScanned = scannedTownsLabel({
    isDay,
    city,
    currentTown: carousel.currentTown,
    scopeTowns: data?.scope?.towns,
  });
  const superlatives = showing
    ? resolveSuperlatives({
        ...showing,
        pickMode: isDay ? "below-median" : "board-top",
      })
    : [];

  return (
    <section className="relative navy-gradient overflow-hidden">
      <div className="absolute inset-0 hero-grid opacity-60" aria-hidden />
      <div
        className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-navy"
        aria-hidden
      />
      <div
        className={`relative mx-auto max-w-7xl px-6 lg:px-10 ${
          afterOverview
            ? isDay
              ? "pt-8 pb-8 lg:pt-10 lg:pb-12"
              : "pt-8 pb-12 lg:pt-10 lg:pb-16"
            : isDay
              ? "pt-20 pb-8 lg:pt-28 lg:pb-12"
              : "pt-20 pb-12 lg:pt-24 lg:pb-16"
        }`}
      >
        <div className="grid lg:grid-cols-[1.05fr_1fr] gap-8 lg:gap-12 items-start">
          <div className="space-y-3">
            <div className="animate-fade-up inline-flex items-center gap-2 rounded-full border border-gold/30 bg-gold/5 px-4 py-1.5">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  loadingState
                    ? "bg-gold animate-pulse-dot"
                    : usedFallback
                      ? "bg-coral"
                      : "bg-sage animate-pulse-dot"
                }`}
              />
              <span className="font-mono text-[11px] tracking-[0.2em] text-gold/90">
                {isDay ? (
                  <>
                    <span className="uppercase">Deal of the Day </span>
                    <span className="normal-case tracking-normal text-white/75">
                      {dayHeaderSubtitle}
                    </span>
                  </>
                ) : (
                  <span className="uppercase">
                    Deal of the {periodLabel} · {today}
                  </span>
                )}
              </span>
            </div>
            {mode === "day" && (
              <DealDayTownList
                activeTown={city ?? carousel.currentTown}
                slideDir={carousel.slideDir}
              />
            )}
            <h1 className="font-serif text-5xl sm:text-6xl lg:text-7xl leading-[1.05] tracking-tight text-white animate-fade-up">
              {mode === "day" ? (
                <>
                  Today&apos;s{" "}
                  <span className="italic gold-shimmer">
                    {(showing ?? FALLBACK).score.composite.toFixed(1)}.
                  </span>
                  <br />
                  <span className="italic text-white/85">One listing.</span>
                </>
              ) : (
                <>
                  {headlineLead}{" "}
                  <span className="italic gold-shimmer">
                    {(data ?? FALLBACK).score.composite.toFixed(1)}.
                  </span>
                  <br />
                  <span className="italic text-white/85">One listing.</span>
                </>
              )}
            </h1>
            {isDay ? (
              <div
                key={`photo-${slideKey}`}
                className={`max-w-xl relative rounded-2xl overflow-hidden border border-white/10 shadow-xl shadow-black/30 ${
                  dayEmpty ? "" : "animate-deal-copy-refresh"
                }`}
              >
                {dayEmpty ? (
                  <div className="relative w-full aspect-[16/9] bg-gradient-to-br from-navy-light to-navy-dark flex items-center justify-center px-6">
                    <p className="font-mono text-[11px] tracking-wide text-white/45 text-center leading-relaxed">
                      {dayTxFilter === "rental"
                        ? city
                          ? `No below-median rental pick in ${city} right now.`
                          : "No below-median rental picks available right now."
                        : city
                          ? `No below-median for-sale pick in ${city} right now.`
                          : "No below-median for-sale picks available right now."}
                    </p>
                  </div>
                ) : (
                  <>
                    <PhotoBanner
                      src={showing?.photoUrl ?? null}
                      alt={l.address.street || l.address.full}
                      loading={loadingState}
                      reveal={false}
                      priority
                      photoDeck={
                        photosHref && l.mlsId && l.mlsId !== "—"
                          ? {
                              mlsId: l.mlsId,
                              photoCount: l.photoCount,
                              photosHref,
                              address: l.address.street || l.address.full,
                              priority: true,
                            }
                          : null
                      }
                    />
                    {detailHref ? (
                      <Link
                        href={detailHref}
                        className="absolute inset-0 z-[15] cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/60 focus-visible:ring-inset"
                        aria-label={`View listing: ${l.address.street || l.address.full}`}
                      />
                    ) : null}
                  </>
                )}
              </div>
            ) : null}
            {isDay ? (
              <div key={`insight-${slideKey}`} className="max-w-xl space-y-4">
                <DealInsightCopy
                  text={dayInsight}
                  paragraphKey={`insight-${slideKey}`}
                  className={`${dealInsightCopyClass} animate-deal-copy-refresh`}
                />
                {!dayEmpty && superlatives.length > 0 ? (
                  <DealSuperlatives words={superlatives} />
                ) : null}
              </div>
            ) : (
              <div className="max-w-xl space-y-4">
                <DealInsightCopy
                  text={(showing ?? FALLBACK).insight}
                  className={`${dealInsightCopyClass} animate-fade-up-delay-1`}
                />
                <DealSuperlatives words={superlatives} />
              </div>
            )}
            <div className="animate-fade-up-delay-2 flex flex-wrap items-center gap-4">
              <Link
                href="/intelligence"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-gold px-7 py-4 text-sm font-medium text-navy transition-all hover:bg-gold-light hover:shadow-2xl hover:shadow-gold/30 hover:-translate-y-0.5"
              >
                {mode === "day" ? "See more deals" : "See the full deal board"}
                <span aria-hidden>→</span>
              </Link>
              {!loadingState && !usedFallback && showing ? (
                <span className="font-mono text-[11px] tracking-[0.15em] uppercase text-white/45">
                  {mode === "day"
                    ? `${showing.totalReviewed.toLocaleString()} scanned in ${townsScanned} · ${showing.qualifiedCount.toLocaleString()} below median`
                    : `Scanned ${showing.totalReviewed.toLocaleString()} active listings in ${townsScanned} · ${showing.qualifiedCount.toLocaleString()} qualified`}
                </span>
              ) : null}
            </div>
          </div>

          <div
            className={`min-w-0 ${
              isDay
                ? "lg:sticky lg:top-24 deal-showcase-stage overflow-visible"
                : "overflow-hidden"
            }`}
          >
            <DealCard
              key={isDay ? slideKey : "week"}
              slideDir={isDay ? slideDir : undefined}
              detailHref={dayEmpty ? null : detailHref}
              photosHref={dayEmpty ? null : photosHref}
              mlsId={dayEmpty || l.mlsId === "—" ? null : l.mlsId}
              photoCount={l.photoCount}
              address={l.address.street || l.address.full}
              city={l.address.city || l.address.state || ""}
              type={typeLine}
              kind={showing?.kind ?? dayTxFilter}
              price={l.price}
              originalPrice={l.originalListPrice}
              reductionPct={reductionPct}
              cityMedianPrice={showing?.cityMedianPrice}
              valueDiscountPct={showing?.valueDiscountPct}
              ppsf={showing?.pricePerSqft ?? null}
              cityMedianPpsf={showing?.cityMedianPricePerSqft ?? null}
              ppsfDiscount={ppsfDiscount}
              lotAcres={showing?.lotAcres ?? null}
              dom={l.dom}
              photoUrl={showing?.photoUrl ?? null}
              schools={l.schools}
              score={showing?.score ?? FALLBACK.score}
              loading={loadingState}
              empty={dayEmpty}
              scoreExplains={!loadingState && !(isDay && dayEmpty)}
              valueDealMode={mode === "day"}
              townLabel={isDay ? carousel.currentTown : null}
              transactionFilter={isDay ? dayTxFilter : undefined}
              onTransactionFilterChange={isDay ? setTxFilter : undefined}
              propertyClass={isDay ? dayPropertyClass : undefined}
              onPropertyClassChange={isDay ? setPropertyClass : undefined}
              carouselControls={
                isDay && !city && carousel.carouselTowns.length > 0
                  ? {
                      paused: carousel.paused,
                      onTogglePause: carousel.togglePause,
                      onPrev: carousel.goPrev,
                      onNext: carousel.goNext,
                      canStep: carousel.canNavigate,
                      townLabel: carousel.currentTown,
                      carouselIndex: carousel.carouselIndex,
                      carouselTotal: carousel.carouselTowns.length,
                    }
                  : null
              }
              hidePhoto={isDay}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function DealTransactionFilterPills({
  value,
  onChange,
}: {
  value: "sale" | "rental";
  onChange: (value: "sale" | "rental") => void;
}) {
  const options = [
    { value: "sale" as const, label: "For Sale" },
    { value: "rental" as const, label: "Rental" },
  ];
  return (
    <div
      className={`${filterPillContainerClass("compact", { wrap: false, bordered: false })} shrink-0`}
      role="group"
      aria-label="Listing type"
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          aria-pressed={value === opt.value}
          className={filterPillButtonClass(value === opt.value, "compact")}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function DealPropertyClassFilterPills({
  value,
  onChange,
}: {
  value: DealPropertyClassFilter;
  onChange: (value: DealPropertyClassFilter) => void;
}) {
  const options: { value: DealPropertyClassFilter; label: string }[] = [
    { value: "homes", label: "Homes" },
    { value: "multi", label: "Multi" },
    { value: "condos", label: "Condos" },
  ];
  return (
    <div
      className={`${filterPillContainerClass("compact", { wrap: false, bordered: false })} shrink-0 opacity-90`}
      role="group"
      aria-label="Property type"
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          aria-pressed={value === opt.value}
          className={filterPillButtonClass(value === opt.value, "compact")}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function DealCard({
  detailHref = null,
  photosHref = null,
  mlsId = null,
  photoCount = null,
  address,
  city,
  type,
  kind,
  price,
  originalPrice,
  reductionPct,
  cityMedianPrice,
  valueDiscountPct,
  ppsf,
  cityMedianPpsf,
  ppsfDiscount,
  lotAcres = null,
  dom,
  photoUrl,
  schools,
  score,
  loading,
  scoreExplains = false,
  valueDealMode = false,
  townLabel = null,
  slideDir = null,
  carouselControls = null,
  transactionFilter,
  onTransactionFilterChange,
  propertyClass,
  onPropertyClassChange,
  empty = false,
  hidePhoto = false,
}: {
  detailHref?: string | null;
  photosHref?: string | null;
  mlsId?: string | null;
  photoCount?: number | null;
  address: string;
  city: string;
  type: string;
  kind: ListingKind;
  price: number | null;
  originalPrice: number | null;
  reductionPct: number | null;
  cityMedianPrice?: number | null;
  valueDiscountPct?: number | null;
  ppsf: number | null;
  cityMedianPpsf: number | null;
  ppsfDiscount: number | null;
  lotAcres?: number | null;
  dom: number | null;
  photoUrl: string | null;
  schools: ApiResponse["listing"]["schools"];
  score: ApiResponse["score"];
  loading: boolean;
  scoreExplains?: boolean;
  valueDealMode?: boolean;
  townLabel?: string | null;
  slideDir?: "next" | "prev" | null;
  carouselControls?: {
    paused: boolean;
    onTogglePause: () => void;
    onPrev: () => void;
    onNext: () => void;
    canStep: boolean;
    townLabel: string | null;
    carouselIndex: number;
    carouselTotal: number;
  } | null;
  transactionFilter?: "sale" | "rental";
  onTransactionFilterChange?: (value: "sale" | "rental") => void;
  propertyClass?: DealPropertyClassFilter;
  onPropertyClassChange?: (value: DealPropertyClassFilter) => void;
  empty?: boolean;
  hidePhoto?: boolean;
}) {
  const [explainTopic, setExplainTopic] = useState<ScoreExplainTopic | null>(null);
  const showWeights = useSiteUnlocked();
  const isRental = kind === "rental";
  const cityShort = city ? city.split(",")[0] : "";
  const priceLabel = isRental ? "Monthly rent" : "List price";
  const priceSuffix = isRental ? "/mo" : "";
  const wasLabel = isRental ? "Asked" : "Was";
  const ppsfLabel = isRental ? "Rent / sqft" : "$ / sqft";
  const ppsfSuffix = isRental ? "/mo" : "";
  const medianLabel = cityShort
    ? `vs ${cityShort} ${isRental ? "rent median" : "median"}`
    : isRental
      ? "vs rent median"
      : "vs city median";
  const showcaseAnimClass = slideDir
    ? slideDir === "next"
      ? "animate-deal-book-flip-next"
      : "animate-deal-book-flip-prev"
    : "animate-fade-up-delay-2";
  const showFilterBar =
    Boolean(townLabel) ||
    Boolean(transactionFilter && onTransactionFilterChange) ||
    Boolean(propertyClass && onPropertyClassChange);
  return (
    <>
    <aside
      {...listingHoverHandlers(mlsId)}
      className={`${showcaseAnimClass} relative rounded-3xl bg-gradient-to-br from-navy-light/70 to-navy-dark/90 border border-white/10 shadow-2xl shadow-black/40 overflow-hidden backdrop-blur-sm`}
    >
      <div
        aria-hidden
        className="absolute -inset-px rounded-3xl bg-gradient-to-br from-gold/30 via-transparent to-transparent opacity-50 pointer-events-none"
        style={{ mask: "linear-gradient(white, transparent)" }}
      />
      <div className="relative">
        {showFilterBar ? (
          <div
            className={`flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-2.5 border-b border-white/10 bg-white/[0.03] ${
              townLabel ? "justify-between" : "justify-end"
            }`}
          >
            {townLabel ? (
              carouselControls ? (
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={carouselControls.onTogglePause}
                    aria-label={
                      carouselControls.paused
                        ? "Resume town rotation"
                        : "Pause town rotation"
                    }
                    className={townCarouselBtnClass}
                  >
                    {carouselControls.paused ? "▶" : "⏸"}
                  </button>
                  <button
                    type="button"
                    onClick={carouselControls.onPrev}
                    disabled={!carouselControls.canStep}
                    aria-label="Previous town deal"
                    className={townCarouselBtnClass}
                  >
                    ‹
                  </button>
                  <p className="font-mono text-[10px] tracking-[0.15em] uppercase text-white/85 px-0.5">
                    {townLabel}, CT
                    {carouselControls.carouselTotal > 1 ? (
                      <span className="text-white/45">
                        {" "}
                        · {carouselControls.carouselIndex + 1}/
                        {carouselControls.carouselTotal}
                      </span>
                    ) : null}
                  </p>
                  <button
                    type="button"
                    onClick={carouselControls.onNext}
                    disabled={!carouselControls.canStep}
                    aria-label="Next town deal"
                    className={townCarouselBtnClass}
                  >
                    ›
                  </button>
                </div>
              ) : (
                <p className="font-mono text-[10px] tracking-[0.15em] uppercase text-white/85 shrink-0">
                  {townLabel}, CT
                </p>
              )
            ) : null}
            {(transactionFilter && onTransactionFilterChange) ||
            (propertyClass && onPropertyClassChange) ? (
              <div className="flex flex-wrap items-center justify-end gap-2 min-w-0">
                {propertyClass && onPropertyClassChange ? (
                  <DealPropertyClassFilterPills
                    value={propertyClass}
                    onChange={onPropertyClassChange}
                  />
                ) : null}
                {transactionFilter && onTransactionFilterChange ? (
                  <DealTransactionFilterPills
                    value={transactionFilter}
                    onChange={onTransactionFilterChange}
                  />
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
        {!hidePhoto ? (
          <div className="relative">
            {empty ? (
              <div className="relative w-full aspect-[16/9] bg-gradient-to-br from-navy-light to-navy-dark flex items-center justify-center px-6">
                <p className="font-mono text-[11px] tracking-wide text-white/45 text-center leading-relaxed">
                  {transactionFilter === "rental"
                    ? townLabel
                      ? `No below-median ${propertyClass ? listingPropertyClassLabel(propertyClass).toLowerCase() + " " : ""}rental pick in ${townLabel} right now.`
                      : `No below-median ${propertyClass ? listingPropertyClassLabel(propertyClass).toLowerCase() + " " : ""}rental picks available right now.`
                    : townLabel
                      ? `No below-median ${propertyClass ? listingPropertyClassLabel(propertyClass).toLowerCase() + " " : ""}for-sale pick in ${townLabel} right now.`
                      : `No below-median ${propertyClass ? listingPropertyClassLabel(propertyClass).toLowerCase() + " " : ""}for-sale picks available right now.`}
                </p>
              </div>
            ) : (
              <>
                <PhotoBanner
                  src={photoUrl}
                  alt={address}
                  loading={loading}
                  reveal={false}
                  priority
                  photoDeck={
                    photosHref && mlsId
                      ? { mlsId, photoCount, photosHref, address, priority: true }
                      : null
                  }
                />
                {detailHref ? (
                  <Link
                    href={detailHref}
                    className="absolute inset-0 z-[15] cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/60 focus-visible:ring-inset"
                    aria-label={`View listing: ${address}`}
                  />
                ) : null}
              </>
            )}
          </div>
        ) : null}
      </div>
      {!empty ? (
      <div className="relative p-7 lg:p-8 pt-6 lg:pt-7 space-y-4">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-gold">
            {valueDealMode ? "Value Pick" : "Goldilocks Pick"}
          </span>
          <span className="inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.15em] uppercase text-sage border border-sage/30 bg-sage/10 rounded-full px-2.5 py-1">
            <span className="w-1 h-1 rounded-full bg-sage animate-pulse-dot" />
            {loading ? "Computing" : "Active"}
            {dom != null && !loading ? ` · ${dom}d on market` : ""}
          </span>
        </div>

        <div className="flex items-start gap-5">
          {scoreExplains ? (
            <button
              type="button"
              onClick={() => setExplainTopic("composite")}
              className="relative z-20 flex-shrink-0 w-20 h-20 rounded-2xl bg-sage text-white flex flex-col items-center justify-center shadow-lg shadow-sage/30 hover:brightness-110 transition-all underline-offset-2 cursor-pointer"
              aria-label="Explain composite score"
            >
              <span className="font-mono text-2xl font-medium tabular-nums leading-none">
                {score.composite.toFixed(1)}
              </span>
              <span className="font-mono text-[9px] tracking-[0.15em] uppercase mt-1 opacity-80">
                Score
              </span>
            </button>
          ) : (
          <div className="flex-shrink-0 w-20 h-20 rounded-2xl bg-sage text-white flex flex-col items-center justify-center shadow-lg shadow-sage/30">
            <span className="font-mono text-2xl font-medium tabular-nums leading-none">
              {score.composite.toFixed(1)}
            </span>
            <span className="font-mono text-[9px] tracking-[0.15em] uppercase mt-1 opacity-80">
              Score
            </span>
          </div>
          )}
          <div className="min-w-0">
            {detailHref ? (
              <Link
                href={detailHref}
                className="relative z-20 block font-serif text-2xl lg:text-3xl text-white leading-tight hover:text-gold transition-colors"
              >
                {address}
              </Link>
            ) : (
              <h2 className="font-serif text-2xl lg:text-3xl text-white leading-tight">
                {address}
              </h2>
            )}
            <p className="text-sm text-white/60 mt-1.5">{city}</p>
            <p className="font-mono text-[10px] tracking-[0.15em] uppercase text-white/45 mt-2.5">
              {type}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-5 pb-7 border-b border-white/10">
          <Stat
            label={priceLabel}
            value={price != null ? `${fmtMoney(price)}${priceSuffix}` : "—"}
            href={detailHref}
          />
          <Stat
            label={
              valueDealMode
                ? cityShort
                  ? `${cityShort} median`
                  : "Town median"
                : wasLabel
            }
            value={
              valueDealMode
                ? cityMedianPrice
                  ? `${fmtMoney(cityMedianPrice)}${priceSuffix}`
                  : "—"
                : originalPrice && originalPrice !== price
                  ? `${fmtMoney(originalPrice)}${priceSuffix}`
                  : "—"
            }
            sub={
              valueDealMode
                ? valueDiscountPct
                  ? `−${valueDiscountPct}% below`
                  : undefined
                : reductionPct
                  ? `−${reductionPct}%`
                  : undefined
            }
            accent={
              valueDealMode
                ? valueDiscountPct
                  ? "sage"
                  : undefined
                : reductionPct
                  ? "coral"
                  : undefined
            }
            subExplain={
              scoreExplains && !valueDealMode && reductionPct
                ? () => setExplainTopic("priceReduction")
                : undefined
            }
          />
          <Stat
            label={ppsfLabel}
            value={ppsf ? `$${Math.round(ppsf)}${ppsfSuffix}` : "—"}
            sub={
              lotAcres != null && lotAcres > 0 && ppsfDiscount != null
                ? `${ppsfDiscount > 0 ? "+" : ""}${ppsfDiscount}% vs median`
                : undefined
            }
            accent={
              lotAcres != null && lotAcres > 0 && ppsfDiscount != null && ppsfDiscount < 0
                ? "sage"
                : undefined
            }
            subExplain={
              scoreExplains && lotAcres != null && lotAcres > 0 && ppsfDiscount != null
                ? () => setExplainTopic("ppsfVsMedian")
                : undefined
            }
          />
          {lotAcres != null && lotAcres > 0 ? (
            <Stat label="Lot size" value={fmtLotAcres(lotAcres) ?? "—"} />
          ) : (
          <Stat
            label={medianLabel}
            value={
              cityMedianPpsf
                ? `$${Math.round(cityMedianPpsf)}${ppsfSuffix}`
                : "—"
            }
            sub={
              ppsfDiscount != null
                ? `${ppsfDiscount > 0 ? "+" : ""}${ppsfDiscount}%`
                : undefined
            }
            accent={ppsfDiscount != null && ppsfDiscount < 0 ? "sage" : undefined}
            subExplain={
              scoreExplains && ppsfDiscount != null
                ? () => setExplainTopic("ppsfVsMedian")
                : undefined
            }
          />
          )}
        </div>

        <div>
          <div className="flex items-end justify-between mb-3">
            <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-white/60">
              Goldilocks composite
            </span>
            {scoreExplains ? (
              <button
                type="button"
                onClick={() => setExplainTopic("composite")}
                className="relative z-20 font-mono text-sage text-lg tabular-nums hover:text-gold transition-colors underline underline-offset-2 decoration-white/20 cursor-pointer"
              >
                {score.composite.toFixed(1)}/100
              </button>
            ) : (
            <span className="font-mono text-sage text-lg tabular-nums">
              {score.composite.toFixed(1)}/100
            </span>
            )}
          </div>
          <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-sage to-gold"
              style={{ width: `${score.composite}%` }}
            />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3">
            <Factor label="Age" value={score.age} weight={score.weights.age} showWeight={showWeights} factorKey="age" onExplain={scoreExplains ? setExplainTopic : undefined} />
            <Factor label="Condition" value={score.condition} weight={score.weights.condition} showWeight={showWeights} factorKey="condition" onExplain={scoreExplains ? setExplainTopic : undefined} />
            <Factor label="Finishes" value={score.finishesQuality} weight={score.weights.finishes} showWeight={showWeights} factorKey="finishes" onExplain={scoreExplains ? setExplainTopic : undefined} />
            <Factor label="PPSF fit" value={score.pricePerSqftFit} weight={score.weights.ppsf} showWeight={showWeights} factorKey="ppsf" onExplain={scoreExplains ? setExplainTopic : undefined} />
            <Factor label="Layout" value={score.layoutQuality} weight={score.weights.layout} showWeight={showWeights} factorKey="layout" onExplain={scoreExplains ? setExplainTopic : undefined} />
            <Factor label="Schools" value={score.schoolRating} weight={score.weights.schools} showWeight={showWeights} factorKey="schools" onExplain={scoreExplains ? setExplainTopic : undefined} />
            {score.domRating != null ? (
              <Factor label="DOM" value={score.domRating} weight={score.weights.dom ?? 0} showWeight={showWeights} factorKey="dom" onExplain={scoreExplains ? setExplainTopic : undefined} />
            ) : null}
          </div>
        </div>

        <SchoolsBlock
          schools={schools}
          rating={score.schoolRating}
          onExplainRating={scoreExplains ? () => setExplainTopic("schools") : undefined}
        />

        <div className="flex items-center justify-between font-mono text-[10px] tracking-[0.15em] uppercase text-white/55">
          <span>{photoCount != null ? `${photoCount} photos` : "—"}</span>
          <Link
            href="/intelligence"
            className="relative z-20 text-gold hover:text-gold-light"
          >
            See full board →
          </Link>
        </div>
      </div>
      ) : null}
    </aside>

    {explainTopic && scoreExplains && (
      <GoldilocksScoreExplainModal
        topic={explainTopic}
        context={{
          composite: score.composite,
          showWeights,
          factorScore:
            explainTopic === "age" ? score.age
            : explainTopic === "condition" ? score.condition
            : explainTopic === "finishes" ? score.finishesQuality
            : explainTopic === "ppsf" ? score.pricePerSqftFit
            : explainTopic === "layout" ? score.layoutQuality
            : explainTopic === "schools" ? score.schoolRating
            : explainTopic === "dom" ? score.domRating
            : undefined,
          weight:
            explainTopic === "age" ? score.weights.age
            : explainTopic === "condition" ? score.weights.condition
            : explainTopic === "finishes" ? score.weights.finishes
            : explainTopic === "ppsf" ? score.weights.ppsf
            : explainTopic === "layout" ? score.weights.layout
            : explainTopic === "schools" ? score.weights.schools
            : explainTopic === "dom" ? score.weights.dom
            : undefined,
          ppsfDiscount: ppsfDiscount ?? undefined,
          reductionPct: reductionPct ?? undefined,
          isRental,
        }}
        onClose={() => setExplainTopic(null)}
      />
    )}
    </>
  );
}

function PhotoBanner({
  src,
  alt,
  loading,
  reveal = false,
  priority = false,
  photoDeck = null,
}: {
  src: string | null;
  alt: string;
  loading: boolean;
  reveal?: boolean;
  priority?: boolean;
  photoDeck?: {
    mlsId: string;
    photoCount: number | null;
    photosHref: string;
    address: string;
    priority?: boolean;
  } | null;
}) {
  const mainPhoto = (
    <div className="relative min-w-0 flex-1 aspect-[16/9] bg-gradient-to-br from-navy-light to-navy-dark overflow-hidden">
      {src ? (
        <ListingThumbImage
          src={src}
          alt={alt}
          priority={priority}
          hideLoadingPlaceholder={loading}
          placeholderClassName="absolute inset-0 bg-navy-light/80 animate-pulse"
          className="absolute inset-0 block w-full h-full"
          imgClassName={`absolute inset-0 w-full h-full object-cover ${
            reveal ? "animate-deal-photo-reveal" : ""
          }`}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-mono text-[10px] tracking-[0.25em] uppercase text-white/40">
            {loading ? "Loading photo…" : "Photo unavailable"}
          </span>
        </div>
      )}
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-navy-dark/90 to-transparent"
      />
    </div>
  );

  if (photoDeck) {
    return (
      <div className="flex w-full items-center gap-2 sm:gap-2.5">
        {mainPhoto}
        <DealPhotoThumbnailDeck
          mlsId={photoDeck.mlsId}
          photoCount={photoDeck.photoCount}
          photosHref={photoDeck.photosHref}
          address={photoDeck.address}
          priority={photoDeck.priority}
          variant="strip"
        />
      </div>
    );
  }

  return (
    <div className="relative w-full aspect-[16/9] bg-gradient-to-br from-navy-light to-navy-dark overflow-hidden">
      {src ? (
        <ListingThumbImage
          src={src}
          alt={alt}
          priority={priority}
          hideLoadingPlaceholder={loading}
          placeholderClassName="absolute inset-0 bg-navy-light/80 animate-pulse"
          className="absolute inset-0 block w-full h-full"
          imgClassName={`absolute inset-0 w-full h-full object-cover ${
            reveal ? "animate-deal-photo-reveal" : ""
          }`}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-mono text-[10px] tracking-[0.25em] uppercase text-white/40">
            {loading ? "Loading photo…" : "Photo unavailable"}
          </span>
        </div>
      )}
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-navy-dark/90 to-transparent"
      />
    </div>
  );
}

function SchoolsBlock({
  schools,
  rating,
  onExplainRating,
}: {
  schools: ApiResponse["listing"]["schools"];
  rating: number;
  onExplainRating?: () => void;
}) {
  const items: { label: string; value: string }[] = [];
  if (schools.elementary) items.push({ label: "Elementary", value: schools.elementary });
  if (schools.middle) items.push({ label: "Middle", value: schools.middle });
  if (schools.high) items.push({ label: "High", value: schools.high });
  if (items.length === 0 && schools.district) {
    items.push({ label: "District", value: schools.district });
  }
  if (items.length === 0) return null;

  const tone =
    rating >= 85
      ? "text-sage"
      : rating >= 70
        ? "text-gold"
        : "text-white/70";

  return (
    <div className="mb-7 pb-7 border-b border-white/10">
      <div className="flex items-center justify-between mb-3">
        <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-white/60">
          Schools
        </span>
        {onExplainRating ? (
          <button
            type="button"
            onClick={onExplainRating}
            className={`relative z-20 font-mono text-[11px] tabular-nums underline underline-offset-2 decoration-white/25 hover:decoration-gold transition-colors cursor-pointer ${tone}`}
          >
            {rating.toFixed(0)}/100
          </button>
        ) : (
        <span className={`font-mono text-[11px] tabular-nums ${tone}`}>
          {rating.toFixed(0)}/100
        </span>
        )}
      </div>
      <ul className="space-y-1.5">
        {items.map((s) => (
          <li
            key={s.label}
            className="flex items-baseline justify-between gap-3 text-sm"
          >
            <span className="font-mono text-[10px] tracking-[0.15em] uppercase text-white/45 shrink-0">
              {s.label}
            </span>
            <span className="text-white/85 text-right truncate">{s.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  accent,
  subExplain,
  href = null,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: "gold" | "sage" | "coral";
  subExplain?: () => void;
  href?: string | null;
}) {
  const color =
    accent === "gold"
      ? "text-gold"
      : accent === "sage"
        ? "text-sage"
        : accent === "coral"
          ? "text-coral"
          : "text-white";
  const subColor =
    accent === "sage"
      ? "text-sage"
      : accent === "coral"
        ? "text-coral"
        : "text-white/55";
  return (
    <div>
      <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-white/50 mb-1.5">
        {label}
      </p>
      {href ? (
        <Link
          href={href}
          className={`relative z-20 inline-block font-mono text-xl tabular-nums ${color} hover:text-gold transition-colors`}
        >
          {value}
        </Link>
      ) : (
        <p className={`font-mono text-xl tabular-nums ${color}`}>{value}</p>
      )}
      {sub && (
        subExplain ? (
          <button
            type="button"
            onClick={subExplain}
            className={`relative z-20 font-mono text-[11px] mt-0.5 tabular-nums underline underline-offset-2 decoration-white/25 hover:decoration-gold transition-colors cursor-pointer ${subColor}`}
          >
            {sub}
          </button>
        ) : (
        <p className={`font-mono text-[11px] mt-0.5 tabular-nums ${subColor}`}>
          {sub}
        </p>
        )
      )}
    </div>
  );
}

function Factor({
  label,
  value,
  weight,
  showWeight = false,
  factorKey,
  onExplain,
}: {
  label: string;
  value: number;
  weight?: number;
  showWeight?: boolean;
  factorKey: ScoreExplainTopic;
  onExplain?: (topic: ScoreExplainTopic) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between font-mono text-[10px] tracking-[0.1em] uppercase text-white/55 mb-1">
        <span>
          {label}
          {showWeight && weight != null ? (
            <span className="ml-1.5 text-white/35 normal-case tracking-normal">
              ({formatScoreWeightPct(weight)})
            </span>
          ) : null}
        </span>
        <span>
          {Math.round(value)}
          {onExplain ? (
            <button
              type="button"
              onClick={() => onExplain(factorKey)}
              className="relative z-20 text-white/35 hover:text-gold transition-colors underline underline-offset-2 decoration-white/20 cursor-pointer"
              aria-label={`Explain ${label}`}
            >
              {" →"}
            </button>
          ) : null}
        </span>
      </div>
      <div className="h-1 rounded-full bg-white/10 overflow-hidden">
        <div className="h-full bg-white/35" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}
