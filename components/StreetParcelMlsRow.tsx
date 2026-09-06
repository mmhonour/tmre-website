'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
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
  lastPaidPriceLabel,
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
  lastPaidPriceLabel: string | null
  deedHistory: VisionDeedHistoryRow[]
  parcelHref: string
  listing: StreetListingCard | null
}) {
  const [listing, setListing] = useState<StreetListingCard | null>(initialListing)
  const [phase, setPhase] = useState<StreetListingIngestPhase | null>(
    initialListing ? 'found' : null,
  )
  const [message, setMessage] = useState<string | null>(null)

  const applyPayload = useCallback((payload: IngestPayload) => {
    if (payload.listing) {
      setListing(payload.listing)
      setPhase('found')
      setMessage(payload.message ?? payload.listing.status)
      return
    }
    if (payload.phase) {
      setPhase(payload.phase)
      setMessage(payload.message ?? null)
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

  const owner = ownerName
  const mailing = mailingAddress
  const sold = soldLabel
  const price = lastPaidPriceLabel
  const ownerTriggerClass =
    'text-left font-mono text-[11px] tracking-[0.04em] text-charcoal/55 hover:text-navy underline underline-offset-2 decoration-charcoal/25 hover:decoration-navy'
  const priceTriggerClass =
    'shrink-0 text-right font-mono text-sm tabular-nums text-charcoal/90 hover:text-navy underline underline-offset-2 decoration-charcoal/25 hover:decoration-navy'

  return (
    <li
      id={`pid-${visionPid}`}
      className="scroll-mt-28 py-2.5 target:bg-gold/10 target:-mx-3 target:px-3 target:rounded-xl"
    >
      <div className="flex items-baseline justify-between gap-4">
        <Link
          href={parcelHref}
          className="min-w-0 text-sm text-charcoal/90 hover:text-navy underline underline-offset-2 decoration-charcoal/25 hover:decoration-navy"
          aria-label={`Open Vision parcel ${addressLabel}`}
        >
          {addressLabel}
        </Link>
        {price ? (
          <VisionDeedHistoryPopout
            label={price}
            addressLabel={addressLabel}
            ownerName={owner}
            mailingAddress={mailing}
            soldLabel={sold}
            rows={deedHistory}
            parcelHref={parcelHref}
            triggerClassName={priceTriggerClass}
          >
            {price}
          </VisionDeedHistoryPopout>
        ) : null}
      </div>
      <p className="mt-0.5 font-mono text-[11px] tracking-[0.04em] text-charcoal/55">
        {owner ? (
          <VisionDeedHistoryPopout
            label={owner}
            addressLabel={addressLabel}
            ownerName={owner}
            mailingAddress={mailing}
            soldLabel={sold}
            rows={deedHistory}
            parcelHref={parcelHref}
            triggerClassName={ownerTriggerClass}
          >
            {owner}
          </VisionDeedHistoryPopout>
        ) : (
          'Owner pending Field Card ingest'
        )}
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
