"use client";

import { createContext, useContext } from "react";

/** Slide-up panel: switch to Photos mode (collapse panel over the hero). */
export const ListingPhotosModeContext = createContext<(() => void) | null>(
  null,
);

export function useListingPhotosMode(): (() => void) | null {
  return useContext(ListingPhotosModeContext);
}
