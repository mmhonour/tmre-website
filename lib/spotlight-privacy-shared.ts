import type { GeoPoint } from '@/lib/tmre-geo'
import { TOWN_CENTERS } from '@/lib/tmre-geo'
import type { SpotlightListingConfig, SpotlightPropertyTabId } from '@/lib/spotlight-listing'
import { SPOTLIGHT_PROPERTY_TABS } from '@/lib/spotlight-listing'
import {
  SPOTLIGHT_COMING_SOON_OBFUSCATED_PHOTO_INDICES,
  spotlightEffectiveDisplayTitle,
  spotlightListingIsComingSoon,
  type SpotlightMlsListing,
} from '@/lib/spotlight-display'
import { isTmreTown } from '@/lib/tmre-towns'

/** Admin overrides — all default off (privacy mode on). */
export type SpotlightPrivacyTabOverrides = {
  showAddress?: boolean
  showClearPhotos?: boolean
  showPropertyMap?: boolean
  /**
   * Sticky admin override: treat this tab as live (no Coming Soon title / blur
   * behavior) even if MLSStatus still says Coming Soon.
   */
  clearComingSoon?: boolean
}

export type SpotlightPrivacyOverrides = Partial<
  Record<SpotlightPropertyTabId, SpotlightPrivacyTabOverrides>
>

export type SpotlightEffectivePrivacy = {
  showAddress: boolean
  showClearPhotos: boolean
  showPropertyMap: boolean
  clearComingSoon: boolean
}

/** Single source of truth for Spotlight address / photo / map presentation. */
export type SpotlightPresentation = {
  privacy: SpotlightEffectivePrivacy
  isComingSoon: boolean
  showHero: boolean
  hidePhotoDeckHero: boolean
  shouldObfuscatePhoto: (photoIndex: number) => boolean
  headerAddress: ReturnType<typeof spotlightEffectiveHeaderAddress>
  mapLocation: ReturnType<typeof spotlightEffectiveMapLocation>
  privacyMode: boolean
  addressHint: string | null
  townHint: string | null
  interestAddress: string
  interestCity: string | null
  ifAddressHint: string | null
  photoDeckCity: string | null
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
    clearComingSoon: tabOverrides.clearComingSoon === true,
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
  mls?: SpotlightMlsListing | null,
): boolean {
  if (privacy.showClearPhotos) return false
  if (!spotlightListingIsComingSoon(config, mls ?? null, privacy)) return false
  if (config.obfuscateFirstTwoPhotos) {
    return (SPOTLIGHT_COMING_SOON_OBFUSCATED_PHOTO_INDICES as readonly number[]).includes(
      photoIndex,
    )
  }
  return (SPOTLIGHT_COMING_SOON_OBFUSCATED_PHOTO_INDICES as readonly number[]).includes(
    photoIndex,
  )
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
  const displayTitle = spotlightEffectiveDisplayTitle(config, mls, privacy)
  if (!privacy.showAddress) {
    return {
      street: displayTitle,
      full: displayTitle,
      city: '',
      state: '',
      postalCode: '',
    }
  }

  const actualStreet =
    mls?.address?.street?.trim() ||
    config.address.street.trim() ||
    displayTitle
  const street = actualStreet
    ? `${displayTitle} — ${actualStreet}`
    : displayTitle
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
  /** When property map/pin is off: outline this TMRE town with a ? marker. */
  outlineTown: string | null
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
      outlineTown: null,
      defaultZoom: SPOTLIGHT_PROPERTY_MAP_ZOOM,
    }
  }

  const center = spotlightTownCenter(config)
  const city =
    mls?.address?.city?.trim() ||
    config.address.city?.trim() ||
    null
  const outlineTown = city && isTmreTown(city) ? city : null

  return {
    latitude: center?.lat ?? null,
    longitude: center?.lon ?? null,
    addressQuery: config.displayLocation,
    hidePin: true,
    outlineTown,
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
      clearComingSoon: row.clearComingSoon === true,
    }
  }

  return out
}

export function spotlightEffectivePresentation(
  config: SpotlightListingConfig,
  mls: SpotlightMlsListing | null,
  privacy: SpotlightEffectivePrivacy,
  photoCount = 0,
): SpotlightPresentation {
  const isComingSoon = spotlightListingIsComingSoon(config, mls, privacy)
  const headerAddress = spotlightEffectiveHeaderAddress(config, mls, privacy)
  const mapLocation = spotlightEffectiveMapLocation(config, mls, privacy)
  const shouldObfuscatePhoto = (photoIndex: number) =>
    spotlightObfuscatesPhotoWithPrivacy(config, photoIndex, privacy, mls)

  const streetAddress =
    mls?.address?.street?.trim() ||
    config.address.street.trim() ||
    spotlightEffectiveDisplayTitle(config, mls, privacy)

  const city =
    mls?.address?.city?.trim() || config.address.city.trim() || null

  return {
    privacy,
    isComingSoon,
    showHero: photoCount > 0 && (privacy.showClearPhotos || !isComingSoon),
    hidePhotoDeckHero: !privacy.showClearPhotos && isComingSoon,
    shouldObfuscatePhoto,
    headerAddress,
    mapLocation,
    privacyMode: !privacy.showAddress,
    addressHint: privacy.showAddress ? streetAddress : null,
    townHint: privacy.showAddress ? city : null,
    interestAddress: privacy.showAddress ? streetAddress : config.displayLocation,
    interestCity: privacy.showAddress ? city : null,
    ifAddressHint: privacy.showAddress ? streetAddress : null,
    photoDeckCity: privacy.showAddress ? city : null,
  }
}
