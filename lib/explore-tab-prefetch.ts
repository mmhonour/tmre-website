"use client";

import {
  CLOSED_FEED_LIMIT,
  defaultClosedRange,
} from "@/lib/closed-shared";
import { prefetchMlsPhotoThumbsOrdered } from "@/lib/prefetch-listing-images";
import { loadTabJson, prefetchTabJson } from "@/lib/tab-data-prefetch";

type FeedPhotoRow = {
  listingKey?: string | null;
  mlsId?: string | null;
};

function listingKeys(rows: FeedPhotoRow[] | undefined): string[] {
  return (rows ?? [])
    .map((row) => row.listingKey?.trim() || row.mlsId?.trim() || "")
    .filter(Boolean);
}

function warmFeedPhotos(rows: FeedPhotoRow[] | undefined): void {
  const keys = listingKeys(rows);
  if (keys.length === 0) return;
  prefetchMlsPhotoThumbsOrdered(keys, {
    stackPhotosForTop: 12,
    stackPhotoCount: 1,
  });
}

export function closedExploreFeedUrl(
  fromDay?: string,
  toDay?: string,
  options?: { town?: string; limit?: number; buckets?: boolean },
): string {
  const range =
    fromDay && toDay ? { from: fromDay, to: toDay } : defaultClosedRange();
  const params = new URLSearchParams({
    from: range.from,
    to: range.to,
    limit: String(options?.limit ?? CLOSED_FEED_LIMIT),
  });
  if (options?.town) params.set("town", options.town);
  if (options?.buckets && !options.town) params.set("buckets", "1");
  return `/api/listings/closed?${params.toString()}`;
}

export function latestExploreFeedUrl(): string {
  return "/api/listings/latest?limit=30";
}

/** After Latest paints, pull Closed JSON + thumbs so the tab is warm. */
export function prefetchClosedExploreFeed(): void {
  const url = closedExploreFeedUrl(undefined, undefined, { buckets: true });
  prefetchTabJson(url);
  void loadTabJson<{ listings?: FeedPhotoRow[] }>(url).then((body) => {
    if (body) warmFeedPhotos(body.listings);
  });
}

/** After Closed paints, pull Latest JSON + thumbs so the tab is warm. */
export function prefetchLatestExploreFeed(): void {
  const url = latestExploreFeedUrl();
  prefetchTabJson(url);
  prefetchTabJson("/api/listings/latest/towns");
  void loadTabJson<{ listings?: FeedPhotoRow[] }>(url).then((body) => {
    if (body) warmFeedPhotos(body.listings);
  });
}
