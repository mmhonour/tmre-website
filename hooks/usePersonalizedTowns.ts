"use client";

import { useEffect, useState } from "react";
import { fetchVisitorLocation } from "@/lib/visitor-location";

/**
 * Returns the town list reordered so that the visitor's nearest town
 * is in position 0. Falls back to the original order silently.
 */
export function usePersonalizedTowns<T extends string>(towns: readonly T[]): T[] {
  const [ordered, setOrdered] = useState<T[]>([...towns]);

  useEffect(() => {
    fetchVisitorLocation().then((loc) => {
      const town = loc.town;
      if (!town) return;
      const idx = towns.findIndex(
        (t) => t.toLowerCase() === town.toLowerCase(),
      );
      if (idx <= 0) return;
      const next = [...towns] as T[];
      next.splice(idx, 1);
      next.unshift(towns[idx]);
      setOrdered(next);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return ordered;
}
