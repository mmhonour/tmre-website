import Link from 'next/link'
import { westportParcelHref } from '@/lib/listing-url'
import type { VisionOwnerPortfolioParcel } from '@/lib/vision-owner-keys'

export function OwnerPortfolioHomes({
  parcels,
}: {
  parcels: readonly VisionOwnerPortfolioParcel[]
}) {
  return (
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
            <p className="shrink-0 text-right">
              <span className="block font-mono text-sm tabular-nums text-charcoal/90">
                {parcel.lastPaidPriceLabel}
              </span>
              {parcel.lastPaidSaleDate ? (
                <span className="mt-0.5 block font-mono text-[11px] tracking-[0.04em] text-charcoal/55">
                  {parcel.lastPaidSaleDate}
                </span>
              ) : null}
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  )
}
