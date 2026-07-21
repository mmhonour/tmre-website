import 'server-only'

import { readListingByIdFromDb } from '@/lib/db/listings-repo'
import { fetchListingByMlsId } from '@/lib/listings-store'
import { spotlightEffectiveStatus } from '@/lib/spotlight-display'
import {
  SPOTLIGHT_LISTING,
  type SpotlightListingConfig,
} from '@/lib/spotlight-listing'
import { resolveSpotlightMlsId } from '@/lib/spotlight-mls-cache'
import type { Listing } from '@/lib/rets'

function listingFromConfig(config: SpotlightListingConfig): Listing {
  return {
    mlsId: config.mlsId?.trim() || config.id,
    listingKey: config.listingKey ?? '',
    status: config.status,
    propertyType: config.propertyType,
    style: config.style,
    address: {
      street: config.address.street,
      unit: '',
      city: config.address.city,
      state: config.address.state,
      postalCode: config.address.postalCode,
      full: config.address.street,
    },
    price: config.price,
    originalListPrice: config.originalListPrice,
    beds: config.beds,
    baths: config.baths,
    sqft: config.sqft,
    lotAcres: null,
    yearBuilt: config.yearBuilt,
    dom: config.dom,
    listDate: null,
    modificationTimestamp: null,
    priceChangeTimestamp: null,
    statusChangeTimestamp: null,
    latitude: config.latitude,
    longitude: config.longitude,
    photoCount: config.photoCount,
    ownerName: null,
    remarks: config.remarks || null,
    schools: config.schools,
    raw: {},
  }
}

/** MLS reference row merged with spotlight config for comps / IF subject. */
export function buildSpotlightSubjectListing(
  mls: Listing | null,
  config: SpotlightListingConfig = SPOTLIGHT_LISTING,
): Listing {
  const base = mls ?? listingFromConfig(config)

  // When a live MLS row is present, it wins for listing facts. Config only fills
  // gaps (and supplies curated display fields like city for privacy).
  if (mls) {
    return {
      ...mls,
      mlsId: config.mlsId?.trim() || mls.mlsId,
      listingKey: mls.listingKey?.trim() || config.listingKey?.trim() || mls.listingKey,
      status: spotlightEffectiveStatus(config, mls),
      propertyType: mls.propertyType || config.propertyType,
      style: mls.style || config.style,
      beds: mls.beds ?? config.beds,
      baths: mls.baths ?? config.baths,
      sqft: mls.sqft ?? config.sqft,
      yearBuilt: mls.yearBuilt ?? config.yearBuilt,
      price: mls.price ?? config.price,
      originalListPrice: mls.originalListPrice ?? config.originalListPrice,
      latitude: mls.latitude ?? config.latitude,
      longitude: mls.longitude ?? config.longitude,
      photoCount: mls.photoCount ?? config.photoCount,
      schools: {
        elementary: mls.schools.elementary ?? config.schools.elementary,
        middle: mls.schools.middle ?? config.schools.middle,
        high: mls.schools.high ?? config.schools.high,
        district: mls.schools.district ?? config.schools.district,
      },
      address: {
        ...mls.address,
        city: mls.address.city || config.address.city,
        state: mls.address.state || config.address.state,
        postalCode: mls.address.postalCode || config.address.postalCode,
      },
    }
  }

  return {
    ...base,
    mlsId: config.mlsId?.trim() || base.mlsId,
    listingKey: config.listingKey?.trim() || base.listingKey,
    status: spotlightEffectiveStatus(config, mls),
    propertyType: config.propertyType || base.propertyType,
    style: config.style || base.style,
    beds: config.beds ?? base.beds,
    baths: config.baths ?? base.baths,
    sqft: config.sqft ?? base.sqft,
    yearBuilt: config.yearBuilt ?? base.yearBuilt,
    price: config.price ?? base.price,
    originalListPrice: config.originalListPrice ?? base.originalListPrice,
    latitude: config.latitude ?? base.latitude,
    longitude: config.longitude ?? base.longitude,
    photoCount: config.photoCount ?? base.photoCount,
    schools: {
      elementary: config.schools.elementary ?? base.schools.elementary,
      middle: config.schools.middle ?? base.schools.middle,
      high: config.schools.high ?? base.schools.high,
      district: config.schools.district ?? base.schools.district,
    },
    address: {
      ...base.address,
      city: config.address.city || base.address.city,
      state: config.address.state || base.address.state,
      postalCode: config.address.postalCode || base.address.postalCode,
    },
  }
}

/** DB-first spotlight subject for comps / IF — live RETS when DB is missing or Closed. */
export async function resolveSpotlightSubjectListing(
  config: SpotlightListingConfig = SPOTLIGHT_LISTING,
): Promise<Listing> {
  // Always resolve MLS id from Postgres (admin overrides), never the per-process
  // sync_meta cache — otherwise a warm Lambda can serve a stale spotlight slot.
  const mlsId = await resolveSpotlightMlsId(config)
  if (!mlsId) {
    return buildSpotlightSubjectListing(null, config)
  }

  const withMls = { ...config, mlsId }
  const cached = await readListingByIdFromDb(mlsId)
  const status = (cached?.status || '').toLowerCase()
  const dbLooksInactive =
    !cached ||
    status.includes('closed') ||
    status.includes('expired') ||
    status.includes('withdrawn')

  if (cached && !dbLooksInactive) {
    return buildSpotlightSubjectListing(cached, withMls)
  }

  try {
    const { listing } = await fetchListingByMlsId(mlsId)
    // fetchListingByMlsId is DB-first — if DB had a Closed row it returns that.
    // Force a live RETS pull when the cached row looks inactive.
    if (dbLooksInactive) {
      const { getListingByMlsId } = await import('@/lib/rets')
      const live = await getListingByMlsId(mlsId)
      if (live) {
        return buildSpotlightSubjectListing(live, withMls)
      }
    }
    return buildSpotlightSubjectListing(listing, withMls)
  } catch (err) {
    console.warn('[spotlight-subject] MLS lookup failed — using config fallback', err)
    return buildSpotlightSubjectListing(cached ?? null, withMls)
  }
}
