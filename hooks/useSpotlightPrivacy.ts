"use client";

import { useEffect, useState } from "react";
import type { SpotlightEffectivePrivacy } from "@/lib/spotlight-privacy-shared";
import {
  spotlightPropertySearchParam,
  type SpotlightPropertyTabId,
} from "@/lib/spotlight-listing";

const DEFAULT_PRIVACY: SpotlightEffectivePrivacy = {
  showAddress: false,
  showClearPhotos: false,
  showPropertyMap: false,
  clearComingSoon: false,
};

export function useSpotlightPrivacy(propertyTab: SpotlightPropertyTabId) {
  const [privacy, setPrivacy] = useState<SpotlightEffectivePrivacy>(DEFAULT_PRIVACY);

  useEffect(() => {
    const propertyParam = spotlightPropertySearchParam(propertyTab);
    const qs = propertyParam ? `?property=${propertyParam}` : "";
    let cancelled = false;

    fetch(`/api/spotlight/privacy${qs}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { privacy?: SpotlightEffectivePrivacy } | null) => {
        if (!cancelled && data?.privacy) setPrivacy(data.privacy);
      })
      .catch(() => {
        if (!cancelled) setPrivacy(DEFAULT_PRIVACY);
      });

    return () => {
      cancelled = true;
    };
  }, [propertyTab]);

  return privacy;
}
