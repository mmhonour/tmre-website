"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TMRE_TOWNS, type TmreTown } from "@/lib/tmre-towns";
import { usePersonalizedTowns } from "@/hooks/usePersonalizedTowns";
import { prefetchDealCarouselImages, prefetchListingImages } from "@/lib/prefetch-listing-images";
import { listingMatchesPropertyClass } from "@/lib/listing-property-class";
import type {
  DealCarouselDealsByTown,
  DealCarouselPayload,
  DealPropertyClassFilter,
  DealTransactionFilter,
} from "@/lib/deal-of-the-day-carousel-types";

export const DEAL_CAROUSEL_MS = 15_000;

export type {
  DealCarouselListing,
  DealCarouselScore,
  DealCarouselPayload,
  DealCarouselDealsByTown,
  DealPropertyClassFilter,
  DealTransactionFilter,
} from "@/lib/deal-of-the-day-carousel-types";

/** null = no book-flip (filter/town pill / first paint). */
export type SlideDirection = "next" | "prev" | null;

type DealsByTown = DealCarouselDealsByTown;

function hasListing(deal: DealCarouselPayload | null | undefined): deal is DealCarouselPayload {
  return Boolean(deal?.listing?.mlsId || deal?.listing?.listingKey);
}

function filterCacheKey(
  kind: "sale" | "rental",
  propertyClass: DealPropertyClassFilter,
): string {
  return `${kind}:${propertyClass}`;
}

function dealLooksLikeRental(deal: DealCarouselPayload): boolean {
  if (deal.kind === "rental") return true;
  if (deal.kind === "sale") return false;
  const hay = `${deal.listing.propertyType ?? ""} ${deal.listing.style ?? ""}`;
  return /rental|lease|for rent/i.test(hay);
}

function dealMatchesFilter(
  deal: DealCarouselPayload | null | undefined,
  kind: "sale" | "rental",
  propertyClass: DealPropertyClassFilter,
): deal is DealCarouselPayload {
  if (!hasListing(deal)) return false;
  if (kind === "rental" ? !dealLooksLikeRental(deal) : dealLooksLikeRental(deal)) {
    return false;
  }
  if (propertyClass !== "all" && deal.listing) {
    return listingMatchesPropertyClass(deal.listing, propertyClass);
  }
  return true;
}

function filterDealsByTown(
  deals: DealsByTown,
  kind: "sale" | "rental",
  propertyClass: DealPropertyClassFilter,
): DealsByTown {
  const next: DealsByTown = {};
  for (const town of TMRE_TOWNS) {
    const deal = deals[town];
    next[town] = dealMatchesFilter(deal, kind, propertyClass) ? deal : null;
  }
  return next;
}

const ALL_FILTER_COMBOS: ReadonlyArray<{
  kind: "sale" | "rental";
  property: DealPropertyClassFilter;
}> = [
  { kind: "sale", property: "homes" },
  { kind: "sale", property: "multi" },
  { kind: "sale", property: "condos" },
  { kind: "rental", property: "all" },
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
        fromBundle[town] = dealMatchesFilter(deal, kind, property) ? deal : null;
        if (fromBundle[town]) prefetchListingImages(fromBundle[town]!);
      }
    }
  } catch {
    // fall through — caller fills missing towns
  }
  return fromBundle;
}

async function fetchTownDealOnce(
  town: TmreTown,
  kind: "sale" | "rental",
  property: DealPropertyClassFilter,
  pinnedListingId?: string | null,
): Promise<DealCarouselPayload | null> {
  try {
    const qs = new URLSearchParams({
      city: town,
      kind,
      // Pinned deep links ignore subtype on the server; send "all" so a stale
      // Multi/Condos cookie cannot 404 a homes listing Intelligence just showed.
      property: pinnedListingId ? "all" : property,
    });
    if (pinnedListingId) qs.set("listing", pinnedListingId);
    const r = await fetch(`/api/deal-of-the-day?${qs.toString()}`);
    if (!r.ok) return null;
    const body = (await r.json()) as DealCarouselPayload;
    // Pinned deep links must show the listing even if subtype pills disagree.
    const matchProperty: DealPropertyClassFilter = pinnedListingId
      ? "all"
      : property;
    const deal = dealMatchesFilter(body, kind, matchProperty) ? body : null;
    if (deal) prefetchListingImages(deal);
    return deal;
  } catch {
    return null;
  }
}

