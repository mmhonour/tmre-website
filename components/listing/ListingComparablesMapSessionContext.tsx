"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { ComparableListing } from "@/lib/listing-comparables-shared";
import type { ComparablesKind } from "@/lib/listing-comparables-map";

/**
 * Session-filtered sold / active pools published by ListingComparablesPanel
 * so the showcase map can plot the same matches the Criteria ± controls use.
 * Each kind is kept independently — switching Sold ↔ Rented does not wipe the
 * other market's last filter.
 */
export type ComparablesMapSessionSnapshot = {
  sold: ComparableListing[];
  active: ComparableListing[];
};

type ListingComparablesMapSessionApi = {
  sale: ComparablesMapSessionSnapshot | null;
  rental: ComparablesMapSessionSnapshot | null;
  publish: (
    kind: ComparablesKind,
    snapshot: ComparablesMapSessionSnapshot,
  ) => void;
};

const ListingComparablesMapSessionContext =
  createContext<ListingComparablesMapSessionApi | null>(null);

export function ListingComparablesMapSessionProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [sale, setSale] = useState<ComparablesMapSessionSnapshot | null>(null);
  const [rental, setRental] = useState<ComparablesMapSessionSnapshot | null>(
    null,
  );
  const publish = useCallback(
    (kind: ComparablesKind, snapshot: ComparablesMapSessionSnapshot) => {
      if (kind === "rental") setRental(snapshot);
      else setSale(snapshot);
    },
    [],
  );
  const value = useMemo(
    () => ({ sale, rental, publish }),
    [sale, rental, publish],
  );
  return (
    <ListingComparablesMapSessionContext.Provider value={value}>
      {children}
    </ListingComparablesMapSessionContext.Provider>
  );
}

export function useComparablesMapSession(): ListingComparablesMapSessionApi | null {
  return useContext(ListingComparablesMapSessionContext);
}

/** No-op outside the showcase provider (dedicated /comparables routes). */
export function usePublishComparablesMapSession(
  kind: ComparablesKind,
  snapshot: ComparablesMapSessionSnapshot | null,
): void {
  const api = useComparablesMapSession();
  useEffect(() => {
    if (!api || !snapshot) return;
    api.publish(kind, snapshot);
  }, [api, kind, snapshot]);
}
