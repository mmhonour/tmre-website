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

function priceSentence(listing: InsightListing): string | null {
  const price = primaryListingPrice(listing);
  if (price == null || price <= 0) return null;
  const amount = fmtUsd(price);
  if (isRentalListing(listing)) return `Asking ${amount} a month.`;
  if (primaryListingPriceIsClosed(listing)) return `Sold for ${amount}.`;
  return `Listed at ${amount}.`;
}

function specsSentence(listing: InsightListing): string | null {
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
  if (listing.sqft != null && listing.sqft > 0) {
    parts.push(`${listing.sqft.toLocaleString("en-US")} square feet`);
  }
  const acres = formatLotAcresLabel(listing.lotAcres);
  if (acres) parts.push(`on ${acres}`);

  if (parts.length === 0) return null;
  if (parts.length === 1) return `${capitalize(parts[0])}.`;
  const last = parts.pop()!;
  const lead = parts.join(", ");
  const joiner = last.startsWith("on ") ? " " : ", and ";
  return `${capitalize(lead)}${joiner}${last}.`;
}

function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

/**
 * Showcase-only lead: price, beds, baths, sqft and acres as prose, then the
 * same `buildInsight` string every other surface already shows. Does not
 * change `lib/goldilocks.ts`.
 */
export function showcaseInsightText(
  listing: InsightListing,
  sharedInsight: string | null,
): string | null {
  const facts = [priceSentence(listing), specsSentence(listing)]
    .filter((s): s is string => Boolean(s))
    .join(" ");
  const insight = sharedInsight?.trim() ?? "";
  if (!facts && !insight) return null;
  if (!facts) return insight;
  if (!insight) return facts;
  return `${facts} ${insight}`;
}
