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
  photoIndex?: number,
): string {
  const extra = new URLSearchParams();
  if (photoIndex != null && photoIndex >= 0) {
    extra.set("photo", String(photoIndex));
  }
  const extraQs = extra.toString();
  return listingSectionHref(id, "photos", address, town, extraQs || undefined);
}

export function listingHistoryHref(
  id: string,
  address?: string | null,
  town?: string | null,
): string {
  return listingSectionHref(id, "history", address, town);
}

export function listingComparablesHref(
  id: string,
  address?: string | null,
  town?: string | null,
): string {
  return listingSectionHref(id, "comparables", address, town);
}

export function listingComparableRentalsHref(
  id: string,
  address?: string | null,
  town?: string | null,
): string {
  return listingSectionHref(id, "comparable-rentals", address, town);
}

export function listingIfHref(
  id: string,
  address?: string | null,
  town?: string | null,
): string {
  return listingSectionHref(id, "if", address, town);
}

export function listingUagHref(
  id: string,
  address?: string | null,
  town?: string | null,
): string {
  return listingSectionHref(id, "uag", address, town);
}

export function listingSectionHref(
  id: string,
  section:
    | "overview"
    | "history"
    | "photos"
    | "comparables"
    | "comparable-rentals"
    | "uag"
    | "if",
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
        : section === "comparables"
          ? `/listings/${listingId}/comparables`
          : section === "comparable-rentals"
            ? `/listings/${listingId}/comparable-rentals`
            : section === "uag"
              ? `/listings/${listingId}/uag`
              : section === "if"
                ? `/listings/${listingId}/if`
                : `/listings/${listingId}`;
  return qs ? `${path}?${qs}` : path;
}

export function listingPhotoProxyUrl(mlsId: string, index: number): string {
  return `/api/listings/${encodeURIComponent(mlsId)}/photos/${index}`;
}

/** Dense placeholder proxy URLs when the API returns an empty photos[] but MLS reports a count. */
export function listingPhotoProxyUrlsFromCount(
  mlsId: string,
  count: number,
  cap = 60,
): string[] {
  const id = mlsId.trim();
  const n = Math.min(Math.max(0, Math.floor(count)), cap);
  if (!id || n <= 0) return [];
  return Array.from({ length: n }, (_, i) => listingPhotoProxyUrl(id, i));
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

export function dealOfTheDayHref(
  city?: string | null,
  opts?: {
    mlsId?: string | null;
    listingKey?: string | null;
    kind?: "sale" | "rental" | null;
  },
): string {
  const params = new URLSearchParams();
  if (city && city !== "All") params.set("city", city);
  const listingId = opts?.listingKey?.trim() || opts?.mlsId?.trim();
  if (listingId) params.set("listing", listingId);
  if (opts?.kind) params.set("kind", opts.kind);
  const qs = params.toString();
  return qs ? `/deal-of-the-day?${qs}` : "/deal-of-the-day";
}
