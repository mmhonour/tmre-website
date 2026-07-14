/**
 * TMRE Spotlight — featured listings on /spotlight (property tabs 1–3).
 * Edit this file to swap spotlight properties; tab 1 keeps the Coming Soon panel.
 */
export type SpotlightPropertyTabId = 1 | 2 | 3 | 4 | 5;

export const SPOTLIGHT_PROPERTY_TABS: SpotlightPropertyTabId[] = [1, 2, 3, 4, 5];

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
  /**
   * When true, the /spotlight header suppresses the MLS status badge. Used for
   * the Coming Soon tab (e.g. 42 Treadwell): the property is projected as
   * "Coming Soon" via the headline, and its true MLS status (Closed) should not
   * appear on the public page. The real listing page still shows actual status.
   */
  hideStatusBadge?: boolean;
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
  hideStatusBadge: true,
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
  mlsId: "24180824",
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
  mlsId: "24180781",
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

/**
 * Tabs 4 & 5 — open slots. Empty by default (no MLS id), so they stay hidden on
 * the public page until an MLS id is assigned in the Admin spotlight panel. The
 * town / address label is derived from the assigned listing's metadata.
 */
export const SPOTLIGHT_LISTING_TAB_4: SpotlightListingConfig = {
  id: "spotlight-slot-4",
  displayTitle: "Featured Property",
  displayLocation: "",
  address: {
    street: "",
    city: "",
    state: "Connecticut",
    postalCode: "",
  },
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

/** Tab 5 — open slot (see tab 4). */
export const SPOTLIGHT_LISTING_TAB_5: SpotlightListingConfig = {
  id: "spotlight-slot-5",
  displayTitle: "Featured Property",
  displayLocation: "",
  address: {
    street: "",
    city: "",
    state: "Connecticut",
    postalCode: "",
  },
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
    4: SPOTLIGHT_LISTING_TAB_4,
    5: SPOTLIGHT_LISTING_TAB_5,
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
  if (value === "4") return 4;
  if (value === "5") return 5;
  return 1;
}

export function getSpotlightListingConfig(
  tab: SpotlightPropertyTabId = 1,
): SpotlightListingConfig {
  return SPOTLIGHT_LISTINGS_BY_TAB[tab];
}

/** Reverse lookup: which tab a config belongs to (by its stable `id`). */
export function spotlightTabForConfigId(
  id: string,
): SpotlightPropertyTabId | null {
  const target = id.trim();
  for (const tab of SPOTLIGHT_PROPERTY_TABS) {
    if (SPOTLIGHT_LISTINGS_BY_TAB[tab].id === target) return tab;
  }
  return null;
}
