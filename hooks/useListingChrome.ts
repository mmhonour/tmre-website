"use client";

import { useEffect, useState } from "react";
import type { ListingScoreApiFields } from "@/lib/listing-header-score-props";
import {
  listingChromeApiUrl,
  loadTabJson,
  peekTabJson,
} from "@/lib/tab-data-prefetch";

export type ListingChromePayload<TListing> = ListingScoreApiFields & {
  listing: TListing;
};

type LoadState = "loading" | "ready" | "error" | "not-found";

/**
 * Loads listing chrome (hero/sidebar fields) from the session prefetch cache
 * when available, so tab navigations skip a cold network round-trip.
 */
export function useListingChrome<TListing>(mlsId: string) {
  type Payload = ListingChromePayload<TListing>;
  const url = listingChromeApiUrl(mlsId);
  const initial = peekTabJson<Payload>(url);

  const [listing, setListing] = useState<TListing | null>(
    () => initial?.listing ?? null,
  );
  const [goldilocksScore, setGoldilocksScore] = useState<number | null>(
    () => initial?.goldilocksScore ?? null,
  );
  const [edgeScore, setEdgeScore] = useState<number | null>(
    () => initial?.edgeScore ?? null,
  );
  const [goldilocksBreakdown, setGoldilocksBreakdown] = useState<
    ListingScoreApiFields["goldilocksBreakdown"]
  >(() => initial?.goldilocksBreakdown ?? null);
  const [insight, setInsight] = useState<string | null>(
    () => initial?.insight ?? null,
  );
  const [state, setState] = useState<LoadState>(() =>
    initial?.listing ? "ready" : "loading",
  );

  useEffect(() => {
    let cancelled = false;
    const requestUrl = listingChromeApiUrl(mlsId);
    const cached = peekTabJson<Payload>(requestUrl);

    if (cached?.listing) {
      setListing(cached.listing);
      setGoldilocksScore(cached.goldilocksScore ?? null);
      setEdgeScore(cached.edgeScore ?? null);
      setGoldilocksBreakdown(cached.goldilocksBreakdown ?? null);
      setInsight(cached.insight ?? null);
      setState("ready");
    } else {
      setListing(null);
      setGoldilocksScore(null);
      setEdgeScore(null);
      setGoldilocksBreakdown(null);
      setInsight(null);
      setState("loading");
    }

    void loadTabJson<Payload>(requestUrl)
      .then((d) => {
        if (cancelled) return;
        if (!d?.listing) {
          // Prefetch cache collapses HTTP failures to null — treat as error
          // (true 404s are rare once the user is already on a listing surface).
          setState("error");
          return;
        }
        setListing(d.listing);
        setGoldilocksScore(d.goldilocksScore ?? null);
        setEdgeScore(d.edgeScore ?? null);
        setGoldilocksBreakdown(d.goldilocksBreakdown ?? null);
        setInsight(d.insight ?? null);
        setState("ready");
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });

    return () => {
      cancelled = true;
    };
  }, [mlsId]);

  return {
    listing,
    goldilocksScore,
    edgeScore,
    goldilocksBreakdown,
    insight,
    state,
  };
}
