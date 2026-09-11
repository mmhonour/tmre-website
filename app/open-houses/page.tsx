import type { Metadata } from "next";
import OpenHousesClient from "./OpenHousesClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Open Houses — TMRE",
  description:
    "Upcoming public open houses remaining this week across our coverage towns.",
};

/**
 * Do not load the week list here. Awaiting that query on the document is what
 * 502’d Chrome/Edge while `/api/listings/open-houses` still answered 200.
 * The client fetches the API (the request that already works).
 */
export default function OpenHousesPage() {
  return <OpenHousesClient />;
}
