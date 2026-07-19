'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  fetchVisitorLocation,
  refreshVisitorLocation,
  VISITOR_LOCATION_CHANGED_EVENT,
  type VisitorLocation,
} from '@/lib/visitor-location'

export function useVisitorLocation(): {
  location: VisitorLocation | null
  refresh: () => Promise<VisitorLocation>
} {
  const [location, setLocation] = useState<VisitorLocation | null>(null)

  const refresh = useCallback(async () => {
    const loc = await refreshVisitorLocation()
    setLocation(loc)
    return loc
  }, [])

  useEffect(() => {
    let cancelled = false
    void fetchVisitorLocation().then((loc) => {
      if (!cancelled) setLocation(loc)
    })
    const onChange = () => {
      void refreshVisitorLocation().then((loc) => {
        if (!cancelled) setLocation(loc)
      })
    }
    window.addEventListener(VISITOR_LOCATION_CHANGED_EVENT, onChange)
    return () => {
      cancelled = true
      window.removeEventListener(VISITOR_LOCATION_CHANGED_EVENT, onChange)
    }
  }, [])

  return { location, refresh }
}
