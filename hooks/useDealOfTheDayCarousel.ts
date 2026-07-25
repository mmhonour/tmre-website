"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

/** null = no book-flip (filter/town pill / first paint). */
export type SlideDirection = "next" | "prev" | null;

type DealsByTown = Partial<Record<TmreTown, DealCarouselPayload | null>>;

function hasListing(deal: DealCarouselPayload | null | undefined): deal is DealCarouselPayload {
  return Boolean(deal?.listing?.mlsId || deal?.listing?.listingKey);
}

function filterCacheKey(
  kind: "sale" | "rental",
  propertyClass: DealPropertyClassFilter,
): string {
  return `${kind}:${propertyClass}`;
}

export type DealTransactionFilter = "all" | "sale" | "rental";
export type DealPropertyClassFilter = "homes" | "multi" | "condos";

const ALL_FILTER_COMBOS: ReadonlyArray<{
  kind: "sale" | "rental";
  property: DealPropertyClassFilter;
}> = [
  { kind: "sale", property: "homes" },
  { kind: "sale", property: "multi" },
  { kind: "sale", property: "condos" },
  { kind: "rental", property: "homes" },
  { kind: "rental", property: "multi" },
  { kind: "rental", property: "condos" },
];

async function fetchDealBundle(
  kind: "sale" | "rental",
  property: DealPropertyClassFilter,
  towns: readonly TmreTown[],
): Promise<DealsByTown> {
  const fromBundle: DealsByTown = {};
  try {
    const qs = new URLSearchParams({
      bundle: "1",
      kind,
      property,
    });
    const r = await fetch(`/api/deal-of-the-day?${qs.toString()}`);
    if (r.ok) {
      const body = (await r.json()) as {
        deals?: Partial<Record<TmreTown, DealCarouselPayload>>;
      };
      for (const town of towns) {
        const deal = body.deals?.[town];
        fromBundle[town] = deal && hasListing(deal) ? deal : null;
        if (fromBundle[town]) prefetchListingImages(fromBundle[town]!);
      }
    }
  } catch {
    // fall through — caller fills missing towns
  }
  return fromBundle;
}

async function fetchTownDeal(
  town: TmreTown,
  kind: "sale" | "rental",
  property: DealPropertyClassFilter,
  pinnedListingId?: string | null,
): Promise<DealCarouselPayload | null> {
  try {
    const qs = new URLSearchParams({
      city: town,
      kind,
      property,
    });
    if (pinnedListingId) qs.set("listing", pinnedListingId);
    const r = await fetch(`/api/deal-of-the-day?${qs.toString()}`);
    if (!r.ok) return null;
    const body = (await r.json()) as DealCarouselPayload;
    const deal = hasListing(body) ? body : null;
    if (deal) prefetchListingImages(deal);
    return deal;
  } catch {
    return null;
  }
}

