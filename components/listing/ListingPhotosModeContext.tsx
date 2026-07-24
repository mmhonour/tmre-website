"use client";

import { createContext, useContext } from "react";

/**
 * Overview slide-panel mode: enter Photos mode (collapse panel + reveal Photos
 * tab) and cycle the hero through listing photos in place.
 */
export type ListingPhotosModeApi = {
  enter: (photoIndex?: number) => void;
  /** Photos tab selected (panel collapsed over the hero). */
  active: boolean;
  photoIndex: number;
  setPhotoIndex: (photoIndex: number) => void;
  /** Step the hero photo; wraps using the registered photo count. */
  cycle: (delta: number) => void;
  /** Keep the cycle wrap range in sync with the mounted photo stack. */
  registerPhotoCount: (count: number) => void;
};

export const ListingPhotosModeContext =
  createContext<ListingPhotosModeApi | null>(null);

export function useListingPhotosMode(): ListingPhotosModeApi | null {
  return useContext(ListingPhotosModeContext);
}
