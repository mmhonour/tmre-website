import { preload } from "react-dom";
import LatestClient from "./LatestClient";
import { readLatestGlobalFeedCache } from "@/lib/latest-feed-cache";
import { readAllLatestTownFeedCaches } from "@/lib/latest-town-feed-cache";
import { fetchTownUpdateStats, type LatestListingRow } from "@/lib/latest-listings";
import { listingPhotoThumbUrls } from "@/lib/listing-url";
import { TMRE_TOWNS_LABEL } from "@/lib/tmre-towns";

export const metadata = {
  title: "Latest — TMRE",
  description: `30 on 30 — the 30 most recently updated MLS listings across ${TMRE_TOWNS_LABEL}, refreshed every 30 minutes.`,
};

function heroPhotoPreloadUrls(rows: LatestListingRow[], limit = 12): string[] {
  return rows.slice(0, limit).flatMap((row) => {
    const id = row.listingKey?.trim() || row.mlsId;
    if (!id) return [];
    const index =
      row.primaryPhotoIndex != null && row.primaryPhotoIndex >= 0
        ? row.primaryPhotoIndex
        : 0;
    const url = listingPhotoThumbUrls(id, row.photoCount, 1, index)[0];
    return url ? [url] : [];
  });
}

export default async function LatestPage() {
  const initialListings = readLatestGlobalFeedCache(30) ?? [];
  const initialTownFeeds = readAllLatestTownFeedCaches();
  const initialTownStats = await fetchTownUpdateStats();
  const photoPreloads = heroPhotoPreloadUrls(initialListings);
  for (const href of photoPreloads) {
    preload(href, { as: "image" });
  }

  return (
    <LatestClient
        initialListings={initialListings}
        initialTownFeeds={initialTownFeeds}
        initialTownStats={initialTownStats}
    />
  );
}
