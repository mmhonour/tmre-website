import 'server-only'

import { readListingByIdFromDb } from '@/lib/db/listings-repo'
import { fetchListingByMlsId } from '@/lib/listings-store'
import { spotlightEffectiveStatus } from '@/lib/spotlight-display'
import {
  SPOTLIGHT_LISTING,
  type SpotlightListingConfig,
} from '@/lib/spotlight-listing'
import { resolveSpotlightMlsId, spotlightConfigMlsId } from '@/lib/spotlight-mls-cache'
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

/** DB-first spotlight subject for comps / IF — avoids RETS + photo cache on API routes. */
export async function resolveSpotlightSubjectListing(
  config: SpotlightListingConfig = SPOTLIGHT_LISTING,
): Promise<Listing> {
  const mlsId = spotlightConfigMlsId(config)
  if (!mlsId) {
    const resolved = await resolveSpotlightMlsId(config)
    if (!resolved) {
      return buildSpotlightSubjectListing(null, config)
    }
    const cached = await readListingByIdFromDb(resolved)
    if (cached) {
      return buildSpotlightSubjectListing(cached, {
        ...config,
        mlsId: resolved,
      })
    }
    try {
      const { listing } = await fetchListingByMlsId(resolved)
      return buildSpotlightSubjectListing(listing, {
        ...config,
        mlsId: resolved,
      })
    } catch (err) {
      console.warn('[spotlight-subject] MLS lookup failed — using config fallback', err)
      return buildSpotlightSubjectListing(null, {
        ...config,
        mlsId: resolved,
      })
    }
  }

  const cached = await readListingByIdFromDb(mlsId)
  if (cached) {
    return buildSpotlightSubjectListing(cached, config)
  }

  try {
    const { listing } = await fetchListingByMlsId(mlsId)
    return buildSpotlightSubjectListing(listing, config)
  } catch (err) {
    console.warn('[spotlight-subject] MLS lookup failed — using config fallback', err)
    return buildSpotlightSubjectListing(null, config)
  }
}
