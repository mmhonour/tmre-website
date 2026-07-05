/**
 * TMRE Spotlight — one featured listing at a time.
 * Edit this file to swap the spotlight property; the public page never shows the street address.
 */
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
};
