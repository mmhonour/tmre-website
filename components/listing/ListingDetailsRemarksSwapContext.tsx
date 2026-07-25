"use client";

import { createContext, useContext } from "react";

/**
 * Desktop Overview: Details panel control that collapses Listing remarks so
 * Details slides up just under the remarks header (and back).
 */
export type ListingDetailsRemarksSwapApi = {
  /** True when Details is elevated (remarks body collapsed). */
  detailsElevated: boolean;
  toggle: () => void;
};

export const ListingDetailsRemarksSwapContext =
  createContext<ListingDetailsRemarksSwapApi | null>(null);

export function useListingDetailsRemarksSwap(): ListingDetailsRemarksSwapApi | null {
  return useContext(ListingDetailsRemarksSwapContext);
}