async function fetchTownDeal(
  town: TmreTown,
  kind: "sale" | "rental",
  property: DealPropertyClassFilter,
  pinnedListingId?: string | null,
): Promise<DealCarouselPayload | null> {
  if (pinnedListingId) {
    const pinned = await fetchTownDealOnce(
      town,
      kind,
      property,
      pinnedListingId,
    );
    if (pinned) return pinned;
    // Pin miss (peer cap / stale id) — fall back to the town's auto pick so the
    // DOTD page isn't empty when Intelligence just showed a card for this town.
    const auto = await fetchTownDealOnce(town, kind, property, null);
    if (auto) return auto;
    if (kind === "sale" && property !== "homes") {
      return fetchTownDealOnce(town, kind, "homes", null);
    }
    return null;
  }
  return fetchTownDealOnce(town, kind, property, null);
}

/**
 * Prefer the requested kind/class, then broaden so Intelligence always has
 * something to show (sale ↔ rental, homes if multi/condos empty).
 */
async function fetchTownDealSurfaced(
  town: TmreTown,
  kind: "sale" | "rental",
  property: DealPropertyClassFilter,
  pinnedListingId?: string | null,
): Promise<DealCarouselPayload | null> {
  const primary = await fetchTownDeal(town, kind, property, pinnedListingId);
  if (primary) return primary;
  if (pinnedListingId) return null;

  if (kind === "sale" && property !== "homes") {
    const homes = await fetchTownDealOnce(town, "sale", "homes", null);
    if (homes) return homes;
  }
  if (kind === "sale" && property !== "all") {
    const anySale = await fetchTownDealOnce(town, "sale", "all", null);
    if (anySale) return anySale;
  }

  const otherKind: "sale" | "rental" = kind === "rental" ? "sale" : "rental";
  const otherProperty: DealPropertyClassFilter =
    otherKind === "rental" ? "all" : "homes";
  return fetchTownDealOnce(town, otherKind, otherProperty, null);
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
  /** Single-family / multi / condo / all — defaults to homes. */
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
  /**
   * When the requested sale/rental (or subtype) has no pick, fall back across
   * kind/class so the UI can always surface one Deal of the Day card.
   * Used on Intelligence — never leave an empty “no pick in Town” slot.
   */
  surfaceAnyPick?: boolean;
}) {
  const rotate = options?.rotate !== false;
  const enabled = options?.enabled !== false;
  const surfaceAnyPick = options?.surfaceAnyPick === true;
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
      options?.initialPropertyClass === "condos" ||
      options?.initialPropertyClass === "all"
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
  const fetchGenRef = useRef(0);

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
  // Rentals hide subtype pills — always fetch across property types.
  const propertyClassParam: DealPropertyClassFilter =
    kindParam === "rental"
      ? "all"
      : options?.propertyClass === "multi" || options?.propertyClass === "condos"
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
    const gen = ++fetchGenRef.current;
    let cancelled = false;
    const stillActive = () => !cancelled && fetchGenRef.current === gen;

    const pinnedTownForFetch =
      !rotate &&
      options?.initialTown &&
      options.initialTown !== "All"
        ? TMRE_TOWNS.find((t) => t.toLowerCase() === options.initialTown!.toLowerCase())
        : null;

    // Instant paint from FSSR seed / prior filter cache — still refresh below.
    // Never keep a prior filter's deals on screen (that made Rentals/Condos look stuck).
    if (!pinnedListingId && !pinnedTownForFetch) {
      const cached = filterCacheRef.current.get(activeFilterKey);
      const matchedCache =
        cached && Object.values(cached).some((d) => dealMatchesFilter(d, kindParam, propertyClassParam))
          ? filterDealsByTown(cached, kindParam, propertyClassParam)
          : null;
      if (matchedCache && Object.values(matchedCache).some(hasListing)) {
        setDealsByTown(matchedCache);
        setLoading(false);
        setSlideDir(null);
      } else if (seededDeals && activeFilterKey === seedFilterKey) {
        const matchedSeed = filterDealsByTown(seededDeals, kindParam, propertyClassParam);
        filterCacheRef.current.set(activeFilterKey, matchedSeed);
        setDealsByTown(matchedSeed);
        setLoading(false);
        setSlideDir(null);
      } else {
        setDealsByTown({});
        setLoading(true);
        setSlideDir(null);
      }
    } else {
      // City/listing pin: clear other towns and drop a mismatched prior deal.
      // Pinned listing deep links keep any subtype — cookie Multi/Condos must
      // not wipe an FSSR homes seed before the pin fetch lands.
      const keepProperty: DealPropertyClassFilter = pinnedListingId
        ? "all"
        : propertyClassParam;
      setDealsByTown((prev) => {
        if (pinnedTownForFetch) {
          const existing = prev[pinnedTownForFetch];
          if (dealMatchesFilter(existing, kindParam, keepProperty)) {
            return { [pinnedTownForFetch]: existing };
          }
          return {};
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
        if (!stillActive()) return;
        if (Object.values(next).some(hasListing)) {
          filterCacheRef.current.set(activeFilterKey, next);
          setDealsByTown(next);
          setLoading(false);
        }
        const missing = townsToFetch.filter((town) => !hasListing(next[town]));
        await Promise.all(
          missing.map(async (town) => {
            const deal = surfaceAnyPick
              ? await fetchTownDealSurfaced(town, kindParam, propertyClassParam)
              : await fetchTownDeal(town, kindParam, propertyClassParam);
            if (!stillActive()) return;
            next = { ...next, [town]: deal };
            filterCacheRef.current.set(activeFilterKey, { ...next });
            setDealsByTown({ ...next });
            setLoading(false);
          }),
        );
        if (stillActive() && !Object.values(next).some(hasListing)) {
          setDealsByTown({});
          setLoading(false);
        }
      } else {
        const fetched: DealsByTown = {};
        await Promise.all(
          townsToFetch.map(async (town) => {
            fetched[town] = surfaceAnyPick
              ? await fetchTownDealSurfaced(
                  town,
                  kindParam,
                  propertyClassParam,
                  pinnedListingId,
                )
              : await fetchTownDeal(
                  town,
                  kindParam,
                  propertyClassParam,
                  pinnedListingId,
                );
          }),
        );
        if (!stillActive()) return;

        setDealsByTown((prev) => {
          const next: DealsByTown = {};
          let any = false;
          const keepProperty: DealPropertyClassFilter = pinnedListingId
            ? "all"
            : propertyClassParam;
          for (const town of townsToFetch) {
            const row = fetched[town];
            if (hasListing(row)) {
              next[town] = row;
              any = true;
              continue;
            }
            // Keep seed/cache when refresh miss — don't paint empty over a good card.
            const keep = prev[town];
            if (
              dealMatchesFilter(keep, kindParam, keepProperty) ||
              (surfaceAnyPick && hasListing(keep))
            ) {
              next[town] = keep;
              any = true;
            } else {
              next[town] = null;
            }
          }
          if (!pinnedListingId && any) {
            filterCacheRef.current.set(activeFilterKey, { ...next });
          }
          return any ? next : {};
        });
        setLoading(false);
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
    surfaceAnyPick,
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

  const filteredDealsByTown = useMemo(() => {
    const strict = filterDealsByTown(
      dealsByTown,
      kindParam,
      propertyClassParam,
    );
    if (!surfaceAnyPick) return strict;
    // Prefer the matching filter; keep a cross-kind fallback so a town is never blank.
    const next: DealsByTown = {};
    for (const town of TMRE_TOWNS) {
      next[town] = strict[town] ?? (hasListing(dealsByTown[town]) ? dealsByTown[town]! : null);
    }
    return next;
  }, [dealsByTown, kindParam, propertyClassParam, surfaceAnyPick]);

  const carouselTowns = useMemo(
    () => townsToFetch.filter((town) => hasListing(filteredDealsByTown[town])),
    [townsToFetch, filteredDealsByTown],
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
  const currentDeal = currentTown ? filteredDealsByTown[currentTown] ?? null : null;

  // If state still holds a prior filter's deals, keep the loading chrome up
  // (don't paint a sale/homes listing under a Rentals or Condos selection) —
  // unless surfaceAnyPick intentionally keeps a cross-kind fallback visible.
  const hasMatchingDeal = Object.values(filteredDealsByTown).some(hasListing);
  const hasStaleDeal =
    !surfaceAnyPick &&
    Object.values(dealsByTown).some(hasListing) &&
    !hasMatchingDeal;
  const displayLoading = loading || hasStaleDeal;

  useEffect(() => {
    if (!enabled || displayLoading || carouselTowns.length === 0) return;
    prefetchDealCarouselImages(carouselTowns, filteredDealsByTown, safeIndex);
  }, [enabled, displayLoading, carouselTowns, filteredDealsByTown, safeIndex]);

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
    loading: displayLoading,
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
