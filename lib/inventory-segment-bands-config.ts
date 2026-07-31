import "server-only";

import { getSyncMeta as getSyncMetaFresh } from "@/lib/db/sync-meta";
import { getSyncMeta, setSyncMetaDurable } from "@/lib/db/sync-meta-store";
import {
  classifyInventoryMarketBand,
  cloneInventorySegmentBandsConfig,
  DEFAULT_INVENTORY_SEGMENT_BANDS,
  formatInventoryMarketBandLabel,
  isDefaultInventorySegmentBandsConfig,
  luxuryFloorFromConfig,
  luxuryStepsFromConfig,
  normalizeInventorySegmentBandsConfig,
  type InventorySegmentBandsConfig,
  type InventorySegmentId,
  type InventorySegmentDef,
} from "@/lib/inventory-segment-bands-shared";
import { closeFieldsFromListing, formatMlsStatus } from "@/lib/listing-history";
import { isRentalListing } from "@/lib/listing-kind";
import type { PriceBucketDef } from "@/lib/price-buckets-shared";

export const INVENTORY_SEGMENT_BANDS_SYNC_KEY = "intel_inventory_segment_bands";

export {
  DEFAULT_INVENTORY_SEGMENT_BANDS,
  isDefaultInventorySegmentBandsConfig,
  cloneInventorySegmentBandsConfig,
  luxuryFloorFromConfig,
  luxuryStepsFromConfig,
  type InventorySegmentBandsConfig,
  type InventorySegmentId,
  type InventorySegmentDef,
};

function parseConfig(raw: string | null): InventorySegmentBandsConfig {
  if (!raw) return cloneInventorySegmentBandsConfig();
  try {
    const parsed = normalizeInventorySegmentBandsConfig(JSON.parse(raw));
    return parsed.ok ? parsed.config : cloneInventorySegmentBandsConfig();
  } catch {
    return cloneInventorySegmentBandsConfig();
  }
}

/** Sync read from in-process sync_meta cache. */
export function getInventorySegmentBandsConfig(): InventorySegmentBandsConfig {
  return parseConfig(getSyncMeta(INVENTORY_SEGMENT_BANDS_SYNC_KEY));
}

/** Authoritative Postgres read. */
export async function getInventorySegmentBandsConfigFresh(): Promise<InventorySegmentBandsConfig> {
  try {
    return parseConfig(await getSyncMetaFresh(INVENTORY_SEGMENT_BANDS_SYNC_KEY));
  } catch {
    return getInventorySegmentBandsConfig();
  }
}

export async function getLuxuryInventoryStepsFresh(): Promise<PriceBucketDef[]> {
  return luxuryStepsFromConfig(await getInventorySegmentBandsConfigFresh());
}

export async function getLuxuryInventoryFloorFresh(): Promise<number> {
  return luxuryFloorFromConfig(await getInventorySegmentBandsConfigFresh());
}

export async function setInventorySegmentBandsConfig(
  input: unknown,
): Promise<InventorySegmentBandsConfig> {
  const normalized = normalizeInventorySegmentBandsConfig(input);
  if (!normalized.ok) throw new Error(normalized.error);
  await setSyncMetaDurable(
    INVENTORY_SEGMENT_BANDS_SYNC_KEY,
    JSON.stringify(normalized.config),
  );
  return normalized.config;
}

/**
 * Admin Market Band label for a listing (sale homes only).
 * Closed → closed price; otherwise list price. Rentals return null.
 */
export async function resolveMarketBandLabelForListing(listing: {
  status: string;
  price: number | null;
  propertyType?: string | null;
  statusChangeTimestamp?: string | null;
  raw?: Record<string, string> | null;
}): Promise<string | null> {
  if (
    isRentalListing({
      propertyType: listing.propertyType ?? "",
      raw: listing.raw ?? undefined,
    })
  ) {
    return null;
  }
  const isClosed = formatMlsStatus(listing.status) === "Closed";
  const { closePrice } = closeFieldsFromListing(listing);
  const price = isClosed ? (closePrice ?? listing.price) : listing.price;
  const config = await getInventorySegmentBandsConfigFresh();
  return formatInventoryMarketBandLabel(
    classifyInventoryMarketBand(price, config),
  );
}
