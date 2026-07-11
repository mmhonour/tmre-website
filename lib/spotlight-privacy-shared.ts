import type { GeoPoint } from '@/lib/tmre-geo'
import { TOWN_CENTERS } from '@/lib/tmre-geo'
import type { SpotlightListingConfig, SpotlightPropertyTabId } from '@/lib/spotlight-listing'
import { SPOTLIGHT_PROPERTY_TABS } from '@/lib/spotlight-listing'
import {
  SPOTLIGHT_COMING_SOON_OBFUSCATED_PHOTO_INDICES,
  type SpotlightMlsListing,
} from '@/lib/spotlight-display'
import { isTmreTown } from '@/lib/tmre-towns'

/** Admin overrides — all default off (privacy mode on). */
export type SpotlightPrivacyTabOverrides = {
  showAddress?: boolean
  showClearPhotos?: boolean
  showPropertyMap?: boolean
}

export type SpotlightPrivacyOverrides = Partial<
  Record<SpotlightPropertyTabId, SpotlightPrivacyTabOverrides>
>

export type SpotlightEffectivePrivacy = {
  showAddress: boolean
  showClearPhotos: boolean
  showPropertyMap: boolean
}

export const SPOTLIGHT_TOWN_MAP_ZOOM = 13
export const SPOTLIGHT_PROPERTY_MAP_ZOOM = 15

export function emptySpotlightPrivacyOverrides(): SpotlightPrivacyOverrides {
  return {}
}

export function spotlightEffectivePrivacy(
  tab: SpotlightPropertyTabId,
  overrides: SpotlightPrivacyOverrides = {},
): SpotlightEffectivePrivacy {
  const tabOverrides = overrides[tab] ?? {}
  return {
    showAddress: tabOverrides.showAddress === true,
    showClearPhotos: tabOverrides.showClearPhotos === true,
    showPropertyMap: tabOverrides.showPropertyMap === true,
  }
}

export function spotlightTownCenter(
  config: SpotlightListingConfig,
): GeoPoint | null {
  const city = config.address.city?.trim()
  if (city && isTmreTown(city)) return TOWN_CENTERS[city]
  return null
}

export function spotlightObfuscatesPhotoWithPrivacy(
  config: SpotlightListingConfig,
  photoIndex: number,
  privacy: SpotlightEffectivePrivacy,
): boolean {
  if (privacy.showClearPhotos) return false
  if (config.obfuscateFirstTwoPhotos) {
    return (SPOTLIGHT_COMING_SOON_OBFUSCATED_PHOTO_INDICES as readonly number[]).includes(
      photoIndex,
    )
  }
  if (config.status === 'Coming Soon') {
    return (SPOTLIGHT_COMING_SOON_OBFUSCATED_PHOTO_INDICES as readonly number[]).includes(
      photoIndex,
    )
  }
  return false
}

export function spotlightEffectiveHeaderAddress(
  config: SpotlightListingConfig,
  mls: SpotlightMlsListing | null,
  privacy: SpotlightEffectivePrivacy,
): {
  street: string
  full: string
  city: string
  state: string
  postalCode: string
} {
  if (!privacy.showAddress) {
    return {
      street: config.displayTitle,
      full: config.displayTitle,
      city: config.hideAddress ? '' : config.displayLocation,
      state: '',
      postalCode: '',
    }
  }

  const actualStreet =
    mls?.address?.street?.trim() ||
    config.address.street.trim() ||
    config.displayTitle
  const street = actualStreet
    ? `${config.displayTitle} — ${actualStreet}`
    : config.displayTitle
  const city =
    mls?.address?.city?.trim() || config.address.city.trim() || config.displayLocation
  const state = config.address.state.trim() || 'CT'
  const postalCode =
    mls?.address?.postalCode?.trim() || config.address.postalCode.trim() || ''
  const full = [street, city, state, postalCode].filter(Boolean).join(', ')

  return { street, full, city, state, postalCode }
}

export function spotlightEffectiveMapLocation(
  config: SpotlightListingConfig,
  mls: SpotlightMlsListing | null,
  privacy: SpotlightEffectivePrivacy,
): {
  latitude: number | null
  longitude: number | null
  addressQuery: string
  hidePin: boolean
  defaultZoom: number
} {
  const propertyLat = mls?.latitude ?? config.latitude
  const propertyLon = mls?.longitude ?? config.longitude

  if (privacy.showPropertyMap && propertyLat != null && propertyLon != null) {
    const query =
      mls?.address?.full?.trim() ||
      [config.address.street, config.address.city, config.address.state]
        .filter(Boolean)
        .join(', ')
    return {
      latitude: propertyLat,
      longitude: propertyLon,
      addressQuery: query || config.displayLocation,
      hidePin: false,
      defaultZoom: SPOTLIGHT_PROPERTY_MAP_ZOOM,
    }
  }

  const center = spotlightTownCenter(config)
  return {
    latitude: center?.lat ?? null,
    longitude: center?.lon ?? null,
    addressQuery: config.displayLocation,
    hidePin: true,
    defaultZoom: SPOTLIGHT_TOWN_MAP_ZOOM,
  }
}

export function spotlightPrivacyTabsForAdmin(): SpotlightPropertyTabId[] {
  return [...SPOTLIGHT_PROPERTY_TABS]
}

export function normalizeSpotlightPrivacyOverrides(
  input: unknown,
): SpotlightPrivacyOverrides {
  if (!input || typeof input !== 'object') return {}
  const body = input as Record<string, unknown>
  const out: SpotlightPrivacyOverrides = {}

  for (const tab of SPOTLIGHT_PROPERTY_TABS) {
    const raw = body[String(tab)]
    if (!raw || typeof raw !== 'object') continue
    const row = raw as Record<string, unknown>
    out[tab] = {
      showAddress: row.showAddress === true,
      showClearPhotos: row.showClearPhotos === true,
      showPropertyMap: row.showPropertyMap === true,
    }
  }

  return out
}
