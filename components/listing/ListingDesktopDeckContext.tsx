"use client";

import { createContext, useCallback, useContext, useMemo } from "react";

/**
 * Desktop Overview right column: Remarks / Details / History / Admin as a
 * card deck. Headers always peek; at most one card is expanded and takes the
 * body space. Click a header (or a subnav tab) to expand; click again or the
 * minimize control to collapse.
 */
export type ListingDesktopDeckCardId =
  | "remarks"
  | "details"
  | "history"
  | "admin";

export type ListingDesktopDeckApi = {
  /** Which card’s body is open — null means every card is header-only. */
  activeCard: ListingDesktopDeckCardId | null;
  isExpanded: (id: ListingDesktopDeckCardId) => boolean;
  /** Expand this card (minimizes the others). */
  selectCard: (id: ListingDesktopDeckCardId) => void;
  /** Collapse whatever is open. */
  minimize: () => void;
  /** Expand if closed; minimize if already this card. */
  toggleCard: (id: ListingDesktopDeckCardId) => void;
};

const ListingDesktopDeckContext = createContext<ListingDesktopDeckApi | null>(
  null,
);

export function useListingDesktopDeck(): ListingDesktopDeckApi | null {
  return useContext(ListingDesktopDeckContext);
}

/** Controlled provider — parent owns activeCard so subnav tabs can drive it. */
export function ListingDesktopDeckProvider({
  children,
  activeCard,
  onActiveCardChange,
  enabled = true,
}: {
  children: React.ReactNode;
  activeCard: ListingDesktopDeckCardId | null;
  onActiveCardChange: (id: ListingDesktopDeckCardId | null) => void;
  /** When false (mobile / non-Overview), consumers treat the deck as inactive. */
  enabled?: boolean;
}) {
  const selectCard = useCallback(
    (id: ListingDesktopDeckCardId) => {
      onActiveCardChange(id);
    },
    [onActiveCardChange],
  );

  const minimize = useCallback(() => {
    onActiveCardChange(null);
  }, [onActiveCardChange]);

  const toggleCard = useCallback(
    (id: ListingDesktopDeckCardId) => {
      onActiveCardChange(activeCard === id ? null : id);
    },
    [activeCard, onActiveCardChange],
  );

  const isExpanded = useCallback(
    (id: ListingDesktopDeckCardId) => enabled && activeCard === id,
    [activeCard, enabled],
  );

  const api = useMemo<ListingDesktopDeckApi | null>(() => {
    if (!enabled) return null;
    return {
      activeCard,
      isExpanded,
      selectCard,
      minimize,
      toggleCard,
    };
  }, [enabled, activeCard, isExpanded, selectCard, minimize, toggleCard]);

  return (
    <ListingDesktopDeckContext.Provider value={api}>
      {children}
    </ListingDesktopDeckContext.Provider>
  );
}
