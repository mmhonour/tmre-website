'use client'

import {
  applyInferredVisitorLocation,
  peekVisitorLocation,
  setVisitorPostalOverride,
  type VisitorLocation,
} from '@/lib/visitor-location'
import { ipPostalNeedsWifiRefine } from '@/lib/visitor-wifi-zip-shared'

const GEO_DENIED_KEY = 'tmre_visitor_geo_denied'

function geoDenied(): boolean {
  if (typeof window === 'undefined') return true
  try {
    return window.localStorage.getItem(GEO_DENIED_KEY) === '1'
  } catch {
    return true
  }
}

export function rememberGeoDenied(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(GEO_DENIED_KEY, '1')
  } catch {
    /* private mode */
  }
}

export function clearGeoDenied(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(GEO_DENIED_KEY)
  } catch {
    /* private mode */
  }
}

function readBrowserPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('geolocation unavailable'))
      return
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      timeout: 8_000,
      maximumAge: 10 * 60 * 1_000,
    })
  })
}

/**
 * Opt-in only: admin pill → Use precise location.
 * Hidden for visitors. Do not call on page load.
 */
export async function refineVisitorLocationFromWifi(
  force = false,
): Promise<VisitorLocation | null> {
  const current = peekVisitorLocation()
  if (!force) {
    if (current?.confirmed || current?.cleared) return null
    if (geoDenied()) return null
    if (!ipPostalNeedsWifiRefine(current?.postal ?? null)) return null
  }

  let position: GeolocationPosition
  try {
    position = await readBrowserPosition()
  } catch (err) {
    const code =
      err && typeof err === 'object' && 'code' in err
        ? Number((err as GeolocationPositionError).code)
        : NaN
    if (code === 1) rememberGeoDenied()
    return null
  }

  try {
    const res = await fetch('/api/visitor-town/from-point', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      }),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { postal?: string | null; town?: string | null }
    const postal =
      typeof data.postal === 'string' && /^\d{5}/.test(data.postal.trim())
        ? data.postal.trim().slice(0, 5)
        : null
    if (!postal) return null
    const town =
      typeof data.town === 'string' && data.town.trim() ? data.town.trim() : null
    if (force) return setVisitorPostalOverride(postal)
    return applyInferredVisitorLocation(postal, town)
  } catch {
    return null
  }
}
