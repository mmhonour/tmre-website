import Link from 'next/link'
import { notFound } from 'next/navigation'
import { isAdminAuthorizedFromCookies } from '@/lib/admin-auth'
import SitePasswordGate from '@/components/SitePasswordGate'
import { listVisionOwnerPortfolios } from '@/lib/db/vision-owner-clusters-repo'
import {
  listVisionStreets,
  listVisionStreetTowns,
} from '@/lib/db/vision-streets-repo'
import { OwnerPortfolioHomes } from '@/components/OwnerPortfolioHomes'
import { VISION_GIS_TOWNS } from '@/lib/vision-gis-towns'
import type { VisionOwnerPortfolio } from '@/lib/vision-owner-keys'
import {
  resolveStreetName,
  resolveStreetTown,
  townToStreetSlug,
  visionOwnersPageHref,
  visionStreetPageHref,
} from '@/lib/vision-streets-page'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Owners with 2+ homes — Streets — TMRE',
  description:
    'Admin: landlords (same current warranty name on two or more homes) and owners who share a mailing — largest first.',
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

async function loadPortfolios(
  town: string,
  streetName: string | null,
): Promise<VisionOwnerPortfolio[]> {
  try {
    return await listVisionOwnerPortfolios({
      town,
      streetName,
      minParcels: 2,
    })
  } catch (err) {
    console.warn('[streets/owners] load failed', err)
    return []
  }
}

export default async function StreetsOwnersPage({
  searchParams,
}: {
  searchParams: Promise<{ town?: string | string[]; street?: string | string[] }>
}) {
  const unlocked = await isAdminAuthorizedFromCookies()
  if (!unlocked) {
    return (
      <SitePasswordGate
        title="Streets."
        subtitle="Enter the TMRE password to view owner aggregation."
      />
    )
  }

  const raw = await searchParams
  const townParam = (Array.isArray(raw.town) ? raw.town[0] : raw.town)?.trim() ?? ''
  const streetParam = (Array.isArray(raw.street) ? raw.street[0] : raw.street)?.trim() ?? ''
  const tableTowns = await listVisionStreetTowns()
  const towns = mergeKnownTowns(tableTowns)
  const town =
    resolveStreetTown(townParam, towns) ||
    towns.find((name) => name.toLowerCase() === townParam.toLowerCase()) ||
    VISION_GIS_TOWNS.find((row) => row.town.toLowerCase() === townParam.toLowerCase())
      ?.town ||
    (!townParam ? (VISION_GIS_TOWNS[0]?.town ?? 'Westport') : null)
  if (!town) notFound()
  const streets = await listVisionStreets(town)
  const streetNames = streets.map((row) => row.streetName)
  const streetName = streetParam
    ? resolveStreetName(streetParam, streetNames) ||
      streetNames.find((name) => name.toLowerCase() === streetParam.toLowerCase()) ||
      streetParam
    : null

  const portfolios = await loadPortfolios(town, streetName)
  const townHref = `/streets/${townToStreetSlug(town)}`
  const streetHref = streetName
    ? visionStreetPageHref(town, streetName)
    : null

  return (
    <>
      <section className="navy-gradient text-white pt-20 pb-8 lg:pt-24 lg:pb-10 relative overflow-hidden">
        <div className="absolute inset-0 hero-grid opacity-40" aria-hidden />
        <div className="relative mx-auto max-w-7xl px-6 lg:px-10">
          <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold mb-3">
            Admin · Streets
          </p>
          <p className="text-sm text-white/60 mb-3">
            <Link href={townHref} className="hover:text-white">
              Streets
            </Link>
            {streetHref && streetName ? (
              <>
                <span className="mx-2 text-white/35">/</span>
                <Link href={streetHref} className="hover:text-white">
                  {streetName}
                </Link>
              </>
            ) : null}
            <span className="mx-2 text-white/35">/</span>
            Owners
          </p>
          <h1 className="font-serif text-4xl sm:text-5xl text-white leading-[1.08] max-w-3xl">
            {streetName
              ? `Landlords and owners with two or more homes on ${streetName}`
              : `Landlords and owners with two or more homes`}
          </h1>
          <p className="mt-3 max-w-xl font-mono text-sm text-white/70">
            Admin only. Largest first. A landlord is the same person on the
            current (non-superseded) warranty of two or more homes. A later
            warranty replaces the prior buyer; a later quitclaim does not.
            An owner cluster is the same mailbox. Last paid close date
            then price sit on the right; purchase total at the bottom of
            the panel.
            {streetName
              ? ' Count is homes on this street.'
              : ` ${town} — add ?street= to scope one street.`}
          </p>
          {streetName ? (
            <p className="mt-3">
              <Link
                href={visionOwnersPageHref(town)}
                className="font-mono text-[11px] tracking-[0.12em] uppercase text-gold hover:text-white"
              >
                All {town} landlords / owners
              </Link>
            </p>
          ) : null}
        </div>
      </section>
      <section className="bg-cream py-10 lg:py-14">
        <div className="mx-auto max-w-7xl px-6 lg:px-10">
          {portfolios.length === 0 ? (
            <p className="font-mono text-sm text-slate/70">
              No 2+ home clusters
              {streetName ? ` on ${streetName}` : ` in ${town}`} yet. Open
              Find parcels or run{' '}
              <span className="text-navy">npm run sync:owner-clusters</span>.
            </p>
          ) : (
            <ol className="space-y-5">
              {portfolios.map((row) => (
                <li
                  key={row.clusterId}
                  className="rounded-2xl border border-charcoal/[0.08] bg-white px-5 py-4"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-3">
                    <h2 className="font-serif text-2xl text-navy">
                      {row.displayName}
                    </h2>
                    <p className="font-mono text-[11px] tracking-[0.1em] uppercase text-slate">
                      {row.parcelCount}{' '}
                      {row.parcelCount === 1 ? 'home' : 'homes'}
                      {row.relationship === 'landlord'
                        ? ' · landlord'
                        : ' · same mailing'}
                    </p>
                  </div>
                  {row.mailingLabel ? (
                    <p className="mt-1 font-mono text-[12px] text-slate/70">
                      {row.mailingLabel}
                    </p>
                  ) : null}
                  <OwnerPortfolioHomes
                    parcels={row.parcels}
                    purchaseTotalLabel={row.lastPaidTotalLabel}
                  />
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>
    </>
  )
}
