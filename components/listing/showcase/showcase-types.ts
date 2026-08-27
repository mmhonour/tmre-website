/** Listing fields the showcase page reads from `/api/listings/{mlsId}?photos=0`. */
export type ShowcaseListing = {
  mlsId: string;
  listingKey: string;
  status: string;
  propertyType: string;
  style: string;
  address: {
    street: string;
    unit: string;
    city: string;
    state: string;
    postalCode: string;
    full: string;
  };
  price: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  yearBuilt: number | null;
  dom: number | null;
  latitude: number | null;
  longitude: number | null;
  /** Denormalised at sync — do not re-derive these from `raw` on the client. */
  lotAcres: number | null;
  propertyTax: number | null;
  propertyTaxYear: string | null;
  modificationTimestamp: string | null;
  photoCount: number | null;
  remarks: string | null;
  schools: {
    elementary: string | null;
    middle: string | null;
    high: string | null;
    district: string | null;
  };
  raw: Record<string, string>;
};

export type ShowcaseDetailRow = { label: string; value: string };
