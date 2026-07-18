/** Tabs that map to stacked overview sections (excludes Photos). */
export type ListingScrollSectionTab =
  | "overview"
  | "history"
  | "if"
  | "comparables"
  | "comparable-rentals"
  | "uag";

/** In-page section anchors used by mobile continuous scroll on Overview. */
export const LISTING_SECTION_IDS: Record<ListingScrollSectionTab, string> = {
  overview: "listing-sec-overview",
  history: "listing-sec-history",
  if: "listing-sec-if",
  comparables: "listing-sec-sales",
  "comparable-rentals": "listing-sec-rentals",
  uag: "listing-sec-uag",
};

export function listingSectionIdForTab(
  tab: ListingScrollSectionTab | "photos",
): string | null {
  if (tab === "photos") return null;
  return LISTING_SECTION_IDS[tab] ?? null;
}

export function listingTabFromSectionId(
  id: string,
): ListingScrollSectionTab | null {
  for (const [tab, sectionId] of Object.entries(LISTING_SECTION_IDS)) {
    if (sectionId === id) return tab as ListingScrollSectionTab;
  }
  return null;
}
