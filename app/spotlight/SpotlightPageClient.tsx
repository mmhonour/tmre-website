"use client";

import { useSearchParams } from "next/navigation";
import SpotlightListingClient from "./SpotlightListingClient";
import SpotlightShowcaseClient from "./SpotlightShowcaseClient";

/** Default is the listing showcase; `?view=classic` keeps the prior chrome. */
export default function SpotlightPageClient() {
  const view = useSearchParams().get("view");
  if (view === "classic") return <SpotlightListingClient />;
  return <SpotlightShowcaseClient />;
}
