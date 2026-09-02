import { isRentalListing } from "@/lib/listing-kind";
import {
  primaryListingPrice,
  primaryListingPriceIsClosed,
} from "@/lib/listing-history";
import { formatLotAcresLabel } from "@/lib/listing-lot-acres";

type InsightListing = {
  status: string;
  propertyType: string;
  price: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  lotAcres: number | null;
  raw?: Record<string, string>;
};

function fmtUsd(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function fmtCount(n: number): string {
  return Number.isInteger(n) ? String(n) : String(n);
}

function pricePhrase(listing: InsightListing): string | null {
  const price = primaryListingPrice(listing);
  if (price == null || price <= 0) return null;
  const amount = fmtUsd(price);
  if (isRentalListing(listing)) return `offered at ${amount} a month`;
  if (primaryListingPriceIsClosed(listing)) return `sold for ${amount}`;
  return `offered at ${amount}`;
}

/**
 * Showcase-only facts line shown under the shared `buildInsight` copy.
 * Price sits in the same sentence as beds, baths, sqft and acres.
 */
export function showcaseListingFactsProse(
  listing: InsightListing,
): string | null {
  const parts: string[] = [];
  if (listing.beds != null && listing.beds > 0) {
    parts.push(
      listing.beds === 1 ? "1 bedroom" : `${fmtCount(listing.beds)} bedrooms`,
    );
  }
  if (listing.baths != null && listing.baths > 0) {
    parts.push(
      listing.baths === 1
        ? "1 bathroom"
        : `${fmtCount(listing.baths)} bathrooms`,
    );
  }
  const size: string[] = [];
  if (listing.sqft != null && listing.sqft > 0) {
    size.push(`${listing.sqft.toLocaleString("en-US")} square feet`);
  }
  const acres = formatLotAcresLabel(listing.lotAcres);
  if (acres) size.push(size.length ? `on ${acres}` : acres);
  if (size.length) parts.push(size.join(" "));
  const price = pricePhrase(listing);
  if (price) parts.push(price);

  if (parts.length === 0) return null;
  if (parts.length === 1) return `${capitalize(parts[0])}.`;

  const last = parts.pop()!;
  return `${capitalize(parts.join(", "))}, ${last}.`;
}

function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}
