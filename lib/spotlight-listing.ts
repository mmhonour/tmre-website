/**
 * TMRE Spotlight — featured listings on /spotlight (property tabs 1–3).
 * Edit this file to swap spotlight properties; tab 1 keeps the Coming Soon panel.
 */
export type SpotlightPropertyTabId = 1 | 2 | 3;

export const SPOTLIGHT_PROPERTY_TABS: SpotlightPropertyTabId[] = [1, 2, 3];

export type SpotlightListingConfig = {
  /** Internal reference only (contact form, analytics). */
  id: string;
  /** Shown on the page instead of the street address. */
  displayTitle: string;
  /** Public location line (town-level only). */
  displayLocation: string;
  /** Full address for your records — not rendered on /spotlight. */
  address: {
    street: string;
    city: string;
    state: string;
    postalCode: string;
  };
  /** When set, photos load from `/api/listings/{mlsId}`; otherwise use `photos` or placeholder. */
  mlsId: string | null;
  listingKey: string | null;
  status: string;
  propertyType: string;
  style: string;
  price: number | null;
  originalListPrice: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  yearBuilt: number | null;
  dom: number | null;
  latitude: number | null;
  longitude: number | null;
  photoCount: number | null;
  schools: {
    elementary: string | null;
    middle: string | null;
    high: string | null;
    district: string | null;
  };
  remarks: string;
  /** Static image URLs when not using MLS photo proxy. */
  photos: string[];
  /** When true, header and interest CTA never show the street address. */
  hideAddress?: boolean;
  /** When true, obfuscate the first two photos regardless of MLS status. */
  obfuscateFirstTwoPhotos?: boolean;
};

export const SPOTLIGHT_LISTING: SpotlightListingConfig = {
  id: "spotlight-42-treadwell",
  displayTitle: "Coming Soon...",
  displayLocation: "Westport, CT",
  address: {
    street: "42 Treadwell Avenue",
    city: "Westport",
    state: "Connecticut",
    postalCode: "06880",
  },
  /** Prior MLS # — Spotlight loads photos & remarks directly from SmartMLS (`?direct=1`). */
  mlsId: "170610470",
  listingKey: "0A2250293314619BE063D501100A3288",
  status: "Coming Soon",
  propertyType: "Single Family For Sale",
  style: "Farmhouse Colonial",
  price: null,
  originalListPrice: null,
  beds: 4,
  baths: 2,
  sqft: 1706,
  yearBuilt: 1900,
  dom: null,
  latitude: 41.1275,
  longitude: -73.345,
  photoCount: 38,
  schools: {
    elementary: "Greens Farms",
    middle: "Coleytown",
    high: "Staples",
    district: null,
  },
  remarks: "",
  photos: [],
  hideAddress: true,
  obfuscateFirstTwoPhotos: true,
};

/** Tab 2 — 11 Treadwell Avenue (address hidden on page; first two photos blurred). */
export const SPOTLIGHT_LISTING_TAB_2: SpotlightListingConfig = {
  id: "spotlight-11-treadwell",
  displayTitle: "Westport, CT",
  displayLocation: "Westport, CT",
  address: {
    street: "11 Treadwell Avenue",
    city: "Westport",
    state: "Connecticut",
    postalCode: "06880",
  },
  /** Resolved at runtime via address search when absent from SQLite. */
  mlsId: null,
  listingKey: null,
  status: "Active",
  propertyType: "Single Family For Sale",
  style: "",
  price: null,
  originalListPrice: null,
  beds: null,
  baths: null,
  sqft: null,
  yearBuilt: null,
  dom: null,
  latitude: null,
  longitude: null,
  photoCount: null,
  schools: {
    elementary: null,
    middle: null,
    high: null,
    district: null,
  },
  remarks: "",
  photos: [],
  hideAddress: true,
  obfuscateFirstTwoPhotos: true,
};

/** Tab 3 — 87 Kings Highway South, Westport (privacy defaults until Admin override). */
export const SPOTLIGHT_LISTING_TAB_3: SpotlightListingConfig = {
  id: "spotlight-87-kings-highway-s",
  displayTitle: "Westport, CT",
  displayLocation: "Westport, CT",
  address: {
    street: "87 Kings Highway South",
    city: "Westport",
    state: "Connecticut",
    postalCode: "06880",
  },
  /** Resolved at runtime via address search when absent from SQLite. */
  mlsId: null,
  listingKey: null,
  status: "Active",
  propertyType: "Single Family For Sale",
  style: "",
  price: null,
  originalListPrice: null,
  beds: null,
  baths: null,
  sqft: null,
  yearBuilt: null,
  dom: null,
  latitude: null,
  longitude: null,
  photoCount: null,
  schools: {
    elementary: null,
    middle: null,
    high: null,
    district: null,
  },
  remarks: "",
  photos: [],
  hideAddress: true,
  obfuscateFirstTwoPhotos: true,
};

const SPOTLIGHT_LISTINGS_BY_TAB: Record<SpotlightPropertyTabId, SpotlightListingConfig> =
  {
    1: SPOTLIGHT_LISTING,
    2: SPOTLIGHT_LISTING_TAB_2,
    3: SPOTLIGHT_LISTING_TAB_3,
  };

/** `?property=` value for tab 2+; tab 1 omits the param. */
export function spotlightPropertySearchParam(
  tab: SpotlightPropertyTabId,
): string | null {
  return tab === 1 ? null : String(tab);
}

export function parseSpotlightPropertyTab(
  value: string | null | undefined,
): SpotlightPropertyTabId {
  if (value === "2") return 2;
  if (value === "3") return 3;
  return 1;
}

export function getSpotlightListingConfig(
  tab: SpotlightPropertyTabId = 1,
): SpotlightListingConfig {
  return SPOTLIGHT_LISTINGS_BY_TAB[tab];
}
