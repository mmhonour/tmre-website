'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  fetchVisitorLocation,
  peekVisitorLocation,
  refreshVisitorLocation,
  VISITOR_LOCATION_CHANGED_EVENT,
  type VisitorLocation,
} from '@/lib/visitor-location'
import { refineVisitorLocationFromWifi } from '@/lib/visitor-wifi-location'

export function useVisitorLocation(): {
  location: VisitorLocation | null
  refresh: () => Promise<VisitorLocation>
} {
  const [location, setLocation] = useState<VisitorLocation | null>(null)

  const refresh = useCallback(async () => {
    const loc = await refreshVisitorLocation()
    setLocation(loc)
    const refined = await refineVisitorLocationFromWifi()
    if (refined) setLocation(refined)
    return refined ?? loc
  }, [])

  useEffect(() => {
    let cancelled = false
    void fetchVisitorLocation().then(async (loc) => {
      if (!cancelled) setLocation(loc)
      const refined = await refineVisitorLocationFromWifi()
      if (!cancelled && refined) setLocation(refined)
    })
    const onChange = () => {
      const loc = peekVisitorLocation()
      if (!cancelled && loc) setLocation(loc)
    }
    window.addEventListener(VISITOR_LOCATION_CHANGED_EVENT, onChange)
    return () => {
      cancelled = true
      window.removeEventListener(VISITOR_LOCATION_CHANGED_EVENT, onChange)
    }
  }, [])

  return { location, refresh }
}
