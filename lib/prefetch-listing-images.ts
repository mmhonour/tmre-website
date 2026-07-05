import { listingPhotoThumbUrls } from "@/lib/listing-url";

type PrefetchListing = {
  photoUrl?: string | null;
  listing: {
    mlsId: string;
    listingKey?: string | null;
    photoCount?: number | null;
  };
};

const prefetched = new Set<string>();

function prefetchImage(url: string): void {
  if (!url || prefetched.has(url)) return;
  prefetched.add(url);
  const img = new Image();
  img.decoding = "async";
  img.src = url;
}

/** Collect hero + thumbnail-deck proxy URLs for a listing deal payload. */
export function listingImageUrls(deal: PrefetchListing): string[] {
  const urls: string[] = [];
  if (deal.photoUrl) urls.push(deal.photoUrl);
  const mlsId = deal.listing.listingKey?.trim() || deal.listing.mlsId;
  if (mlsId) {
    urls.push(...listingPhotoThumbUrls(mlsId, deal.listing.photoCount, 5, 1));
  }
  return urls;
}

/** Warm browser cache for listing photo proxy URLs (thumbnails first). */
export function prefetchMlsPhotoThumbs(
  mlsIds: readonly string[],
  perListing = 1,
): void {
  for (const raw of mlsIds) {
    const id = raw.trim();
    if (!id) continue;
    for (let i = 0; i < perListing; i++) {
      prefetchImage(listingPhotoThumbUrls(id, null, 1, i)[0] ?? "");
    }
  }
}

type PrefetchMlsPhotoThumbsOrderedOptions = {
  /** Also prefetch stacked thumb indices 1+ for the first N listings. */
  stackPhotosForTop?: number;
  /** How many stacked thumbs to prefetch per top listing (default 3). */
  stackPhotoCount?: number;
};

/**
 * Prefetch deal-board photos in score order so higher-ranked listings warm cache first.
 * Returns a cancel function for the in-flight queue.
 */
export function prefetchMlsPhotoThumbsOrdered(
  mlsIds: readonly string[],
  opts: PrefetchMlsPhotoThumbsOrderedOptions = {},
): () => void {
  const stackPhotosForTop = opts.stackPhotosForTop ?? 12;
  const stackPhotoCount = opts.stackPhotoCount ?? 3;
  let cancelled = false;
  let index = 0;

  const step = () => {
    if (cancelled || index >= mlsIds.length) return;
    const id = mlsIds[index]!.trim();
    index += 1;
    if (id) {
      if (index <= stackPhotosForTop) {
        for (const url of listingPhotoThumbUrls(id, null, stackPhotoCount, 0)) {
          prefetchImage(url);
        }
      } else {
        prefetchImage(listingPhotoThumbUrls(id, null, 1, 0)[0] ?? "");
      }
    }
    if (index < mlsIds.length) {
      setTimeout(step, 32);
    }
  };

  step();
  return () => {
    cancelled = true;
  };
}

/** Warm browser cache for a deal's hero photo and stacked thumbnail deck. */
export function prefetchListingImages(deal: PrefetchListing | null | undefined): void {
  if (!deal) return;
  for (const url of listingImageUrls(deal)) prefetchImage(url);
}

/** Prefetch current, next, and previous carousel slides first; queue the rest. */
export function prefetchDealCarouselImages<T extends string>(
  towns: readonly T[],
  dealsByTown: Partial<Record<T, PrefetchListing | null | undefined>>,
  activeIndex: number,
): void {
  if (towns.length === 0) return;

  const priority = new Set<T>();
  priority.add(towns[activeIndex % towns.length]);
  if (towns.length > 1) {
    priority.add(towns[(activeIndex + 1) % towns.length]);
    priority.add(towns[(activeIndex - 1 + towns.length) % towns.length]);
  }

  for (const town of priority) prefetchListingImages(dealsByTown[town]);

  const remaining = towns.filter((t) => !priority.has(t));
  if (remaining.length === 0) return;

  const loadRest = () => {
    for (const town of remaining) prefetchListingImages(dealsByTown[town]);
  };

  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(loadRest, { timeout: 4_000 });
  } else {
    setTimeout(loadRest, 200);
  }
}
