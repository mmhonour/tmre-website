"use client";

import { useEffect, useState } from "react";
import { loadTabJson } from "@/lib/tab-data-prefetch";

/** MLS Media captions in gallery order — same payload photo focus uses. */
export function listingPhotoCaptionsUrl(mlsId: string): string {
  return `/api/listings/${encodeURIComponent(mlsId.trim())}/photo-captions`;
}

export function useListingPhotoCaptions(mlsId: string | null | undefined) {
  const [captions, setCaptions] = useState<readonly (string | null)[] | null>(
    null,
  );

  useEffect(() => {
    const id = mlsId?.trim();
    if (!id) return;
    let cancelled = false;
    void loadTabJson<{ captions?: (string | null)[] }>(
      listingPhotoCaptionsUrl(id),
    )
      .then((data) => {
        if (!cancelled) setCaptions(data?.captions ?? []);
      })
      .catch(() => {
        if (!cancelled) setCaptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [mlsId]);

  return captions;
}
