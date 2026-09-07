'use client'

import Link from 'next/link'
import { useEffect, useId, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export type VisionDeedHistoryRow = {
  date: string
  owner: string
  priceLabel: string
  bookPage: string
  deedLabel: string
  paid?: boolean
}

export function VisionDeedHistoryPopout({
  label,
  addressLabel,
  ownerName,
  mailingAddress,
  soldLabel,
  rows,
  parcelHref,
  tone = 'light',
  triggerClassName,
  children,
}: {
  label: string
  addressLabel: string
  ownerName: string | null
  mailingAddress?: string | null
  soldLabel?: string | null
  rows: VisionDeedHistoryRow[]
  parcelHref?: string | null
  tone?: 'light' | 'dark'
  triggerClassName?: string
  children?: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const titleId = useId()
  const canOpen = Boolean(ownerName || mailingAddress || rows.length > 0)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open])

  if (!canOpen) {
    return <span className={triggerClassName}>{children ?? label}</span>
  }

  const paid = rows.find((row) => row.paid)
  const lastSold =
    soldLabel ??
    (paid ? [paid.date, paid.priceLabel].filter(Boolean).join(' · ') : '—')

  const defaultTrigger =
    tone === 'dark'
      ? 'underline underline-offset-2 decoration-gold/50 hover:text-white hover:decoration-gold'
      : 'underline underline-offset-2 decoration-charcoal/25 hover:text-navy hover:decoration-navy'

  const dialog =
    open && mounted ? (
        <div
          className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-6"
          role="presentation"
        >
          <button
            type="button"
            className="absolute inset-0 bg-navy/55"
            aria-label="Close owner card"
            onClick={() => setOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="relative z-[81] flex w-full sm:max-w-xl max-h-[88vh] flex-col overflow-hidden rounded-t-2xl sm:rounded-2xl bg-white shadow-xl"
          >
            <div className="flex items-start justify-between gap-4 border-b border-charcoal/10 px-5 py-4">
              <div className="min-w-0">
                <p
                  id={titleId}
                  className="font-serif text-xl sm:text-2xl text-navy leading-snug"
                >
                  {addressLabel}
                </p>
                <p className="mt-1 font-mono text-[10px] tracking-[0.16em] uppercase text-gold">
                  Owner of record
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="shrink-0 font-mono text-[11px] tracking-[0.12em] uppercase text-navy/60 hover:text-navy"
              >
                Close
              </button>
            </div>

            <div className="overflow-y-auto px-5 py-4">
              <p className="font-serif text-xl sm:text-2xl text-navy leading-snug whitespace-pre-line">
                {ownerName ?? 'Owner pending Field Card'}
              </p>
              <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                <div>
                  <dt className="font-mono text-[10px] tracking-[0.12em] uppercase text-slate/55">
                    Mailing address
                  </dt>
                  <dd className="mt-0.5 font-mono text-sm text-navy leading-relaxed whitespace-pre-line">
                    {mailingAddress ?? 'Pending Field Card'}
                  </dd>
                </div>
                <div>
                  <dt className="font-mono text-[10px] tracking-[0.12em] uppercase text-slate/55">
                    Last sold
                  </dt>
                  <dd className="mt-0.5 font-mono text-sm text-navy tabular-nums">
                    {lastSold}
                  </dd>
                </div>
              </dl>

              {rows.length > 0 ? (
                <div className="mt-6">
                  <p className="font-mono text-[10px] tracking-[0.16em] uppercase text-gold">
                    Deed history
                  </p>
                  <p className="mt-1 mb-3 font-mono text-[10px] tracking-[0.06em] text-slate/50">
                    Newest first. A $0 / instrument 29 row is a quitclaim —
                    name(s) on record without warranty — not a sale.
                  </p>
                  <ol className="divide-y divide-charcoal/10">
                    {rows.map((row, i) => (
                      <li
                        key={`${row.date}-${row.owner}-${row.bookPage}-${i}`}
                        className="py-3 first:pt-0"
                      >
                        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                          <span className="font-mono text-[13px] text-navy tabular-nums">
                            {row.date}
                          </span>
                          <span className="font-mono text-[13px] text-navy tabular-nums">
                            {row.priceLabel}
                          </span>
                        </div>
                        <p className="mt-1 font-serif text-lg text-navy leading-snug whitespace-normal">
                          {row.owner}
                        </p>
                        <p className="mt-0.5 font-mono text-[11px] text-charcoal/55">
                          {[row.bookPage !== '—' ? row.bookPage : null, row.deedLabel]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      </li>
                    ))}
                  </ol>
                </div>
              ) : null}
            </div>

            {parcelHref ? (
              <div className="border-t border-charcoal/10 px-5 py-3">
                <Link
                  href={parcelHref}
                  className="font-mono text-[11px] tracking-[0.12em] uppercase text-navy/70 hover:text-navy"
                  onClick={() => setOpen(false)}
                >
                  Open parcel
                </Link>
              </div>
            ) : null}
          </div>
        </div>
    ) : null

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={triggerClassName ?? defaultTrigger}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        {children ?? label}
      </button>
      {dialog ? createPortal(dialog, document.body) : null}
    </>
  )
}
