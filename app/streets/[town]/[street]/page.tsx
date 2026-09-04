import Link from 'next/link'
import { notFound } from 'next/navigation'
import { isAdminAuthorizedFromCookies } from '@/lib/admin-auth'
import SitePasswordGate from '@/components/SitePasswordGate'
import {
  listVisionStreetParcels,
  listVisionStreets,
  listVisionStreetTowns,
} from '@/lib/db/vision-streets-repo'
import { westportParcelHref } from '@/lib/listing-url'
import { VISION_SALES_HISTORY_ID } from '@/lib/vision-gis-parse'
import { VISION_GIS_TOWNS } from '@/lib/vision-gis-towns'
import {
  compareAddressLabels,
  resolveStreetName,
  resolveStreetTown,
  townToStreetSlug,
} from '@/lib/vision-streets-page'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Streets — TMRE',
  description: 'Official assessor addresses on one street.',
  robots: { index: false, follow: false },
}

function mergeKnownTowns(fromTable: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const town of [...VISION_GIS_TOWNS.map((t) => t.town), ...fromTable]) {
    const key = town.trim().toLowerCase()
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(town)
  }
  return out
}

function parcelHref(
  town: string,
  visionPid: string,
  addressLabel: string,
): string {
  if (town.trim().toLowerCase() === 'westport') {
    return westportParcelHref(visionPid)
  }
  return `/find?q=${encodeURIComponent(addressLabel)}`
}

export default async function StreetsStreetPage({
  params,
}: {
  params: Promise<{ town: string; street: string }>
}) {
  const unlocked = await isAdminAuthorizedFromCookies()
  if (!unlocked) {
    return (
      <SitePasswordGate
        title="Streets."
        subtitle="Enter the TMRE password to view the assessor street index."
      />
    )
  }

  const { town: townSlug, street: streetSlug } = await params
  const tableTowns = await listVisionStreetTowns()
  const towns = mergeKnownTowns(tableTowns)
  const town = resolveStreetTown(townSlug, towns)
  if (!town) notFound()

  const streets = await listVisionStreets(town)
  const streetName = resolveStreetName(
    streetSlug,
    streets.map((row) => row.streetName),
  )
  if (!streetName) notFound()

  const parcels = (await listVisionStreetParcels(town, streetName)).sort((a, b) =>
    compareAddressLabels(a.addressLabel, b.addressLabel),
  )
  const townHref = `/streets/${townToStreetSlug(town)}`

  return (
    <>
      <section className="navy-gradient text-white pt-20 pb-10 lg:pt-28 lg:pb-14 relative overflow-hidden">
        <div className="absolute inset-0 hero-grid opacity-40" aria-hidden />
        <div className="relative mx-auto max-w-7xl px-6 lg:px-10">
          <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold mb-3">
            Admin · Streets
          </p>
          <p className="text-sm text-white/60 mb-3">
            <Link href={townHref} className="hover:text-white">
              Streets
            </Link>
            <span className="mx-2 text-white/35">/</span>
            {town}
          </p>
          <h1 className="font-serif italic text-4xl sm:text-5xl text-white leading-[1.05]">
            {streetName}
          </h1>
          <p className="mt-3 text-sm text-white/70 max-w-xl leading-relaxed">
            {parcels.length.toLocaleString()}{' '}
            {parcels.length === 1 ? 'address' : 'addresses'} from the Vision
            street page. Owner, mailing address, and last sold (paid deed)
            come from the Field Card. Quitclaims are on the parcel page sales
            history — they do not replace Last sold.
          </p>
        </div>
      </section>

      <section className="bg-white py-10 lg:py-14">
        <div className="mx-auto max-w-7xl px-6 lg:px-10">
          {parcels.length === 0 ? (
            <p className="text-sm text-charcoal/70 max-w-xl leading-relaxed">
              No house numbers stored for {streetName} yet. The next Vision
              chunk fills missing street pages (Streets.aspx?Name=) without
              walking every Field Card. Admin → Syncs → Vision addresses.
            </p>
          ) : (
            <ul className="divide-y divide-charcoal/10 max-w-3xl">
              {parcels.map((row) => {
                const owner = row.ownerName
                const mailing = row.ownerMailingAddress
                const sold = row.purchaseDate
                const historyHref = `${parcelHref(town, row.visionPid, row.addressLabel)}#${VISION_SALES_HISTORY_ID}`
                return (
                  <li
                    key={`${row.visionPid}-${row.addressLabel}`}
                    className="py-2.5"
                  >
                    <Link
                      href={parcelHref(town, row.visionPid, row.addressLabel)}
                      className="text-sm text-charcoal/90 hover:text-navy"
                    >
                      {row.addressLabel}
                    </Link>
                    <p className="mt-0.5 font-mono text-[11px] tracking-[0.04em] text-charcoal/55">
                      {owner ?? 'Owner pending Field Card ingest'}
                      {owner && sold ? ` · Last sold ${sold}` : ''}
                    </p>
                    {mailing ? (
                      <p className="mt-0.5 font-mono text-[11px] tracking-[0.04em] text-charcoal/45">
                        {mailing}
                      </p>
                    ) : null}
                    {row.quitclaimCount > 0 ? (
                      <p className="mt-0.5">
                        <Link
                          href={historyHref}
                          className="font-mono text-[11px] tracking-[0.08em] uppercase text-navy/55 hover:text-navy underline underline-offset-2"
                        >
                          {row.quitclaimCount === 1
                            ? '1 quitclaim'
                            : `${row.quitclaimCount} quitclaims`}
                        </Link>
                      </p>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          )}
          <p className="mt-10">
            <Link
              href={townHref}
              className="font-mono text-[12px] tracking-[0.14em] uppercase text-navy/70 hover:text-navy"
            >
              All {town} streets
            </Link>
          </p>
        </div>
      </section>
    </>
  )
}
