import {
  coalesceListingStatus,
  formatMlsStatus,
} from "@/lib/listing-history";
import {
  SPOTLIGHT_LISTING,
  type SpotlightListingConfig,
} from "@/lib/spotlight-listing";

const REMARKS_KEYS = ["PublicRemarks", "RemarksPublicAddendum"];

/** Interest CTA follows the effective public status (`display.status`, i.e. the real RETS status). */
export function spotlightAllowsInterest(display: { status: string }): boolean {
  const status = formatMlsStatus(display.status);
  return status !== "Closed" && status !== "Withdrawn" && status !== "Expired";
}

/**
 * Public status is the real MLS/Postgres (RETS) status site-wide. Config status
 * is only a fallback for open slots that have no assigned MLS listing yet.
 */
export function spotlightEffectiveStatus(
  config: SpotlightListingConfig,
  mls:
    | {
        status?: string | null;
        raw?: Record<string, string> | null;
      }
    | null
    | undefined,
): string {
  const coalesced = coalesceListingStatus(
    mls?.status ?? mls?.raw?.MLSStatus,
    mls?.raw?.StandardStatus,
  )
  const mlsStatus = coalesced?.trim() || mls?.status?.trim();
  return mlsStatus || config.status;
}

/**
 * Coming Soon UX (title, blur) follows live MLS status — not the static config
 * string. Admin `clearComingSoon` forces live treatment.
 */
export function spotlightListingIsComingSoon(
  config: SpotlightListingConfig,
  mls: { status?: string | null } | null | undefined,
  privacy?: { clearComingSoon?: boolean } | null,
): boolean {
  if (privacy?.clearComingSoon === true) return false;
  return formatMlsStatus(spotlightEffectiveStatus(config, mls)) === "Coming Soon";
}

/** Drop a stale "Coming Soon..." title once the listing is live. */
export function spotlightEffectiveDisplayTitle(
  config: SpotlightListingConfig,
  mls: { status?: string | null } | null | undefined,
  privacy?: { clearComingSoon?: boolean } | null,
): string {
  if (
    !spotlightListingIsComingSoon(config, mls, privacy) &&
    /^coming\s*soon/i.test(config.displayTitle.trim())
  ) {
    return (
      config.displayLocation.trim() ||
      config.address.city.trim() ||
      "Featured listing"
    );
  }
  return config.displayTitle;
}

/** 0-based photo indices hidden before a Coming Soon listing goes live. */
export const SPOTLIGHT_COMING_SOON_OBFUSCATED_PHOTO_INDICES = [0, 1] as const;

function spotlightIsComingSoon(config: SpotlightListingConfig): boolean {
  return formatMlsStatus(config.status) === "Coming Soon";
}

/** Hide identifying details in lead exterior photos before go-live. */
export function spotlightObfuscatesPhoto(
  config: SpotlightListingConfig,
  photoIndex: number,
): boolean {
  if (config.obfuscateFirstTwoPhotos) {
    return (
      SPOTLIGHT_COMING_SOON_OBFUSCATED_PHOTO_INDICES as readonly number[]
    ).includes(photoIndex);
  }
  if (!spotlightIsComingSoon(config)) return false;
  return (
    SPOTLIGHT_COMING_SOON_OBFUSCATED_PHOTO_INDICES as readonly number[]
  ).includes(photoIndex);
}

/** @deprecated Prefer `spotlightObfuscatesPhoto(config, index)`. */
export function spotlightObfuscatesFirstPhoto(
  config: SpotlightListingConfig,
): boolean {
  return spotlightObfuscatesPhoto(config, 0);
}

export type SpotlightMlsListing = {
  mlsId?: string;
  listingKey?: string | null;
  status?: string;
  propertyType?: string;
  style?: string;
  price?: number | null;
  originalListPrice?: number | null;
  beds?: number | null;
  baths?: number | null;
  sqft?: number | null;
  yearBuilt?: number | null;
  dom?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  photoCount?: number | null;
  propertyTax?: number | null;
  propertyTaxYear?: string | null;
  lotAcres?: number | null;
  remarks?: string | null;
  schools?: SpotlightListingConfig["schools"];
  address?: {
    street?: string;
    full?: string;
    city?: string;
    state?: string;
    postalCode?: string;
  };
  raw?: Record<string, string>;
};

