"use client";

import { createContext, useContext } from "react";

/**
 * Desktop Overview: History panel control that collapses Details body so
 * History slides up just under the Details header (and back).
 */
export type ListingHistoryDetailsSwapApi = {
  /** True when History is elevated (Details body collapsed). */
  historyElevated: boolean;
  toggle: () => void;
};

export const ListingHistoryDetailsSwapContext =
  createContext<ListingHistoryDetailsSwapApi | null>(null);

export function useListingHistoryDetailsSwap(): ListingHistoryDetailsSwapApi | null {
  return useContext(ListingHistoryDetailsSwapContext);
}
