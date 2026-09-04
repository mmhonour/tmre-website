import type { ReactNode } from "react";
import type { DealBoardMapListing } from "@/components/intelligence/DealBoardMap";
import type { ListingTab } from "@/components/listing/ListingSubnav";
import type { ShowcaseDetailRow, ShowcaseListing } from "@/components/listing/showcase/showcase-types";
import { formatMlsStatus } from "@/lib/listing-history";

export type ShowcaseRouteBase = "listing" | "spotlight";

export type ShowcaseMapPresentation = {
  latitude: number | null;
  longitude: number | null;
  hidePin: boolean;
  outlineTown: string | null;
  defaultZoom: number;
  addressQuery: string;
  postalCode: string | null;
};

export type ShowcaseInterest = {
  mlsId: string;
  address: string;
  city: string | null;
};

export type ShowcaseHeaderAddress = {
  street: string;
  full: string;
  city: string;
  state: string;
  postalCode: string;
};

/**
 * Host contract for the shared listing showcase view.
 * Listing fills this with the live address; Spotlight fills it from
 * `SpotlightPresentation` so privacy / slots / Coming Soon stay authoritative.
 */
export type ShowcaseHost = {
  routeBase: ShowcaseRouteBase;
  headline: string;
  locationLine: string;
  photoAlt: string;
  street: string;
  city: string;
  addressHint: string | null;
  townHint: string | null;
  ifAddressHint: string | null;
  privacyMode: boolean;
  hideStatusBadge: boolean;
  headerAddress: ShowcaseHeaderAddress;
  adminAddress: {
    city?: string;
    state?: string;
    postalCode?: string;
  } | null;
  shareHref: string | null;
  showClassicViewLink: boolean;
  /** Canonical showcase URL (listing page, or /spotlight). */
  showcaseViewHref?: string | null;
  /** Classic chrome (`?panel=production` or `?view=classic`). */
  classicViewHref?: string | null;
  interest: ShowcaseInterest | null;
  obfuscatePhoto: (index: number) => boolean;
  showHero: boolean;
  map: ShowcaseMapPresentation;
  hideMlsNumber: boolean;
  compsFetchUrl?: string | null;
  rentalCompsFetchUrl?: string | null;
  uagFetchUrl?: string | null;
  propertyTabs?: ReactNode;
  /** Open this section after mount (deep links from /spotlight/photos etc.). */
  initialTab?: ListingTab | null;
};

export function fmtShowcaseMoney(n: number | null): string | null {
  if (n == null || !Number.isFinite(n) || n <= 0) return null;
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

export function fmtShowcaseAcres(acres: number | null): string | null {
  if (acres == null || acres <= 0) return null;
  return `${acres.toFixed(acres < 1 ? 2 : 1)} acres`;
}

export function buildShowcaseDetailRows(
  listing: ShowcaseListing,
  opts?: { hideMlsNumber?: boolean },
): ShowcaseDetailRow[] {
  const status = formatMlsStatus(listing.status);
  const rows: ShowcaseDetailRow[] = [
    { label: "Lot", value: fmtShowcaseAcres(listing.lotAcres) ?? "—" },
  ];
  if (!opts?.hideMlsNumber) {
    rows.push({ label: "MLS #", value: listing.mlsId });
  }
  rows.push(
    { label: "Status", value: status },
    { label: "Type", value: listing.propertyType || "—" },
    { label: "Style", value: listing.style || "—" },
    {
      label: "Days on market",
      value: listing.dom != null ? String(listing.dom) : "—",
    },
    {
      label: listing.propertyTaxYear
        ? `Taxes (${listing.propertyTaxYear})`
        : "Taxes",
      value: fmtShowcaseMoney(listing.propertyTax) ?? "—",
    },
    { label: "Elementary", value: listing.schools.elementary || "—" },
    { label: "High school", value: listing.schools.high || "—" },
  );
  return rows;
}

export function showcaseMapSubject(
  listing: ShowcaseListing,
  host: Pick<ShowcaseHost, "map" | "street" | "city">,
  extras: {
    price: number;
    score: number;
    isRental: boolean;
  },
): DealBoardMapListing | null {
  if (host.map.hidePin) return null;
  if (listing.latitude == null || listing.longitude == null) return null;
  return {
    key: listing.listingKey || listing.mlsId,
    address: host.street,
    city: host.city,
    price: extras.price,
    score: extras.score,
    isRental: extras.isRental,
    beds: listing.beds,
    baths: listing.baths,
    sqft: listing.sqft,
    latitude: listing.latitude,
    longitude: listing.longitude,
    photoCount: listing.photoCount,
  };
}

/** Defaults that match today's listing showcase (no privacy, listing routes). */
export function listingShowcaseHostDefaults(): Pick<
  ShowcaseHost,
  | "routeBase"
  | "privacyMode"
  | "hideStatusBadge"
  | "showClassicViewLink"
  | "obfuscatePhoto"
  | "showHero"
  | "hideMlsNumber"
> {
  return {
    routeBase: "listing",
    privacyMode: false,
    hideStatusBadge: false,
    showClassicViewLink: true,
    obfuscatePhoto: () => false,
    showHero: true,
    hideMlsNumber: false,
  };
}
