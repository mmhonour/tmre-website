/** Tabs that map to stacked overview sections (excludes Photos). */
export type ListingScrollSectionTab =
  | "overview"
  | "history"
  | "if"
  | "comparables"
  | "comparable-rentals"
  | "on-the-market"
  | "uag";

/** In-page section anchors used by mobile continuous scroll on Overview. */
export const LISTING_SECTION_IDS: Record<ListingScrollSectionTab, string> = {
  overview: "listing-sec-overview",
  history: "listing-sec-history",
  if: "listing-sec-if",
  comparables: "listing-sec-sales",
  "comparable-rentals": "listing-sec-rentals",
  "on-the-market": "listing-sec-on-the-market",
  uag: "listing-sec-uag",
};

/** Panel anchors inside Sold / Rented comps (used by On The Market mobile jumps). */
export const LISTING_ON_MARKET_PANEL_IDS = {
  sale: "comparables-on-market-sale",
  rental: "comparables-on-market-rental",
} as const;

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
