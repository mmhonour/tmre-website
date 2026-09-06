"use client";

import { useCallback, useEffect, useState } from "react";
import { useSiteUnlocked } from "@/components/SiteUnlockProvider";
import {
  LOCATION_ESTIMATE_GRID_CHANGED_EVENT,
  type ZipGridCells,
} from "@/lib/location-estimate-zip-grid-shared";

export function useLocationEstimateZipGrid(): {
  cells: ZipGridCells;
  reload: () => void;
} {
  const unlocked = useSiteUnlocked();
  const [cells, setCells] = useState<ZipGridCells>({});

  const reload = useCallback(() => {
    if (!unlocked) {
      setCells({});
      return;
    }
    void fetch("/api/admin/location-estimate-zip-grid")
      .then((res) => (res.ok ? res.json() : { cells: {} }))
      .then((data: { cells?: ZipGridCells }) => {
        setCells(data.cells && typeof data.cells === "object" ? data.cells : {});
      })
      .catch(() => setCells({}));
  }, [unlocked]);

  useEffect(() => {
    reload();
    const onChange = () => reload();
    window.addEventListener(LOCATION_ESTIMATE_GRID_CHANGED_EVENT, onChange);
    return () => {
      window.removeEventListener(LOCATION_ESTIMATE_GRID_CHANGED_EVENT, onChange);
    };
  }, [reload]);

  return { cells, reload };
}
