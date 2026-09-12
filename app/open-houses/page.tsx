import type { Metadata } from "next";
import OpenHousesClient from "./OpenHousesClient";
import { peekOpenHousesPageCache } from "@/lib/open-houses-page-data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Open Houses — TMRE",
  description:
    "Upcoming public open houses remaining this week across our coverage towns.",
};

/**
 * Embed the hourly-sync week JSON when it is already in stats_cache.
 * Do not assemble the live join here — that 502’d Chrome/Edge on the
 * document while `/api/listings/open-houses` still answered 200.
 * A cache miss still ships the shell; the client fetches the API.
 */
export default async function OpenHousesPage() {
  const initial = await peekOpenHousesPageCache();
  return <OpenHousesClient initial={initial} />;
}
