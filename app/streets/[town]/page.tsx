import Link from 'next/link'
import { notFound } from 'next/navigation'
import { isAdminAuthorizedFromCookies } from '@/lib/admin-auth'
import SitePasswordGate from '@/components/SitePasswordGate'
import {
  countVisionStreetParcelsByStreet,
  listVisionStreets,
  listVisionStreetTowns,
} from '@/lib/db/vision-streets-repo'
import { VISION_GIS_TOWNS } from '@/lib/vision-gis-towns'
import {
  resolveStreetTown,
  streetNameToSlug,
  townToStreetSlug,
} from '@/lib/vision-streets-page'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Streets — TMRE',
  description: 'Official assessor street names by town.',
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

export default async function StreetsTownPage({
  params,
}: {
  params: Promise<{ town: string }>
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

  const { town: slug } = await params
  const tableTowns = await listVisionStreetTowns()
  const towns = mergeKnownTowns(tableTowns)
  const town = resolveStreetTown(slug, towns)
  if (!town) notFound()

  const streets = await listVisionStreets(town)
  const parcelCounts = await countVisionStreetParcelsByStreet(town)
  const addressTotal = [...parcelCounts.values()].reduce((n, c) => n + c, 0)
  const byLetter = new Map<string, string[]>()
  for (const row of streets) {
    const letter = (row.letter || row.streetName.slice(0, 1) || '?').toUpperCase()
    const list = byLetter.get(letter) ?? []
    list.push(row.streetName)
    byLetter.set(letter, list)
  }
  const letters = [...byLetter.keys()].sort((a, b) => a.localeCompare(b))

  return (
    <>
      <section className="navy-gradient text-white pt-20 pb-10 lg:pt-28 lg:pb-14 relative overflow-hidden">
        <div className="absolute inset-0 hero-grid opacity-40" aria-hidden />
        <div className="relative mx-auto max-w-7xl px-6 lg:px-10">
          <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold mb-3">
            Admin · Streets
          </p>
          <h1 className="font-serif italic text-4xl sm:text-5xl text-white leading-[1.05]">
            Streets
          </h1>
          <p className="mt-3 text-sm text-white/70 max-w-xl leading-relaxed">
            Official assessor streets from Vision GIS, with house numbers from
            each street page. Not on the public menu.{' '}
            {streets.length.toLocaleString()}{' '}
            {streets.length === 1 ? 'street' : 'streets'}
            {addressTotal > 0
              ? ` · ${addressTotal.toLocaleString()} addresses`
              : ''}{' '}
            in {town}.
          </p>
          {towns.length > 1 ? (
            <div className="mt-6 flex flex-wrap gap-2">
              {towns.map((name) => {
                const href = `/streets/${townToStreetSlug(name)}`
                const active = name === town
                return (
                  <Link
                    key={name}
                    href={href}
                    className={
                      active
                        ? 'rounded-full bg-gold px-3 py-1 text-[12px] font-medium text-navy'
                        : 'rounded-full border border-white/25 px-3 py-1 text-[12px] text-white/80 hover:border-white/60'
                    }
                  >
                    {name}
                  </Link>
                )
              })}
            </div>
          ) : (
            <p className="mt-5 font-mono text-[11px] tracking-[0.16em] uppercase text-white/50">
              {town}
            </p>
          )}
        </div>
      </section>

      <section className="bg-white py-10 lg:py-14">
        <div className="mx-auto max-w-7xl px-6 lg:px-10">
          {streets.length === 0 ? (
            <p className="text-sm text-charcoal/70 max-w-xl leading-relaxed">
              No street names stored for {town} yet. The Vision crawler writes
              this index the next time it loads a letter page. Admin → Syncs →
              Vision addresses.
            </p>
          ) : (
            <>
              <nav
                className="flex flex-wrap gap-x-3 gap-y-1 text-[13px] font-mono"
                aria-label="Letters"
              >
                {letters.map((letter) => (
                  <a
                    key={letter}
                    href={`#letter-${letter}`}
                    className="text-navy/70 hover:text-navy"
                  >
                    {letter}
                  </a>
                ))}
              </nav>
              <div className="mt-8 space-y-10">
                {letters.map((letter) => (
                  <div key={letter} id={`letter-${letter}`}>
                    <h2 className="font-serif italic text-2xl text-navy mb-3">
                      {letter}
                    </h2>
                    <ul className="columns-1 sm:columns-2 lg:columns-3 gap-x-10">
                      {(byLetter.get(letter) ?? []).map((name) => {
                        const n = parcelCounts.get(name) ?? 0
                        return (
                          <li key={name} className="break-inside-avoid py-0.5">
                            <Link
                              href={`/streets/${townToStreetSlug(town)}/${streetNameToSlug(name)}`}
                              className="text-sm text-charcoal/85 hover:text-navy"
                            >
                              {name}
                              {n > 0 ? (
                                <span className="ml-1 font-mono text-[11px] text-charcoal/45">
                                  {n}
                                </span>
                              ) : null}
                            </Link>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </section>
    </>
  )
}
