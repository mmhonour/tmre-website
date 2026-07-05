"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { TMRE_TOWNS, type TmreTown } from "@/lib/tmre-towns";
import { usePersonalizedTowns } from "@/hooks/usePersonalizedTowns";
import { prefetchDealCarouselImages, prefetchListingImages } from "@/lib/prefetch-listing-images";

export const DEAL_CAROUSEL_MS = 15_000;

export type DealCarouselListing = {
  mlsId: string;
  listingKey?: string;
  propertyType?: string;
  style?: string;
  address: { street: string; city: string; state?: string; full: string };
  price: number | null;
  originalListPrice?: number | null;
  beds: number | null;
  baths: number | null;
  sqft?: number | null;
  yearBuilt?: number | null;
  dom: number | null;
  listDate?: string | null;
  photoCount?: number | null;
  schools?: {
    elementary: string | null;
    middle: string | null;
    high: string | null;
    district: string | null;
  };
};

export type DealCarouselScore = {
  age: number;
  condition: number;
  finishesQuality: number;
  pricePerSqftFit: number;
  layoutQuality: number;
  schoolRating: number;
  composite: number;
  weights: {
    age: number;
    condition: number;
    finishes: number;
    ppsf: number;
    layout: number;
    schools: number;
  };
};

export type DealCarouselPayload = {
  score: DealCarouselScore;
  photoUrl: string | null;
  listing: DealCarouselListing;
  insight?: string;
  totalReviewed?: number;
  qualifiedCount?: number;
  kind?: "sale" | "rental";
  pricePerSqft?: number | null;
  cityMedianPricePerSqft?: number | null;
  cityMedianPrice?: number | null;
  valueDiscountPct?: number | null;
  lotAcres?: number | null;
  superlatives?: string[];
};

type SlideDirection = "next" | "prev";

function hasListing(deal: DealCarouselPayload | null | undefined): deal is DealCarouselPayload {
  return Boolean(deal?.listing?.mlsId || deal?.listing?.listingKey);
}

export type DealTransactionFilter = "all" | "sale" | "rental";

export function useDealOfTheDayCarousel(options?: {
  /** Start the carousel on this town when available. */
  initialTown?: string | null;
  /** When false, only fetch/show `initialTown` (no rotation). */
  rotate?: boolean;
  /** When false, skip fetching (e.g. Deal of the Week page). */
  enabled?: boolean;
  /** Match Intelligence tx filter — sale/rental only, or all property types. */
  transactionFilter?: DealTransactionFilter;
  /** When set, fetch this exact listing instead of the town's auto-pick. */
  pinnedListingId?: string | null;
}) {
  const rotate = options?.rotate !== false;
  const enabled = options?.enabled !== false;
  const orderedTowns = usePersonalizedTowns(TMRE_TOWNS);
  const [dealsByTown, setDealsByTown] = useState<
    Partial<Record<TmreTown, DealCarouselPayload | null>>
  >({});
  const [loading, setLoading] = useState(true);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [slideDir, setSlideDir] = useState<SlideDirection>("next");

  const townsToFetch = useMemo(() => {
    if (!rotate && options?.initialTown && options.initialTown !== "All") {
      const match = TMRE_TOWNS.find(
        (t) => t.toLowerCase() === options.initialTown!.toLowerCase(),
      );
      return match ? [match] : [...orderedTowns];
    }
    return [...orderedTowns];
  }, [rotate, options?.initialTown, orderedTowns]);

  const kindParam =
    options?.transactionFilter === "sale"
      ? "sale"
      : options?.transactionFilter === "rental"
        ? "rental"
        : null;
  const pinnedListingId = options?.pinnedListingId?.trim() || null;

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);

    Promise.all(
      townsToFetch.map(async (town) => {
        try {
          const qs = new URLSearchParams({ city: town });
          if (kindParam) qs.set("kind", kindParam);
          if (pinnedListingId) qs.set("listing", pinnedListingId);
          const r = await fetch(`/api/deal-of-the-day?${qs.toString()}`);
          if (!r.ok) return { town, deal: null as DealCarouselPayload | null };
          const deal = (await r.json()) as DealCarouselPayload;
          const picked = hasListing(deal) ? deal : null;
          if (picked) prefetchListingImages(picked);
          return { town, deal: picked };
        } catch {
          return { town, deal: null as DealCarouselPayload | null };
        }
      }),
    ).then((rows) => {
      if (cancelled) return;
      const next: Partial<Record<TmreTown, DealCarouselPayload | null>> = {};
      for (const { town, deal } of rows) next[town] = deal;
      setDealsByTown(next);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [townsToFetch, enabled, kindParam, pinnedListingId]);

  const carouselTowns = useMemo(
    () => townsToFetch.filter((town) => hasListing(dealsByTown[town])),
    [townsToFetch, dealsByTown],
  );

  const pinnedTown = useMemo((): TmreTown | null => {
    if (rotate || !options?.initialTown || options.initialTown === "All") return null;
    return (
      TMRE_TOWNS.find((t) => t.toLowerCase() === options.initialTown!.toLowerCase()) ??
      null
    );
  }, [rotate, options?.initialTown]);

  useEffect(() => {
    setIndex(0);
  }, [rotate, options?.initialTown, kindParam, pinnedListingId]);

  useEffect(() => {
    if (pinnedTown || carouselTowns.length === 0) return;
    const initial = options?.initialTown;
    if (!initial || initial === "All") return;
    const idx = carouselTowns.findIndex(
      (t) => t.toLowerCase() === initial.toLowerCase(),
    );
    if (idx >= 0) setIndex(idx);
  }, [pinnedTown, options?.initialTown, carouselTowns]);

  const safeIndex =
    carouselTowns.length > 0 ? index % carouselTowns.length : 0;
  const currentTown = pinnedTown ?? carouselTowns[safeIndex] ?? null;
  const currentDeal = currentTown ? dealsByTown[currentTown] ?? null : null;

  useEffect(() => {
    if (!enabled || loading || carouselTowns.length === 0) return;
    prefetchDealCarouselImages(carouselTowns, dealsByTown, safeIndex);
  }, [enabled, loading, carouselTowns, dealsByTown, safeIndex]);

  const goNext = useCallback(() => {
    if (carouselTowns.length <= 1) return;
    setSlideDir("next");
    setIndex((i) => (i + 1) % carouselTowns.length);
  }, [carouselTowns.length]);

  const goPrev = useCallback(() => {
    if (carouselTowns.length <= 1) return;
    setSlideDir("prev");
    setIndex((i) => (i - 1 + carouselTowns.length) % carouselTowns.length);
  }, [carouselTowns.length]);

  const togglePause = useCallback(() => {
    setPaused((p) => !p);
  }, []);

  useEffect(() => {
    if (!rotate || paused || carouselTowns.length <= 1) return;
    const id = window.setInterval(goNext, DEAL_CAROUSEL_MS);
    return () => window.clearInterval(id);
  }, [rotate, paused, carouselTowns.length, goNext, safeIndex]);

  return {
    loading,
    paused,
    togglePause,
    goNext,
    goPrev,
    slideDir,
    currentTown,
    currentDeal,
    carouselTowns,
    carouselIndex: safeIndex,
    canNavigate: rotate && carouselTowns.length > 1,
  };
}
