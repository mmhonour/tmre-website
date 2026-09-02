import { isRentalListing } from "@/lib/listing-kind";
import {
  primaryListingPrice,
  primaryListingPriceIsClosed,
} from "@/lib/listing-history";
import { coerceLotAcres } from "@/lib/listing-lot-acres";

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

function unit(n: number, singular: string, plural: string): string {
  return `${fmtCount(n)} ${n <= 1 ? singular : plural}`;
}

/** 1040 → `1.04k sqft`; under 1,000 stays as the full count. */
function fmtSqftCompact(sqft: number): string {
  if (sqft < 1000) return `${sqft.toLocaleString("en-US")} sqft`;
  const k = sqft / 1000;
  const label = k
    .toFixed(2)
    .replace(/\.?0+$/, "");
  return `${label}k sqft`;
}

/** `.14 acres` when under 1; `1.5 acres` / `1 acre` otherwise. */
function fmtAcresCompact(acres: number): string {
  if (acres < 0.01) return "<.01 acres";
  const digits = acres < 10 ? 2 : 1;
  let label = acres.toFixed(digits).replace(/0+$/, "").replace(/\.$/, "");
  if (label.startsWith("0.")) label = label.slice(1);
  const unitLabel = acres === 1 ? "acre" : "acres";
  return `${label} ${unitLabel}`;
}

function priceLead(listing: InsightListing): string | null {
  const price = primaryListingPrice(listing);
  if (price == null || price <= 0) return null;
  const amount = fmtUsd(price);
  if (isRentalListing(listing)) return `${amount}/mo`;
  if (primaryListingPriceIsClosed(listing)) return amount;
  return amount;
}

/**
 * Showcase-only facts line under the shared `buildInsight` copy.
 * `$1,500,000, 3 beds, 2 baths, 1.04k sqft, sitting on .14 acres`
 */
export function showcaseListingFactsProse(
  listing: InsightListing,
): string | null {
  const parts: string[] = [];
  const price = priceLead(listing);
  if (price) parts.push(price);
  if (listing.beds != null && listing.beds > 0) {
    parts.push(unit(listing.beds, "bed", "beds"));
  }
  if (listing.baths != null && listing.baths > 0) {
    parts.push(unit(listing.baths, "bath", "baths"));
  }
  if (listing.sqft != null && listing.sqft > 0) {
    parts.push(fmtSqftCompact(listing.sqft));
  }
  const acres = coerceLotAcres(listing.lotAcres);
  if (acres != null && acres > 0) {
    parts.push(`sitting on ${fmtAcresCompact(acres)}`);
  }
  return parts.length ? parts.join(", ") : null;
}
