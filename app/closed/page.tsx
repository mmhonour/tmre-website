import { preload } from "react-dom";
import ClosedClient from "./ClosedClient";
import { readClosedDailyCache, rebuildClosedDailyCache } from "@/lib/closed-daily-cache";
import { fetchClosedListings } from "@/lib/closed-listings";
import { defaultClosedRange } from "@/lib/closed-shared";
import { listingPhotoThumbUrls } from "@/lib/listing-url";
import { getActiveCoverageTownsLabel } from "@/lib/ct-coverage";
import type { LatestListingRow } from "@/lib/latest-listings";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const townsLabel = await getActiveCoverageTownsLabel();
  return {
    title: "Closed — TMRE",
    description: `Closed sales across ${townsLabel}, with a start-to-end lookback and precomputed town stats.`,
  };
}

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

export default async function ClosedPage() {
  const range = defaultClosedRange();
  let daily = await readClosedDailyCache();
  if (!daily) {
    try {
      await rebuildClosedDailyCache();
      daily = await readClosedDailyCache();
    } catch (err) {
      console.warn("[closed] daily cache warm failed", err);
    }
  }
  const initialListings = await fetchClosedListings({
    fromDay: range.from,
    toDay: range.to,
    limit: 30,
  });
  for (const href of heroPhotoPreloadUrls(initialListings)) {
    preload(href, { as: "image" });
  }

  return (
    <ClosedClient
      initialListings={initialListings}
      initialDaily={daily}
      initialFrom={range.from}
      initialTo={range.to}
    />
  );
}
