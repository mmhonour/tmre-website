import { listingZipMatchesTown, type TmreTown } from "@/lib/tmre-towns";
import type { MedianListingRow } from "@/app/stats/MedianPriceListingsTable";

type TxFilter = "all" | "sale" | "rental";
type ClsFilter = "all" | "residential" | "commercial";
type SalePropertyFilter = "all" | "homes" | "multi" | "condos";

type ApiListing = {
  mlsId: string;
  listingKey?: string;
  propertyType: string;
  address: {
    street: string;
    full: string;
    city: string;
    postalCode?: string | null;
  };
  price: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  listDate?: string | null;
  calculated: {
    daysOnMarket: number | null;
  };
};

function isRentalType(propertyType: string): boolean {
  return /rental|for lease/i.test(propertyType);
}

function isCommercialType(propertyType: string): boolean {
  return /commercial|industrial|business/i.test(propertyType);
}

function isCondoPropertyType(propertyType: string): boolean {
  return /condo|co-op/i.test(propertyType);
}

function isMultiFamilyPropertyType(propertyType: string): boolean {
  return /multi|duplex|triplex|fourplex|2-family|3-family|4-family/i.test(propertyType);
}

function isHomePropertyType(propertyType: string): boolean {
  if (isCommercialType(propertyType)) return false;
  if (isCondoPropertyType(propertyType)) return false;
  if (isMultiFamilyPropertyType(propertyType)) return false;
  return true;
}

function median(nums: number[]): number | null {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m];
}

function mapAndFilter(
  api: ApiListing[],
  townName: TmreTown,
  options: {
    tx: TxFilter;
    cls: ClsFilter;
    zip: string | null;
    saleProperty: SalePropertyFilter;
  },
): MedianListingRow[] {
  const rows: MedianListingRow[] = [];

  for (const l of api) {
    if (l.price == null || l.price <= 0) continue;
    const zip = l.address.postalCode ?? null;
    if (!listingZipMatchesTown(zip, townName)) continue;

    const rental = isRentalType(l.propertyType);
    const commercial = isCommercialType(l.propertyType);

    if (options.tx === "sale" && rental) continue;
    if (options.tx === "rental" && !rental) continue;
    if (options.cls === "residential" && commercial) continue;
    if (options.cls === "commercial" && !commercial) continue;
    if (options.zip && zip !== options.zip) continue;
    if (options.saleProperty !== "all" && !rental && !commercial) {
      if (options.saleProperty === "homes" && !isHomePropertyType(l.propertyType)) continue;
      if (options.saleProperty === "multi" && !isMultiFamilyPropertyType(l.propertyType)) continue;
      if (options.saleProperty === "condos" && !isCondoPropertyType(l.propertyType)) continue;
    }

    rows.push({
      mlsId: l.mlsId,
      listingKey: l.listingKey ?? null,
      town: townName,
      address: l.address.street || l.address.full,
      price: l.price,
      closedPrice: null,
      listDate: l.listDate ?? null,
      dom: l.calculated.daysOnMarket,
      sqft: l.sqft,
      beds: l.beds,
      baths: l.baths,
    });
  }

  return rows.sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
}

export async function fetchActiveMedianListings(
  city: TmreTown,
  options: {
    tx?: TxFilter;
    cls?: ClsFilter;
    zip?: string | null;
    saleProperty?: SalePropertyFilter;
  } = {},
): Promise<{ rows: MedianListingRow[]; medianPrice: number | null }> {
  const res = await fetch(
    `/api/listings?city=${encodeURIComponent(city)}&status=Active&limit=250`,
    { cache: "no-store" },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = (await res.json()) as { listings: ApiListing[] };
  const rows = mapAndFilter(body.listings, city, {
    tx: options.tx ?? "all",
    cls: options.cls ?? "all",
    zip: options.zip ?? null,
    saleProperty: options.saleProperty ?? "all",
  });
  return {
    rows,
    medianPrice: median(
      rows.map((r) => r.price).filter((p): p is number => p != null && p > 0),
    ),
  };
}
