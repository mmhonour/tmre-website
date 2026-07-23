"use client";

import { createContext, useContext } from "react";

/**
 * Overview slide-panel mode: enter Photos mode (collapse panel + reveal Photos
 * tab). Provided by ListingHeroPanels; consumed by photo stacks on Overview.
 */
export const ListingPhotosModeContext = createContext<(() => void) | null>(
  null,
);

export function useListingPhotosMode(): (() => void) | null {
  return useContext(ListingPhotosModeContext);
}
