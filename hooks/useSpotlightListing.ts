"use client";

import { useEffect, useMemo, useState } from "react";
import {
  buildSpotlightDisplay,
  type SpotlightMlsListing,
} from "@/lib/spotlight-display";
import type { ListingScoreApiFields } from "@/lib/listing-header-score-props";
import { SPOTLIGHT_LISTING } from "@/lib/spotlight-listing";

type LoadState = "ready" | "error";

type UseSpotlightListingOptions = {
  /** When true, loads and returns the full photo URL list (photos tab). */
  photos?: boolean;
};

export function useSpotlightListing(options: UseSpotlightListingOptions = {}) {
  const includePhotos = options.photos === true;
  const [mlsListing, setMlsListing] = useState<SpotlightMlsListing | null>(null);
  const [goldilocksScore, setGoldilocksScore] = useState<number | null>(null);
  const [goldilocksBreakdown, setGoldilocksBreakdown] =
    useState<ListingScoreApiFields["goldilocksBreakdown"]>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("ready");
  const [photosState, setPhotosState] = useState<
    "idle" | "loading" | "ready" | "error"
  >(includePhotos ? "loading" : "idle");

  useEffect(() => {
    const mlsId = SPOTLIGHT_LISTING.mlsId?.trim();
    if (!mlsId) {
      setMlsListing(null);
      setGoldilocksScore(null);
      setGoldilocksBreakdown(null);
      setPhotos([]);
      setLoadState("ready");
      setPhotosState("ready");
      return;
    }

    let cancelled = false;
    setLoadState("ready");
    if (includePhotos) setPhotosState("loading");

    fetch(`/api/spotlight?photos=${includePhotos ? "1" : "0"}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (
          d: {
            listing?: SpotlightMlsListing;
            photos?: string[];
            goldilocksScore?: number | null;
            goldilocksBreakdown?: ListingScoreApiFields["goldilocksBreakdown"];
          } | null,
        ) => {
          if (cancelled) return;
          setMlsListing(d?.listing ?? null);
          setGoldilocksScore(d?.goldilocksScore ?? null);
          setGoldilocksBreakdown(d?.goldilocksBreakdown ?? null);
          if (includePhotos) {
            setPhotos(d?.photos ?? []);
            setPhotosState("ready");
          }
        },
      )
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
  }, [includePhotos]);

  const display = useMemo(
    () => buildSpotlightDisplay(SPOTLIGHT_LISTING, mlsListing),
    [mlsListing],
  );

  return {
    display,
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
