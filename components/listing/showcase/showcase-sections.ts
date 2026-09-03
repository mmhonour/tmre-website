import type { ListingTab } from "@/components/listing/ListingSubnav";
import {
  LISTING_PRODUCTION_PANEL_ID,
  LISTING_SALE_ON_MARKET_PANEL_ID,
  LISTING_SECTION_IDS,
} from "@/components/listing/listing-section-ids";

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

function scrollElementIntoView(el: HTMLElement): void {
  el.scrollIntoView({ behavior: "smooth", block: "start" });
}

/**
 * Land on a comps / overview pane that may not be mounted yet.
 *
 * On the default showcase page the pane ids sit in the details panel. On
 * `?panel=production` they live inside the Overview slide overlay, which only
 * mounts after the matching hash opens the Sold (or What if / History) tab.
 */
export function jumpToListingSection(targetId: string): void {
  if (typeof window === "undefined") return;

  const existing = document.getElementById(targetId);
  if (existing) {
    scrollElementIntoView(existing);
    return;
  }

  const hash = `#${targetId}`;
  if (window.location.hash !== hash) {
    window.location.hash = hash;
  } else {
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  }

  const fallback =
    document.getElementById(LISTING_PRODUCTION_PANEL_ID) ??
    document.getElementById(SHOWCASE_SECTION_IDS.comps);
  if (fallback) scrollElementIntoView(fallback);

  const retry = () => {
    const el = document.getElementById(targetId);
    if (el) scrollElementIntoView(el);
  };
  window.setTimeout(retry, 80);
  window.setTimeout(retry, 280);
}

export function scrollToShowcaseSection(section: ShowcaseSection): void {
  const el = document.getElementById(SHOWCASE_SECTION_IDS[section]);
  if (el) {
    scrollElementIntoView(el);
    return;
  }

  if (section === "comps") {
    jumpToListingSection(LISTING_SALE_ON_MARKET_PANEL_ID);
    return;
  }

  const overviewId =
    section === "if"
      ? LISTING_SECTION_IDS.if
      : section === "history"
        ? LISTING_SECTION_IDS.history
        : section === "overview" ||
            section === "details" ||
            section === "insight"
          ? LISTING_SECTION_IDS.overview
          : null;
  if (overviewId) {
    jumpToListingSection(overviewId);
    return;
  }

  document
    .getElementById(LISTING_PRODUCTION_PANEL_ID)
    ?.scrollIntoView({ behavior: "smooth", block: "start" });
}
