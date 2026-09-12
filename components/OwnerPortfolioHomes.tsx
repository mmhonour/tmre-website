import Link from 'next/link'
import { westportParcelHref } from '@/lib/listing-url'
import type { VisionOwnerPortfolioParcel } from '@/lib/vision-owner-keys'

export function OwnerPortfolioHomes({
  parcels,
  purchaseTotalLabel,
}: {
  parcels: readonly VisionOwnerPortfolioParcel[]
  purchaseTotalLabel?: string | null
}) {
  return (
    <>
      <ul className="mt-3 space-y-1.5">
        {parcels.map((parcel) => (
          <li
            key={`${parcel.town}:${parcel.visionPid}`}
            className="flex items-start justify-between gap-6"
          >
            <Link
              href={westportParcelHref(parcel.visionPid)}
              className="min-w-0 font-mono text-sm text-navy hover:underline"
            >
              {parcel.siteAddress}
            </Link>
            {parcel.lastPaidPriceLabel ? (
              <p className="flex shrink-0 items-baseline justify-end gap-3 text-right">
                {parcel.lastPaidSaleDate ? (
                  <span className="font-mono text-[11px] tracking-[0.04em] text-charcoal/55">
                    {parcel.lastPaidSaleDate}
                  </span>
                ) : null}
                <span className="font-mono text-sm tabular-nums text-charcoal/90">
                  {parcel.lastPaidPriceLabel}
                </span>
              </p>
            ) : null}
          </li>
        ))}
      </ul>
      {purchaseTotalLabel ? (
        <p className="mt-3 flex items-baseline justify-between gap-6 border-t border-charcoal/[0.08] pt-2">
          <span className="font-mono text-[11px] tracking-[0.1em] uppercase text-slate">
            Purchases
          </span>
          <span className="font-mono text-sm tabular-nums text-navy">
            {purchaseTotalLabel}
          </span>
        </p>
      ) : null}
    </>
  )
}
