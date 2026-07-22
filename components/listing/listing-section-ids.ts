/** Tabs that map to stacked overview sections (excludes Photos). */
export type ListingScrollSectionTab =
  | "overview"
  | "history"
  | "if"
  | "comparables"
  | "comparable-rentals"
  | "uag";

/** In-page section anchors used by continuous Overview scroll (listing / Spotlight). */
export const LISTING_SECTION_IDS: Record<ListingScrollSectionTab, string> = {
  overview: "listing-sec-overview",
  history: "listing-sec-history",
  if: "listing-sec-if",
  comparables: "listing-sec-sales",
  "comparable-rentals": "listing-sec-rentals",
  uag: "listing-sec-uag",
};

/** For-sale on-market panel anchor inside the Sold comps section. */
export const LISTING_SALE_ON_MARKET_PANEL_ID = "comparables-on-market-sale";

/** Recently Sold / Recently Rented panel anchors (ListingComparablesPanel). */
export const LISTING_RECENTLY_SOLD_PANEL_ID = "comparables-sold-sale";
export const LISTING_RECENTLY_RENTED_PANEL_ID = "comparables-sold-rental";

export function listingRecentlyClosedPanelId(
  kind: "sale" | "rental",
): string {
  return kind === "rental"
    ? LISTING_RECENTLY_RENTED_PANEL_ID
    : LISTING_RECENTLY_SOLD_PANEL_ID;
}

/** Panel id to scroll to when clicking Sold / Rented in the listing subnav. */
export function listingRecentlyClosedPanelIdForTab(
  tab: ListingScrollSectionTab | "photos" | "map",
): string | null {
  if (tab === "comparables") return LISTING_RECENTLY_SOLD_PANEL_ID;
  if (tab === "comparable-rentals") return LISTING_RECENTLY_RENTED_PANEL_ID;
  return null;
}

export function listingSectionIdForTab(
  tab: ListingScrollSectionTab | "photos" | "map",
): string | null {
  if (tab === "photos" || tab === "map") return null;
  return LISTING_SECTION_IDS[tab] ?? null;
}

export function listingTabFromSectionId(
  id: string,
): ListingScrollSectionTab | null {
  if (
    id === LISTING_RECENTLY_SOLD_PANEL_ID ||
    id === LISTING_SALE_ON_MARKET_PANEL_ID ||
    id === "comparables-on-market-sale"
  ) {
    return "comparables";
  }
  if (
    id === LISTING_RECENTLY_RENTED_PANEL_ID ||
    id === "comparables-on-market-rental"
  ) {
    return "comparable-rentals";
  }
  for (const [tab, sectionId] of Object.entries(LISTING_SECTION_IDS)) {
    if (sectionId === id) return tab as ListingScrollSectionTab;
  }
  return null;
}
