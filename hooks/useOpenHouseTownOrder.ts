"use client";

import { useCallback, useEffect, useState } from "react";
import { usePersonalizedTowns } from "@/hooks/usePersonalizedTowns";
import { clearClientPref, readClientPref, writeClientPref } from "@/lib/client-prefs";
import {
  OH_TOWN_ORDER_COOKIE,
  mergeTownOrder,
  parseTownOrderCookie,
  serializeTownOrderCookie,
} from "@/lib/open-houses-town-order";

export function useOpenHouseTownOrder<T extends string>(towns: readonly T[]): {
  orderedTowns: T[];
  customOrder: boolean;
  setPreferredOrder: (next: readonly string[]) => void;
  resetOrder: () => void;
} {
  const personalized = usePersonalizedTowns(towns);
  const [order, setOrder] = useState<T[]>(() => [...towns]);
  const [customOrder, setCustomOrder] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = parseTownOrderCookie(readClientPref(OH_TOWN_ORDER_COOKIE));
    if (stored) {
      setOrder(mergeTownOrder(stored, towns) as T[]);
      setCustomOrder(true);
    }
    setHydrated(true);
  }, [towns]);

  useEffect(() => {
    if (!hydrated || customOrder) return;
    setOrder(personalized);
  }, [hydrated, customOrder, personalized]);

  const setPreferredOrder = useCallback(
    (next: readonly string[]) => {
      const merged = mergeTownOrder(next, towns) as T[];
      setOrder(merged);
      setCustomOrder(true);
      writeClientPref(OH_TOWN_ORDER_COOKIE, serializeTownOrderCookie(merged));
    },
    [towns],
  );

  const resetOrder = useCallback(() => {
    clearClientPref(OH_TOWN_ORDER_COOKIE);
    setCustomOrder(false);
    setOrder(personalized);
  }, [personalized]);

  return { orderedTowns: order, customOrder, setPreferredOrder, resetOrder };
}
