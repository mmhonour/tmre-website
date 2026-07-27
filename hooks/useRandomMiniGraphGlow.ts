"use client";

import { useEffect, useState } from "react";

/**
 * Ongoing random data-point glow for Intelligence mini-graphs.
 * Each mounted chart runs its own staggered loop so glows are not exclusive
 * to one graph and do not stay in lockstep across charts.
 */
export function useRandomMiniGraphGlow(
  pointIds: readonly string[],
  enabled = true,
): Set<string> {
  const [glowIds, setGlowIds] = useState<Set<string>>(() => new Set());
  const idsKey = pointIds.join("|");

  useEffect(() => {
    if (!enabled || pointIds.length === 0) {
      setGlowIds(new Set());
      return;
    }

    const ids = [...pointIds];
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const schedule = (fn: () => void, ms: number) => {
      timeoutId = setTimeout(fn, ms);
    };

    const pick = () => {
      if (cancelled) return;
      const count =
        ids.length <= 1 ? 1 : Math.random() < 0.6 ? 1 : Math.min(2, ids.length);
      const shuffled = [...ids].sort(() => Math.random() - 0.5);
      setGlowIds(new Set(shuffled.slice(0, count)));

      const holdMs = 1100 + Math.random() * 1600;
      schedule(() => {
        if (cancelled) return;
        // Brief clear so glows feel intermittent, then pick again.
        if (Math.random() < 0.4) {
          setGlowIds(new Set());
          schedule(pick, 350 + Math.random() * 1000);
        } else {
          pick();
        }
      }, holdMs);
    };

    // Stagger start per chart instance so concurrent graphs don't sync.
    schedule(pick, 200 + Math.random() * 2200);

    return () => {
      cancelled = true;
      if (timeoutId != null) clearTimeout(timeoutId);
    };
    // idsKey captures point identity; pointIds array identity is unstable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, enabled]);

  return glowIds;
}
