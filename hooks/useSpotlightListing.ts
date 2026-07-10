"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  buildSpotlightDisplay,
  type SpotlightMlsListing,
} from "@/lib/spotlight-display";
import type { ListingScoreApiFields } from "@/lib/listing-header-score-props";
import {
  getSpotlightListingConfig,
  parseSpotlightPropertyTab,
  type SpotlightPropertyTabId,
} from "@/lib/spotlight-listing";

type LoadState = "ready" | "error";

type UseSpotlightListingOptions = {
  /** When true, loads and returns the full photo URL list (photos tab). */
  photos?: boolean;
};

type SpotlightFetchPayload = {
  listing?: SpotlightMlsListing;
  photos?: string[];
  goldilocksScore?: number | null;
  goldilocksBreakdown?: ListingScoreApiFields["goldilocksBreakdown"];
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
  const propertyTab: SpotlightPropertyTabId = parseSpotlightPropertyTab(
    searchParams.get("property"),
  );
  const config = useMemo(
    () => getSpotlightListingConfig(propertyTab),
    [propertyTab],
  );
  const [mlsListing, setMlsListing] = useState<SpotlightMlsListing | null>(null);
  const [goldilocksScore, setGoldilocksScore] = useState<number | null>(null);
  const [goldilocksBreakdown, setGoldilocksBreakdown] =
    useState<ListingScoreApiFields["goldilocksBreakdown"]>(null);
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
      setPhotos([]);
      lastPropertyTabRef.current = propertyTab;
    } else if (cached?.listing) {
      setMlsListing(cached.listing);
      setGoldilocksScore(cached.goldilocksScore ?? null);
      setGoldilocksBreakdown(cached.goldilocksBreakdown ?? null);
      if (includePhotos && cached.photos) {
        setPhotos(cached.photos);
        setPhotosState("ready");
      }
    }

    setLoadState("ready");
    if (includePhotos && !cached?.photos) setPhotosState("loading");

    const propertyQs = propertyTab === 2 ? "&property=2" : "";
    fetch(`/api/spotlight?photos=${includePhotos ? "1" : "0"}${propertyQs}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: SpotlightFetchPayload | null) => {
        if (cancelled) return;
        if (d) spotlightFetchCache.set(cacheKey, d);
        setMlsListing(d?.listing ?? null);
        setGoldilocksScore(d?.goldilocksScore ?? null);
        setGoldilocksBreakdown(d?.goldilocksBreakdown ?? null);
        if (includePhotos) {
          setPhotos(d?.photos ?? []);
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

  return {
    display,
    config,
    propertyTab,
    loadState,
    mlsListing,
    goldilocksScore,
    goldilocksBreakdown,
    photos,
    photosState,
    /** Static config is always available; MLS fields may still be enriching. */
    isEnriched: mlsListing != null,
  };
}