export function useDealOfTheDayCarousel(options?: {
  /** Start the carousel on this town when available. */
  initialTown?: string | null;
  /** When false, only fetch/show `initialTown` (no rotation). */
  rotate?: boolean;
  /** When false, skip fetching (e.g. Deal of the Week page). */
  enabled?: boolean;
  /** Match Intelligence tx filter — sale/rental only, or all property types. */
  transactionFilter?: DealTransactionFilter;
  /** Single-family / multi / condo — defaults to homes. */
  propertyClass?: DealPropertyClassFilter;
  /** When set, fetch this exact listing instead of the town's auto-pick. */
  pinnedListingId?: string | null;
  /**
   * Server-seeded deals (FSSR) for the matching kind/propertyClass so the first
   * slide paints without waiting on the client `/api/deal-of-the-day` round-trip.
   */
  initialDealsByTown?: DealsByTown | null;
  /** Filter key that `initialDealsByTown` was built for (defaults to sale/homes). */
  initialKind?: "sale" | "rental";
  initialPropertyClass?: DealPropertyClassFilter;
}) {
  const rotate = options?.rotate !== false;
  const enabled = options?.enabled !== false;
  const orderedTowns = usePersonalizedTowns(TMRE_TOWNS);

  const seededDeals = useMemo((): DealsByTown | null => {
    const raw = options?.initialDealsByTown;
    if (!raw) return null;
    const next: DealsByTown = {};
    let any = false;
    for (const town of TMRE_TOWNS) {
      const deal = raw[town];
      if (hasListing(deal)) {
        next[town] = deal;
        any = true;
      }
    }
    return any ? next : null;
  }, [options?.initialDealsByTown]);

  const seedFilterKey = filterCacheKey(
    options?.initialKind === "rental" ? "rental" : "sale",
    options?.initialPropertyClass === "multi" ||
      options?.initialPropertyClass === "condos"
      ? options.initialPropertyClass
      : "homes",
  );

  const [dealsByTown, setDealsByTown] = useState<DealsByTown>(() => seededDeals ?? {});
  const [loading, setLoading] = useState(() => !seededDeals);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [slideDir, setSlideDir] = useState<SlideDirection>(null);
  /** Manual town pin from pill click — cleared when filters change or rotate stops. */
  const [selectedTown, setSelectedTown] = useState<TmreTown | null>(null);

  const filterCacheRef = useRef<Map<string, DealsByTown>>(
    (() => {
      const map = new Map<string, DealsByTown>();
      if (seededDeals) map.set(seedFilterKey, seededDeals);
      return map;
    })(),
  );
  const prefetchStartedRef = useRef(false);

  // Keep filter cache warm if a late seed arrives (shouldn't for FSSR, but safe).
  useEffect(() => {
    if (!seededDeals) return;
    if (!filterCacheRef.current.has(seedFilterKey)) {
      filterCacheRef.current.set(seedFilterKey, seededDeals);
    }
  }, [seededDeals, seedFilterKey]);

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
        : "sale";
  const propertyClassParam: DealPropertyClassFilter =
    options?.propertyClass === "multi" || options?.propertyClass === "condos"
      ? options.propertyClass
      : "homes";
  const pinnedListingId = options?.pinnedListingId?.trim() || null;
  const activeFilterKey = filterCacheKey(kindParam, propertyClassParam);

  // URL/city pin takes priority over in-page town pill selection.
  useEffect(() => {
    setSelectedTown(null);
    setSlideDir(null);
  }, [kindParam, propertyClassParam, pinnedListingId, options?.initialTown, rotate]);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    const pinnedTownForFetch =
      !rotate &&
      options?.initialTown &&
      options.initialTown !== "All"
        ? TMRE_TOWNS.find((t) => t.toLowerCase() === options.initialTown!.toLowerCase())
        : null;

    // Instant paint from FSSR seed / prior filter cache — still refresh below.
    if (!pinnedListingId && !pinnedTownForFetch) {
      const cached = filterCacheRef.current.get(activeFilterKey);
      if (cached && Object.values(cached).some(hasListing)) {
        setDealsByTown(cached);
        setLoading(false);
        setSlideDir(null);
      } else if (seededDeals && activeFilterKey === seedFilterKey) {
        filterCacheRef.current.set(activeFilterKey, seededDeals);
        setDealsByTown(seededDeals);
        setLoading(false);
        setSlideDir(null);
      } else {
        // Clear prior Homes/etc. deal so property pills don't look non-op while
        // the new 7×2×3 cache slice (or live fill) loads.
        setDealsByTown({});
        setLoading(true);
        setSlideDir(null);
      }
    } else {
      setDealsByTown((prev) => {
        if (pinnedTownForFetch) {
          const existing = prev[pinnedTownForFetch];
          return { [pinnedTownForFetch]: existing };
        }
        return {};
      });
      setLoading(true);
      setSlideDir(null);
    }

    if (townsToFetch.length === 0) {
      setLoading(false);
      return;
    }

    const useBundle =
      rotate &&
      townsToFetch.length > 1 &&
      !pinnedListingId &&
      !pinnedTownForFetch;

    void (async () => {
      let next: DealsByTown = {};

      if (useBundle) {
        next = await fetchDealBundle(kindParam, propertyClassParam, townsToFetch);
        if (cancelled) return;
        if (Object.values(next).some(hasListing)) {
          filterCacheRef.current.set(activeFilterKey, next);
          setDealsByTown(next);
          setLoading(false);
        }
        const missing = townsToFetch.filter((town) => !hasListing(next[town]));
        await Promise.all(
          missing.map(async (town) => {
            const deal = await fetchTownDeal(town, kindParam, propertyClassParam);
            if (cancelled) return;
            next = { ...next, [town]: deal };
            filterCacheRef.current.set(activeFilterKey, { ...next });
            setDealsByTown({ ...next });
            setLoading(false);
          }),
        );
        if (!cancelled && !Object.values(next).some(hasListing)) {
          setDealsByTown({});
          setLoading(false);
        }
      } else {
        const merged: DealsByTown = {};
        await Promise.all(
          townsToFetch.map(async (town) => {
            const deal = await fetchTownDeal(
              town,
              kindParam,
              propertyClassParam,
              pinnedListingId,
            );
            if (cancelled) return;
            merged[town] = deal;
            if (!pinnedListingId) {
              filterCacheRef.current.set(activeFilterKey, { ...merged });
            }
            setDealsByTown({ ...merged });
            setLoading(false);
          }),
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    townsToFetch,
    enabled,
    kindParam,
    propertyClassParam,
    pinnedListingId,
    rotate,
    options?.initialTown,
    activeFilterKey,
    seededDeals,
    seedFilterKey,
  ]);

  // Warm other filter bundles so pills swap instantly (no admin sync required for UX).
  useEffect(() => {
    if (!enabled || !rotate || pinnedListingId || prefetchStartedRef.current) return;
    if (!Object.values(dealsByTown).some(hasListing)) return;
    prefetchStartedRef.current = true;
    const towns = [...townsToFetch];
    void (async () => {
      for (const combo of ALL_FILTER_COMBOS) {
        const key = filterCacheKey(combo.kind, combo.property);
        if (filterCacheRef.current.has(key)) continue;
        const bundled = await fetchDealBundle(combo.kind, combo.property, towns);
        if (Object.values(bundled).some(hasListing)) {
          filterCacheRef.current.set(key, bundled);
        }
      }
    })();
  }, [enabled, rotate, pinnedListingId, dealsByTown, townsToFetch]);

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
    setSlideDir(null);
  }, [rotate, options?.initialTown, kindParam, propertyClassParam, pinnedListingId]);

  useEffect(() => {
    if (pinnedTown || selectedTown || carouselTowns.length === 0) return;
    const initial = options?.initialTown;
    if (!initial || initial === "All") return;
    const idx = carouselTowns.findIndex(
      (t) => t.toLowerCase() === initial.toLowerCase(),
    );
    if (idx >= 0) setIndex(idx);
  }, [pinnedTown, selectedTown, options?.initialTown, carouselTowns]);

  // Keep selectedTown index in sync once that town's deal arrives.
  useEffect(() => {
    if (!selectedTown || carouselTowns.length === 0) return;
    const idx = carouselTowns.findIndex((t) => t === selectedTown);
    if (idx >= 0) setIndex(idx);
  }, [selectedTown, carouselTowns]);

  const safeIndex =
    carouselTowns.length > 0 ? index % carouselTowns.length : 0;
  const currentTown =
    pinnedTown ?? selectedTown ?? carouselTowns[safeIndex] ?? null;
  const currentDeal = currentTown ? dealsByTown[currentTown] ?? null : null;

  useEffect(() => {
    if (!enabled || loading || carouselTowns.length === 0) return;
    prefetchDealCarouselImages(carouselTowns, dealsByTown, safeIndex);
  }, [enabled, loading, carouselTowns, dealsByTown, safeIndex]);

  const goNext = useCallback(() => {
    if (carouselTowns.length <= 1) return;
    setSelectedTown(null);
    setSlideDir("next");
    setIndex((i) => (i + 1) % carouselTowns.length);
  }, [carouselTowns.length]);

  const goPrev = useCallback(() => {
    if (carouselTowns.length <= 1) return;
    setSelectedTown(null);
    setSlideDir("prev");
    setIndex((i) => (i - 1 + carouselTowns.length) % carouselTowns.length);
  }, [carouselTowns.length]);

  const togglePause = useCallback(() => {
    setPaused((p) => !p);
  }, []);

  /** Instant town pick from the header list — no book-flip. */
  const selectTown = useCallback(
    (town: string) => {
      const match = TMRE_TOWNS.find((t) => t.toLowerCase() === town.trim().toLowerCase());
      if (!match) return;
      setSlideDir(null);
      setPaused(true);
      setSelectedTown(match);
      const idx = carouselTowns.findIndex((t) => t === match);
      if (idx >= 0) setIndex(idx);
    },
    [carouselTowns],
  );

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
    selectTown,
    slideDir,
    currentTown,
    currentDeal,
    carouselTowns,
    carouselIndex: safeIndex,
    canNavigate: rotate && carouselTowns.length > 1,
  };
}
