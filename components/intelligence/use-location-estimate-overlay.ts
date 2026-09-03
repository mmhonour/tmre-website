"use client";

import { useCallback, useEffect, useState } from "react";
import { useSiteUnlocked } from "@/components/SiteUnlockProvider";
import { LOCATION_ESTIMATE_OVERLAY_CHANGED_EVENT } from "@/lib/location-estimate-map-overlay-shared";

/**
 * Admin-only location-estimate outlines. Public visitors never see them;
 * the flag lives in sync_meta so it survives redeploys.
 */
export function useLocationEstimateOverlay(): {
  unlocked: boolean;
  enabled: boolean;
  setEnabled: (next: boolean) => Promise<void>;
  busy: boolean;
} {
  const unlocked = useSiteUnlocked();
  const [enabled, setEnabledState] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!unlocked) {
      setEnabledState(false);
      return;
    }
    setEnabledState(true);
    let cancelled = false;
    const load = () => {
      void fetch("/api/admin/location-estimate-map-overlay")
        .then((res) => (res.ok ? res.json() : { enabled: true }))
        .then((data: { enabled?: unknown }) => {
          if (!cancelled) setEnabledState(data.enabled !== false);
        })
        .catch(() => {
          if (!cancelled) setEnabledState(true);
        });
    };
    load();
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<{ enabled?: boolean }>).detail;
      if (typeof detail?.enabled === "boolean") {
        setEnabledState(detail.enabled);
      } else {
        load();
      }
    };
    window.addEventListener(LOCATION_ESTIMATE_OVERLAY_CHANGED_EVENT, onChange);
    return () => {
      cancelled = true;
      window.removeEventListener(
        LOCATION_ESTIMATE_OVERLAY_CHANGED_EVENT,
        onChange,
      );
    };
  }, [unlocked]);

  const setEnabled = useCallback(async (next: boolean) => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/location-estimate-map-overlay", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      if (!res.ok) return;
      setEnabledState(next);
      window.dispatchEvent(
        new CustomEvent(LOCATION_ESTIMATE_OVERLAY_CHANGED_EVENT, {
          detail: { enabled: next },
        }),
      );
    } finally {
      setBusy(false);
    }
  }, []);

  return { unlocked, enabled: unlocked && enabled, setEnabled, busy };
}
