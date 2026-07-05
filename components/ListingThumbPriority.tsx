"use client";

import { useEffect } from "react";

const PHOTO_CDN_ORIGIN = "https://smartmls-assets.cdn-connectmls.com";

/** Preconnect to the MLS photo CDN so thumbnails start faster on every page. */
export default function ListingThumbPriority() {
  useEffect(() => {
    const id = "tmre-photo-cdn-preconnect";
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "preconnect";
    link.href = PHOTO_CDN_ORIGIN;
    link.crossOrigin = "anonymous";
    document.head.appendChild(link);
  }, []);

  return null;
}
