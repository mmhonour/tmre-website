'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { streetListingCardHref } from '@/lib/street-listing-card-shared'
import {
  listingIngestStatusCopy,
  listingIngestStatusHeading,
  STREET_LISTING_INGEST_IN_FLIGHT,
  type StreetListingIngestPhase,
} from '@/lib/street-listing-ingest-progress-shared'

type Payload = {
  phase?: StreetListingIngestPhase | null
  message?: string | null
  listing?: { id: string; mlsId: string | null; status: string } | null
}

export function FindListingIngestStatus({
  visionPid,
  hasListing,
}: {
  visionPid: string
  hasListing: boolean
}) {
  const router = useRouter()
  const [phase, setPhase] = useState<StreetListingIngestPhase | null>(
    hasListing ? 'found' : 'queued',
  )
  const [message, setMessage] = useState<string | null>(null)
  const [listingId, setListingId] = useState<string | null>(null)
  const posted = useRef(false)

  const apply = useCallback(
    (payload: Payload) => {
      if (payload.listing?.id) {
        setListingId(payload.listing.id)
        setPhase('found')
        setMessage(payload.message ?? payload.listing.status)
        router.refresh()
        return
      }
      if (payload.phase) {
        setPhase(payload.phase)
        setMessage(payload.message ?? null)
      }
    },
    [router],
  )

  const poll = useCallback(async () => {
    const res = await fetch(
      `/api/find/westport/${encodeURIComponent(visionPid)}/listing`,
    )
    if (!res.ok) return
    apply((await res.json()) as Payload)
  }, [apply, visionPid])

  useEffect(() => {
    if (hasListing || posted.current) return
    posted.current = true
    void (async () => {
      try {
        const res = await fetch(
          `/api/find/westport/${encodeURIComponent(visionPid)}/listing`,
          { method: 'POST' },
        )
        if (!res.ok) {
          setPhase('error')
          setMessage('Listing search failed')
          return
        }
        apply((await res.json()) as Payload)
      } catch {
        setPhase('error')
        setMessage('Listing search failed')
      }
    })()
  }, [apply, hasListing, visionPid])

  useEffect(() => {
    if (hasListing) return
    if (!phase || !STREET_LISTING_INGEST_IN_FLIGHT.has(phase)) return
    const timer = window.setInterval(() => {
      void poll()
    }, 1500)
    return () => window.clearInterval(timer)
  }, [hasListing, phase, poll])

  if (hasListing) return null

  const copy = listingIngestStatusCopy(phase, message)

  return (
    <div className="mb-5 rounded-xl border border-gold/45 bg-gold/15 px-4 py-3">
      <p className="font-mono text-[11px] tracking-[0.14em] uppercase text-gold">
        {listingIngestStatusHeading(phase)}
      </p>
      <p className="mt-1 text-sm text-white/80">{copy}</p>
      {listingId ? (
        <p className="mt-2">
          <Link
            href={streetListingCardHref({ id: listingId })}
            className="font-mono text-[11px] tracking-[0.14em] uppercase text-gold hover:text-white"
          >
            Open listing
          </Link>
        </p>
      ) : null}
    </div>
  )
}
