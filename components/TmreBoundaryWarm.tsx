"use client";

import { useEffect } from "react";
import { prefetchAllTownBoundaries } from "@/components/ZipBoundaryPopover";

/**
 * Intelligence already warms this bundle on mount. Listing maps share the same
 * module cache, but a direct open of a listing never visited Intelligence, so
 * the camera used to fall through to a downtown ZIP_CENTERS point.
 */
export default function TmreBoundaryWarm() {
  useEffect(() => {
    prefetchAllTownBoundaries();
  }, []);
  return null;
}
