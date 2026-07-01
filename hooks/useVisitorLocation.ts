'use client'

import { useEffect, useState } from 'react'
import {
  fetchVisitorLocation,
  type VisitorLocation,
} from '@/lib/visitor-location'

export function useVisitorLocation(): VisitorLocation | null {
  const [location, setLocation] = useState<VisitorLocation | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchVisitorLocation().then((loc) => {
      if (!cancelled) setLocation(loc)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return location
}
