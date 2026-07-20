"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  buildSpotlightDisplay,
  type SpotlightMlsListing,
} from "@/lib/spotlight-display";
import type { ListingScoreApiFields } from "@/lib/listing-header-score-props";
import { useSpotlightPrivacy } from "@/hooks/useSpotlightPrivacy";
import {
  spotlightEffectivePresentation,
} from "@/lib/spotlight-privacy-shared";
import {
  getSpotlightListingConfig,
  parseSpotlightPropertyTab,
  spotlightPropertySearchParam,
  type SpotlightPropertyTabId,
} from "@/lib/spotlight-listing";
import { loadTabJson, peekTabJson } from "@/lib/tab-data-prefetch";

type LoadState = "ready" | "error";

type UseSpotlightListingOptions = {
  /** When true, loads and returns the full photo URL list (photos tab). */
  photos?: boolean;
  /**
   * Force a Spotlight property tab (e.g. `/test` mockup locked to #1).
   * When set, ignores `?property=` on the URL.
   */
  propertyTabOverride?: SpotlightPropertyTabId;
};

type SpotlightFetchPayload = {
  listing?: SpotlightMlsListing;
  photos?: string[];
  goldilocksScore?: number | null;
  goldilocksBreakdown?: ListingScoreApiFields["goldilocksBreakdown"];
  insight?: string | null;
};

const spotlightFetchCache = new Map<string, SpotlightFetchPayload>();

function spotlightFetchKey(
  propertyTab: SpotlightPropertyTabId,
  includePhotos: boolean,
): string {
  return `${propertyTab}:${includePhotos ? "photos" : "overview"}`;
}

export function useSpotlightListing(options: UseSpotlightListingOptions = {}) {
  const includePhotos = options.photos === true;
  const searchParams = useSearchParams();
  const propertyTab: SpotlightPropertyTabId =
    options.propertyTabOverride ??
    parseSpotlightPropertyTab(searchParams.get("property"));
  const config = useMemo(
    () => getSpotlightListingConfig(propertyTab),
    [propertyTab],
  );
  const privacy = useSpotlightPrivacy(propertyTab);
  const [mlsListing, setMlsListing] = useState<SpotlightMlsListing | null>(null);
  const [goldilocksScore, setGoldilocksScore] = useState<number | null>(null);
  const [goldilocksBreakdown, setGoldilocksBreakdown] =
    useState<ListingScoreApiFields["goldilocksBreakdown"]>(null);
  const [insight, setInsight] = useState<string | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("ready");
  const [photosState, setPhotosState] = useState<
    "idle" | "loading" | "ready" | "error"
  >(includePhotos ? "loading" : "idle");
  const lastPropertyTabRef = useRef<SpotlightPropertyTabId | null>(null);

  useEffect(() => {
    let cancelled = false;
    const cacheKey = spotlightFetchKey(propertyTab, includePhotos);
    const cached = spotlightFetchCache.get(cacheKey);

    if (lastPropertyTabRef.current !== propertyTab) {
      setMlsListing(null);
      setGoldilocksScore(null);
      setGoldilocksBreakdown(null);
      setInsight(null);
      setPhotos([]);
      lastPropertyTabRef.current = propertyTab;
    } else if (cached?.listing) {
      setMlsListing(cached.listing);
      setGoldilocksScore(cached.goldilocksScore ?? null);
      setGoldilocksBreakdown(cached.goldilocksBreakdown ?? null);
      setInsight(cached.insight ?? null);
      if (includePhotos && cached.photos) {
        setPhotos(cached.photos);
        setPhotosState("ready");
      }
    }

    setLoadState("ready");
    if (includePhotos && !cached?.photos) setPhotosState("loading");

    const propertyParam = spotlightPropertySearchParam(propertyTab);
    const propertyQs = propertyParam ? `&property=${propertyParam}` : "";
    const spotlightUrl = `/api/spotlight?photos=${includePhotos ? "1" : "0"}${propertyQs}`;

    const peeked = peekTabJson<SpotlightFetchPayload>(spotlightUrl);
    if (peeked?.listing) {
      spotlightFetchCache.set(cacheKey, peeked);
      setMlsListing(peeked.listing);
      setGoldilocksScore(peeked.goldilocksScore ?? null);
      setGoldilocksBreakdown(peeked.goldilocksBreakdown ?? null);
      setInsight(peeked.insight ?? null);
      if (includePhotos && peeked.photos) {
        setPhotos(peeked.photos);
        setPhotosState("ready");
      }
    }

    void loadTabJson<SpotlightFetchPayload>(spotlightUrl)
      .then((d) => {
        if (cancelled) return;
        if (!d) {
          if (includePhotos) setPhotosState("error");
          return;
        }
        spotlightFetchCache.set(cacheKey, d);
        setMlsListing(d.listing ?? null);
        setGoldilocksScore(d.goldilocksScore ?? null);
        setGoldilocksBreakdown(d.goldilocksBreakdown ?? null);
        setInsight(d.insight ?? null);
        if (includePhotos) {
          setPhotos(d.photos ?? []);
          setPhotosState("ready");
        }
      })
      .catch(() => {
        if (cancelled) return;
        if (includePhotos) {
          setPhotos([]);
          setPhotosState("error");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [includePhotos, propertyTab]);

  const display = useMemo(
    () => buildSpotlightDisplay(config, mlsListing),
    [config, mlsListing],
  );

  const presentation = useMemo(
    () =>
      spotlightEffectivePresentation(
        config,
        mlsListing,
        privacy,
        display.photoCount,
      ),
    [config, mlsListing, privacy, display.photoCount],
  );

  return {
    display,
    config,
    propertyTab,
    loadState,
    mlsListing,
    goldilocksScore,
    goldilocksBreakdown,
    insight,
    photos,
    photosState,
    privacy,
    presentation,
    /** Static config is always available; MLS fields may still be enriching. */
    isEnriched: mlsListing != null,
  };
}
