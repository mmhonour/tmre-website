import type { ListingTab } from "@/components/listing/ListingSubnav";

/**
 * Anchors in the showcase details panel. The hero rail and the tab strip both
 * scroll to these rather than leaving the page — the production section ids are
 * deliberately not reused, since those belong to the Overview page's own layout.
 */
export const SHOWCASE_SECTION_IDS = {
  overview: "showcase-overview",
  insight: "showcase-insight",
  details: "showcase-details",
  photos: "showcase-photos",
  comps: "showcase-comps",
  if: "showcase-if",
  history: "showcase-history",
  map: "showcase-map",
} as const;

export type ShowcaseSection = keyof typeof SHOWCASE_SECTION_IDS;

/** Tabs with a section in the panel; anything else still navigates to its route. */
/** Every tab resolves to a section here — nothing on this page navigates away. */
const TAB_TO_SECTION: Partial<Record<ListingTab, ShowcaseSection>> = {
  overview: "overview",
  photos: "photos",
  // Sold, Rented and Under Agreement share one section; the comps body picks
  // its own kind.
  comparables: "comps",
  "comparable-rentals": "comps",
  uag: "comps",
  if: "if",
  history: "history",
  map: "map",
};

export function showcaseSectionForTab(tab: ListingTab): ShowcaseSection | null {
  return TAB_TO_SECTION[tab] ?? null;
}

export function scrollToShowcaseSection(section: ShowcaseSection): void {
  document
    .getElementById(SHOWCASE_SECTION_IDS[section])
    ?.scrollIntoView({ behavior: "smooth", block: "start" });
}
