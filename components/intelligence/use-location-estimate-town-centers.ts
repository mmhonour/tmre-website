"use client";

import { useCallback, useEffect, useState } from "react";
import { useSiteUnlocked } from "@/components/SiteUnlockProvider";
import {
  LOCATION_ESTIMATE_TOWN_CENTERS_CHANGED_EVENT,
  type TownCenterPlacement,
  type TownCenterPlacements,
} from "@/lib/location-estimate-town-centers-shared";
import type { TmreTown } from "@/lib/tmre-towns";

export function useLocationEstimateTownCenters(): {
  placements: TownCenterPlacements;
  saving: boolean;
  save: (town: TmreTown, placement: TownCenterPlacement) => void;
  reset: (town: TmreTown) => void;
} {
  const unlocked = useSiteUnlocked();
  const [placements, setPlacements] = useState<TownCenterPlacements>({});
  const [saving, setSaving] = useState(false);

  const reload = useCallback(() => {
    if (!unlocked) {
      setPlacements({});
      return;
    }
    void fetch("/api/admin/location-estimate-town-centers")
      .then((res) => (res.ok ? res.json() : { placements: {} }))
      .then((data: { placements?: TownCenterPlacements }) => {
        setPlacements(
          data.placements && typeof data.placements === "object"
            ? data.placements
            : {},
        );
      })
      .catch(() => setPlacements({}));
  }, [unlocked]);

  useEffect(() => {
    reload();
    const onChange = () => reload();
    window.addEventListener(
      LOCATION_ESTIMATE_TOWN_CENTERS_CHANGED_EVENT,
      onChange,
    );
    return () => {
      window.removeEventListener(
        LOCATION_ESTIMATE_TOWN_CENTERS_CHANGED_EVENT,
        onChange,
      );
    };
  }, [reload]);

  const persist = useCallback(
    (town: TmreTown, body: Record<string, unknown>) => {
      setSaving(true);
      void fetch("/api/admin/location-estimate-town-centers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ town, ...body }),
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data: { placements?: TownCenterPlacements } | null) => {
          if (data?.placements) setPlacements(data.placements);
          window.dispatchEvent(
            new Event(LOCATION_ESTIMATE_TOWN_CENTERS_CHANGED_EVENT),
          );
        })
        .finally(() => setSaving(false));
    },
    [],
  );

  const save = useCallback(
    (town: TmreTown, placement: TownCenterPlacement) => {
      setPlacements((cur) => ({ ...cur, [town]: placement }));
      persist(town, placement);
    },
    [persist],
  );

  const reset = useCallback(
    (town: TmreTown) => {
      setPlacements((cur) => {
        const next = { ...cur };
        delete next[town];
        return next;
      });
      persist(town, { reset: true });
    },
    [persist],
  );

  return { placements, saving, save, reset };
}
