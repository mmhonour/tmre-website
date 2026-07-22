"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type ListingCriteriaVisibilityValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
};

const ListingCriteriaVisibilityContext =
  createContext<ListingCriteriaVisibilityValue | null>(null);

/**
 * Shared Criteria open/closed across Sold / Rented / What if / UAG on a listing
 * or Spotlight page. One toggle controls all analysis tabs.
 */
export function ListingCriteriaVisibilityProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen((v) => !v), []);
  const value = useMemo(
    () => ({ open, setOpen, toggle }),
    [open, toggle],
  );
  return (
    <ListingCriteriaVisibilityContext.Provider value={value}>
      {children}
    </ListingCriteriaVisibilityContext.Provider>
  );
}

export function useListingCriteriaVisibility(): ListingCriteriaVisibilityValue | null {
  return useContext(ListingCriteriaVisibilityContext);
}
