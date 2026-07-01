export function listingDetailHref(
  id: string,
  address?: string | null,
  town?: string | null,
): string {
  return listingSectionHref(id, "overview", address, town);
}

export function listingPhotosHref(
  id: string,
  address?: string | null,
  town?: string | null,
): string {
  return listingSectionHref(id, "photos", address, town);
}

export function listingHistoryHref(
  id: string,
  address?: string | null,
  town?: string | null,
): string {
  return listingSectionHref(id, "history", address, town);
}

export function listingSectionHref(
  id: string,
  section: "overview" | "history" | "photos",
  address?: string | null,
  town?: string | null,
  extraQuery?: string,
): string {
  const listingId = encodeURIComponent(id);
  const street = address?.trim();
  const params = new URLSearchParams(extraQuery ?? "");
  if (street) params.set("address", street);
  if (town?.trim()) params.set("city", town.trim());
  const qs = params.toString();
  const path =
    section === "history"
      ? `/listings/${listingId}/history`
      : section === "photos"
        ? `/listings/${listingId}/photos`
        : `/listings/${listingId}`;
  return qs ? `${path}?${qs}` : path;
}

export function listingPhotoProxyUrl(mlsId: string, index: number): string {
  return `/api/listings/${encodeURIComponent(mlsId)}/photos/${index}`;
}

/** Up to N listing photo proxy URLs for thumbnail previews (0-based index). */
export function listingPhotoThumbUrls(
  mlsId: string,
  photoCount?: number | null,
  max = 5,
  startIndex = 0,
): string[] {
  if (photoCount != null && photoCount <= startIndex) return [];
  const total = photoCount && photoCount > 0 ? photoCount : max + startIndex;
  const available = Math.max(0, total - startIndex);
  const count = Math.min(max, available);
  return Array.from({ length: count }, (_, i) =>
    listingPhotoProxyUrl(mlsId, startIndex + i),
  );
}

export function listingDetailHrefForListing(listing: {
  mlsId: string;
  listingKey?: string | null;
  address: { street?: string | null; full?: string | null };
  city?: string | null;
}): string {
  const id = listing.listingKey?.trim() || listing.mlsId;
  return listingDetailHref(
    id,
    listing.address.street || listing.address.full,
    listing.city,
  );
}

export function dealOfTheDayHref(city?: string | null): string {
  if (!city || city === "All") return "/deal-of-the-day";
  return `/deal-of-the-day?city=${encodeURIComponent(city)}`;
}
