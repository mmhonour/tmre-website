'use client'

import { useEffect, useId, useState } from 'react'

export type VisionDeedHistoryRow = {
  date: string
  owner: string
  priceLabel: string
  bookPage: string
  deedLabel: string
}

export function VisionDeedHistoryPopout({
  label,
  addressLabel,
  ownerName,
  rows,
  tone = 'light',
}: {
  label: string
  addressLabel: string
  ownerName: string | null
  rows: VisionDeedHistoryRow[]
  tone?: 'light' | 'dark'
}) {
  const [open, setOpen] = useState(false)
  const titleId = useId()

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

  if (rows.length === 0) {
    return <span>{label}</span>
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          tone === 'dark'
            ? 'underline underline-offset-2 decoration-gold/50 hover:text-white hover:decoration-gold'
            : 'underline underline-offset-2 decoration-charcoal/25 hover:text-navy hover:decoration-navy'
        }
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        {label}
      </button>
      {open ? (
        <div
          className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-0 sm:p-6"
          role="presentation"
        >
          <button
            type="button"
            className="absolute inset-0 bg-navy/55"
            aria-label="Close deed history"
            onClick={() => setOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="relative z-[81] w-full sm:max-w-2xl max-h-[85vh] overflow-hidden rounded-t-2xl sm:rounded-2xl bg-white shadow-xl"
          >
            <div className="flex items-start justify-between gap-4 border-b border-charcoal/10 px-5 py-4">
              <div>
                <p
                  id={titleId}
                  className="font-mono text-[10px] tracking-[0.16em] uppercase text-gold"
                >
                  Deed history
                </p>
                <p className="mt-1 font-serif text-xl text-navy leading-snug">
                  {addressLabel}
                </p>
                {ownerName ? (
                  <p className="mt-0.5 font-mono text-[11px] text-charcoal/55">
                    {ownerName}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="font-mono text-[11px] tracking-[0.12em] uppercase text-navy/60 hover:text-navy"
              >
                Close
              </button>
            </div>
            <div className="overflow-x-auto overflow-y-auto max-h-[min(60vh,28rem)] px-5 py-3">
              <table className="w-full min-w-[28rem] text-left">
                <thead>
                  <tr className="border-b border-charcoal/10">
                    {['Date', 'Owner', 'Price', 'Book / page', 'Deed'].map((h) => (
                      <th
                        key={h}
                        className="py-2 pr-3 font-mono text-[10px] tracking-[0.12em] uppercase text-slate/55 font-normal"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr
                      key={`${row.date}-${row.owner}-${row.bookPage}-${i}`}
                      className="border-b border-charcoal/[0.06]"
                    >
                      <td className="py-2 pr-3 font-mono text-[13px] text-navy tabular-nums whitespace-nowrap">
                        {row.date}
                      </td>
                      <td className="py-2 pr-3 font-mono text-[13px] text-navy">
                        {row.owner}
                      </td>
                      <td className="py-2 pr-3 font-mono text-[13px] text-navy tabular-nums whitespace-nowrap">
                        {row.priceLabel}
                      </td>
                      <td className="py-2 pr-3 font-mono text-[13px] text-navy tabular-nums whitespace-nowrap">
                        {row.bookPage}
                      </td>
                      <td className="py-2 font-mono text-[13px] text-navy">
                        {row.deedLabel}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
