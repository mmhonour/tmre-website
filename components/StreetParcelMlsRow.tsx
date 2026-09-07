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
  ownerDisplayLines,
  mailingAddress,
  mailingDisplayLines,
  soldLabel,
  lastPaidPriceLabel,
  lastPaidSaleDate,
  deedHistory,
  parcelHref,
  listing: initialListing,
}: {
  town: string
  visionPid: string
  addressLabel: string
  ownerName: string | null
  ownerDisplayLines: string[]
  mailingAddress: string | null
  mailingDisplayLines: string[]
  soldLabel: string | null
  lastPaidPriceLabel: string | null
  lastPaidSaleDate: string | null
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
  const ownerLines =
    ownerDisplayLines.length > 0
      ? ownerDisplayLines
      : owner
        ? [owner]
        : []
  const mailing = mailingAddress
  const sold = soldLabel
  const price = lastPaidPriceLabel
  const paidDate = lastPaidSaleDate
  const ownerTriggerClass =
    'text-left font-mono text-[11px] tracking-[0.04em] text-charcoal/55 hover:text-navy underline underline-offset-2 decoration-charcoal/25 hover:decoration-navy'
  const priceTriggerClass =
    'block text-right font-mono text-sm tabular-nums text-charcoal/90 hover:text-navy'

  return (
    <li
      id={`pid-${visionPid}`}
      className="scroll-mt-28 py-2.5 target:bg-gold/10 target:-mx-3 target:px-3 target:rounded-xl"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <Link
            href={parcelHref}
            className="text-sm text-charcoal/90 hover:text-navy underline underline-offset-2 decoration-charcoal/25 hover:decoration-navy"
            aria-label={`Open Vision parcel ${addressLabel}`}
          >
            {addressLabel}
          </Link>
          <p className="mt-0.5 font-mono text-[11px] tracking-[0.04em] text-charcoal/55">
            {ownerLines.length > 0 ? (
              <VisionDeedHistoryPopout
                label={owner ?? ownerLines.join(' & ')}
                addressLabel={addressLabel}
                ownerName={ownerLines.join('\n')}
                mailingAddress={mailing}
                soldLabel={sold}
                rows={deedHistory}
                parcelHref={parcelHref}
                triggerClassName={ownerTriggerClass}
              >
                <span className="block whitespace-pre-line">
                  {ownerLines.join('\n')}
                </span>
              </VisionDeedHistoryPopout>
            ) : (
              'Owner pending Field Card ingest'
            )}
          </p>
          {mailingDisplayLines.length > 0 ? (
            <div className="mt-1 font-mono text-[11px] text-charcoal/45">
              <p className="tracking-[0.08em] uppercase text-charcoal/40">
                {mailingDisplayLines[0]}
              </p>
              {mailingDisplayLines.length > 1 ? (
                <p className="mt-0.5 whitespace-pre-line tracking-[0.04em]">
                  {mailingDisplayLines.slice(1).join('\n')}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
        {price ? (
          <VisionDeedHistoryPopout
            label={price}
            addressLabel={addressLabel}
            ownerName={ownerLines.join('\n') || owner}
            mailingAddress={mailing}
            soldLabel={sold}
            rows={deedHistory}
            parcelHref={parcelHref}
            triggerClassName={priceTriggerClass}
          >
            <span className="block underline underline-offset-2 decoration-charcoal/25 hover:decoration-navy">
              {price}
            </span>
            {paidDate ? (
              <span className="mt-0.5 block font-mono text-[11px] tracking-[0.04em] text-charcoal/55">
                {paidDate}
              </span>
            ) : null}
          </VisionDeedHistoryPopout>
        ) : null}
      </div>
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
