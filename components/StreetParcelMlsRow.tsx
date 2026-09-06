'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { VisionDeedHistoryPopout, type VisionDeedHistoryRow } from '@/components/VisionDeedHistoryPopout'
import {
  formatStreetListingLine,
  streetListingCardHref,
  type StreetListingCard,
} from '@/lib/street-listing-card-shared'
import {
  STREET_LISTING_INGEST_IN_FLIGHT,
  type StreetListingIngestPhase,
} from '@/lib/street-listing-ingest-progress-shared'

type IngestPayload = {
  phase?: StreetListingIngestPhase | null
  message?: string | null
  listing?: StreetListingCard | null
}

export function StreetParcelMlsRow({
  town,
  visionPid,
  addressLabel,
  ownerName,
  mailingAddress,
  soldLabel,
  deedHistory,
  parcelHref,
  listing: initialListing,
}: {
  town: string
  visionPid: string
  addressLabel: string
  ownerName: string | null
  mailingAddress: string | null
  soldLabel: string | null
  deedHistory: VisionDeedHistoryRow[]
  parcelHref: string
  listing: StreetListingCard | null
}) {
  const [listing, setListing] = useState<StreetListingCard | null>(initialListing)
  const [phase, setPhase] = useState<StreetListingIngestPhase | null>(
    initialListing ? 'found' : null,
  )
  const [message, setMessage] = useState<string | null>(null)
  const inflight = useRef(false)

  const applyPayload = useCallback((payload: IngestPayload) => {
    if (payload.listing) {
      setListing(payload.listing)
      setPhase('found')
      setMessage(payload.message ?? payload.listing.status)
      inflight.current = false
      return
    }
    if (payload.phase) {
      setPhase(payload.phase)
      setMessage(payload.message ?? null)
      if (!STREET_LISTING_INGEST_IN_FLIGHT.has(payload.phase)) {
        inflight.current = false
      }
    }
  }, [])

  const poll = useCallback(async () => {
    const res = await fetch(
      `/api/streets/ingest-listing?town=${encodeURIComponent(town)}&visionPid=${encodeURIComponent(visionPid)}`,
    )
    if (!res.ok) return
    applyPayload((await res.json()) as IngestPayload)
  }, [applyPayload, town, visionPid])

  useEffect(() => {
    if (initialListing) return
    void poll()
  }, [initialListing, poll])

  useEffect(() => {
    if (!phase || !STREET_LISTING_INGEST_IN_FLIGHT.has(phase)) return
    const timer = window.setInterval(() => {
      void poll()
    }, 1500)
    return () => window.clearInterval(timer)
  }, [phase, poll])

  const startIngest = useCallback(() => {
    if (listing || inflight.current) return
    inflight.current = true
    setPhase('queued')
    setMessage('Searching RETS…')
    void (async () => {
      try {
        const res = await fetch('/api/streets/ingest-listing', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ town, visionPid }),
        })
        if (!res.ok) {
          setPhase('error')
          setMessage('RETS search failed')
          inflight.current = false
          return
        }
        applyPayload((await res.json()) as IngestPayload)
      } catch {
        setPhase('error')
        setMessage('RETS search failed')
        inflight.current = false
      }
    })()
  }, [applyPayload, listing, town, visionPid])

  const owner = ownerName
  const mailing = mailingAddress
  const sold = soldLabel

  return (
    <li
      id={`pid-${visionPid}`}
      className="scroll-mt-28 py-2.5 target:bg-gold/10 target:-mx-3 target:px-3 target:rounded-xl"
    >
      <div onClickCapture={startIngest}>
        <VisionDeedHistoryPopout
          label={addressLabel}
          addressLabel={addressLabel}
          ownerName={owner}
          mailingAddress={mailing}
          soldLabel={sold}
          rows={deedHistory}
          parcelHref={parcelHref}
          triggerClassName="text-left text-sm text-charcoal/90 hover:text-navy"
        >
          {addressLabel}
        </VisionDeedHistoryPopout>
      </div>
      <p className="mt-0.5 font-mono text-[11px] tracking-[0.04em] text-charcoal/55">
        {owner ?? 'Owner pending Field Card ingest'}
        {owner && sold ? (
          <>
            {' · '}
            <VisionDeedHistoryPopout
              label={sold}
              addressLabel={addressLabel}
              ownerName={owner}
              mailingAddress={mailing}
              soldLabel={sold}
              rows={deedHistory}
              parcelHref={parcelHref}
            />
          </>
        ) : owner && deedHistory.length > 0 ? (
          <>
            {' · '}
            <VisionDeedHistoryPopout
              label="Deed history"
              addressLabel={addressLabel}
              ownerName={owner}
              mailingAddress={mailing}
              rows={deedHistory}
              parcelHref={parcelHref}
            />
          </>
        ) : null}
      </p>
      {mailing ? (
        <p className="mt-0.5 font-mono text-[11px] tracking-[0.04em] text-charcoal/45">
          {mailing}
        </p>
      ) : null}
      {listing ? (
        <p className="mt-1">
          <Link
            href={streetListingCardHref(listing)}
            className="font-mono text-[11px] tracking-[0.04em] text-navy hover:underline"
          >
            {formatStreetListingLine(listing)}
          </Link>
        </p>
      ) : phase && STREET_LISTING_INGEST_IN_FLIGHT.has(phase) ? (
        <p className="mt-1 font-mono text-[11px] tracking-[0.04em] text-gold/90">
          {message || 'Searching RETS…'}
        </p>
      ) : phase === 'none' || phase === 'error' ? (
        <p className="mt-1 font-mono text-[11px] tracking-[0.04em] text-charcoal/40">
          {message || 'No MLS listing in RETS'}
        </p>
      ) : null}
    </li>
  )
}