export type SpotlightDisplay = {
  config: SpotlightListingConfig;
  mlsId: string;
  listingKey: string | null;
  status: string;
  dom: number | null;
  headerAddress: {
    street: string;
    full: string;
    city: string;
    state: string;
    postalCode: string;
  };
  propertyType: string;
  style: string;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  yearBuilt: number | null;
  price: number | null;
  originalListPrice: number | null;
  photoCount: number;
  remarks: string | null;
  schools: SpotlightListingConfig["schools"];
  latitude: number | null;
  longitude: number | null;
  mapsQuery: string;
  intelligenceListing: {
    propertyType: string;
    style?: string | null;
    beds: number | null;
    baths: number | null;
    yearBuilt?: number | null;
    address: { city: string; postalCode?: string | null };
    raw?: Record<string, string>;
  };
};

function pickNumber(
  primary: number | null | undefined,
  fallback: number | null | undefined,
): number | null {
  return primary ?? fallback ?? null;
}

/**
 * Open slots (tabs 4 & 5, and any config with a blank displayLocation) get their
 * public town label from the assigned listing's metadata. Town-level only, so it
 * stays privacy-safe. Configured slots (1–3) keep their curated titles.
 */
export function spotlightEffectiveConfig(
  config: SpotlightListingConfig,
  mls: SpotlightMlsListing | null,
): SpotlightListingConfig {
  const isOpenSlot = config.displayLocation.trim() === "";
  const city = mls?.address?.city?.trim() ?? "";
  if (!isOpenSlot || !city) return config;
  const townLabel = `${city}, CT`;
  return {
    ...config,
    displayTitle: townLabel,
    displayLocation: townLabel,
    address: {
      ...config.address,
      city,
      postalCode: mls?.address?.postalCode?.trim() || config.address.postalCode,
    },
  };
}

function remarksFromListing(
  config: SpotlightListingConfig,
  mls: SpotlightMlsListing | null,
): string | null {
  const fromField = mls?.remarks?.trim() || config.remarks?.trim();
  if (fromField) return fromField;
  const raw = mls?.raw;
  if (!raw) return null;
  const joined = REMARKS_KEYS.map((k) => raw[k]).filter(Boolean).join("\n\n");
  return joined || null;
}

export function buildSpotlightDisplay(
  rawConfig: SpotlightListingConfig = SPOTLIGHT_LISTING,
  mls: SpotlightMlsListing | null = null,
): SpotlightDisplay {
  const config = spotlightEffectiveConfig(rawConfig, mls);
  const mlsId = mls?.mlsId?.trim() || config.mlsId?.trim() || config.id;
  const schools = mls?.schools ?? config.schools;

  return {
    config,
    mlsId,
    listingKey: mls?.listingKey ?? config.listingKey,
    status: spotlightEffectiveStatus(config, mls),
    dom: pickNumber(mls?.dom, config.dom),
    headerAddress: {
      street: spotlightEffectiveDisplayTitle(config, mls),
      full: spotlightEffectiveDisplayTitle(config, mls),
      city: config.hideAddress ? "" : config.displayLocation,
      state: "",
      postalCode: "",
    },
    propertyType: mls?.propertyType ?? config.propertyType,
    style: mls?.style ?? config.style,
    beds: pickNumber(mls?.beds, config.beds),
    baths: pickNumber(mls?.baths, config.baths),
    sqft: pickNumber(mls?.sqft, config.sqft),
    yearBuilt: pickNumber(mls?.yearBuilt, config.yearBuilt),
    price: config.price ?? mls?.price ?? null,
    originalListPrice: config.originalListPrice ?? mls?.originalListPrice ?? null,
    photoCount: mls?.photoCount ?? config.photoCount ?? 0,
    remarks: remarksFromListing(config, mls),
    schools,
    latitude: pickNumber(mls?.latitude, config.latitude),
    longitude: pickNumber(mls?.longitude, config.longitude),
    mapsQuery: config.displayLocation,
    intelligenceListing: {
      propertyType: mls?.propertyType ?? config.propertyType,
      style: mls?.style ?? config.style,
      beds: pickNumber(mls?.beds, config.beds),
      baths: pickNumber(mls?.baths, config.baths),
      yearBuilt: pickNumber(mls?.yearBuilt, config.yearBuilt),
      address: {
        city: config.address.city,
        postalCode: config.address.postalCode,
      },
      raw: mls?.raw,
    },
  };
}
