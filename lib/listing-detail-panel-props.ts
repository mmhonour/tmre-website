import {
  closeFieldsFromListing,
  formatMlsStatus,
  fmtDate,
} from "@/lib/listing-history";
import { parseLotAcresFromRaw } from "@/lib/listing-lot-acres";
import {
  formatPropertyTaxLabel,
  propertyTaxFromRaw,
} from "@/lib/listing-property-tax";
import { listingPhotosHref } from "@/lib/listing-url";
import { spotlightSectionHref } from "@/lib/spotlight-url";
import type { ListingDetailsSchoolsPanelProps } from "@/components/listing/ListingDetailsSchoolsPanel";
import type { ListingOverviewSchools } from "@/components/listing/ListingDetailsSchoolsPanel";

type ListingForDetailsPanel = {
  mlsId: string;
  address?: {
    street?: string | null;
    city?: string | null;
    full?: string | null;
  };
  townHint?: string | null;
  propertyTitle?: string | null;
  status: string;
  propertyType?: string | null;
  price: number | null;
  originalListPrice?: number | null;
  sqft?: number | null;
  lotAcres?: number | null;
  photoCount?: number | null;
  propertyTax?: number | null;
  propertyTaxYear?: string | null;
  schools?: ListingOverviewSchools;
  raw?: Record<string, string>;
};

function propertyTitleFromListing(listing: ListingForDetailsPanel): string {
  if (listing.propertyTitle?.trim()) return listing.propertyTitle.trim();
  const street =
    listing.address?.street?.trim() || listing.address?.full?.trim();
  if (street) return street;
  return listing.mlsId;
}

export type BuildListingDetailsPanelOpts = {
  routeBase?: "listing" | "spotlight";
  /** URL segment id (may differ from listing.mlsId when using listingKey). */
  listingId?: string;
  addressHint?: string | null;
  townHint?: string | null;
};

export function buildListingDetailsPanelProps(
  listing: ListingForDetailsPanel,
  fmtMoney: (n: number | null) => string,
  opts?: BuildListingDetailsPanelOpts,
): ListingDetailsSchoolsPanelProps {
  const statusLabel = formatMlsStatus(listing.status);
  const isClosed = statusLabel === "Closed";
  const isRental = /rental|for lease/i.test(listing.propertyType || "");
  const { closePrice, closeDate } = closeFieldsFromListing({
    status: listing.status,
    price: listing.price,
    raw: listing.raw,
  });
  const soldPrice = closePrice ?? (isClosed ? listing.price : null);
  const reductionPct =
    listing.price &&
    listing.originalListPrice &&
    listing.originalListPrice > listing.price
      ? Math.round(
          ((listing.originalListPrice - listing.price) / listing.originalListPrice) *
            100,
        )
      : null;
  const priceForPpsf = isClosed ? soldPrice : listing.price;
  const ppsf =
    !isRental && priceForPpsf && listing.sqft && listing.sqft > 0
      ? Math.round(priceForPpsf / listing.sqft)
      : null;
  const taxFromRaw = propertyTaxFromRaw(listing.raw);
  const annualPropertyTax =
    listing.propertyTax ?? taxFromRaw.annualAmount;
  const propertyTaxYear =
    listing.propertyTaxYear ?? taxFromRaw.yearLabel;
  const routeBase = opts?.routeBase ?? "listing";
  const street =
    listing.address?.street?.trim() ||
    listing.address?.full?.trim() ||
    opts?.addressHint?.trim() ||
    null;
  const town =
    opts?.townHint ?? listing.townHint ?? listing.address?.city ?? null;
  const photosHref =
    routeBase === "spotlight"
      ? spotlightSectionHref("photos")
      : listingPhotosHref(opts?.listingId ?? listing.mlsId, street, town);
  const lotAcres =
    listing.lotAcres ?? parseLotAcresFromRaw(listing.raw) ?? null;

  return {
    mlsId: listing.mlsId,
    propertyTitle: propertyTitleFromListing(listing),
    townHint: listing.townHint ?? listing.address?.city ?? null,
    isClosed,
    isRental,
    soldPrice,
    closeDate,
    price: listing.price,
    originalListPrice: listing.originalListPrice ?? null,
    reductionPct,
    ppsf,
    lotAcres,
    annualPropertyTax,
    propertyTaxLabel: formatPropertyTaxLabel(propertyTaxYear),
    photoCount: listing.photoCount ?? 0,
    photosHref,
    schools: listing.schools ?? {
      elementary: null,
      middle: null,
      high: null,
      district: null,
    },
    fmtMoney,
    fmtDate,
  };
}
