"use client";

import { useEffect, useState } from "react";
import {
  fetchVisitorLocation,
  refreshVisitorLocation,
  VISITOR_LOCATION_CHANGED_EVENT,
} from "@/lib/visitor-location";

/**
 * Returns the town list reordered so that the visitor's nearest town
 * is in position 0. Falls back to the original order silently.
 */
export function usePersonalizedTowns<T extends string>(towns: readonly T[]): T[] {
  const [ordered, setOrdered] = useState<T[]>([...towns]);

  useEffect(() => {
    const apply = (town: string | null) => {
      if (!town) {
        setOrdered([...towns]);
        return;
      }
      const idx = towns.findIndex((t) => t.toLowerCase() === town.toLowerCase());
      if (idx <= 0) {
        setOrdered([...towns]);
        return;
      }
      const next = [...towns] as T[];
      next.splice(idx, 1);
      next.unshift(towns[idx]);
      setOrdered(next);
    };

    void fetchVisitorLocation().then((loc) => apply(loc.town));
    const onChange = () => {
      void refreshVisitorLocation().then((loc) => apply(loc.town));
    };
    window.addEventListener(VISITOR_LOCATION_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(VISITOR_LOCATION_CHANGED_EVENT, onChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return ordered;
}
