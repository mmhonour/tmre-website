/**
 * Audit the LIVE site's Active inventory against the live MLS.
 *
 * Production Postgres is not reachable from this machine, so the site's own
 * public API is the source of truth for "what tmrebuilder.com shows as Active",
 * and local RETS credentials supply the MLS Active family to compare against.
 *
 *   npx tsx --require ./scripts/stub-server-only.cjs --env-file=.env.local \
 *     scripts/tmp-prod-active-audit.ts
 *
 * Read-only: reads the public API and RETS, writes nothing.
 */
import { getListingByMlsId } from '../lib/rets'
import { searchMarketListingsForTown } from '../lib/listings-store'
import { TMRE_TOWNS, type TmreTown } from '../lib/tmre-towns'

const SITE = process.env.AUDIT_SITE_URL ?? 'https://tmrebuilder.com'

const ACTIVE_FAMILY = [
  'Active',
  'Coming Soon',
  'Under Contract',
  'Under Contract - Continue to Show',
] as const

const FETCH_LIMIT = 2500
/** Per-MLS RETS lookups are one login each. */
const LOOKUP_CAP = 120

/**
 * Shape from /api/intelligence/deal-board. That endpoint is used instead of
 * /api/listings?city= because the CDN serves one cached body for every city on
 * that route (no Netlify-Vary on the query string), so per-town requests come
 * back as whichever town was cached first.
 */
type SiteListing = {
  mlsId: string
  status: string
  contractStatus: string | null
  price: number | null
  dom: number | null
  address: string | null
  isRental: boolean
}

function money(value: number | null): string {
  return value == null ? '—' : `$${Math.round(value).toLocaleString('en-US')}`
}

let boardCache: {
  generatedAt?: string
  towns?: Record<string, SiteListing[]>
} | null = null

async function fetchBoard() {
  if (boardCache) return boardCache
  const url = `${SITE}/api/intelligence/deal-board`
  const res = await fetch(url, { headers: { accept: 'application/json' } })
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`)
  boardCache = (await res.json()) as { generatedAt?: string; towns?: Record<string, SiteListing[]> }
  console.log(`deal board generatedAt: ${boardCache.generatedAt ?? '—'}`)
  return boardCache
}

async function fetchSiteActives(town: TmreTown): Promise<SiteListing[]> {
  const board = await fetchBoard()
  return board.towns?.[town] ?? []
}

type TownAudit = {
  town: TmreTown
  siteCount: number
  mlsCount: number
  stale: SiteListing[]
  missingFromSite: string[]
  errors: string[]
}

async function auditTown(town: TmreTown): Promise<TownAudit> {
  const errors: string[] = []
  const site = await fetchSiteActives(town)

  const liveIds = new Set<string>()
  for (const status of ACTIVE_FAMILY) {
    try {
      const listings = await searchMarketListingsForTown(town, status, FETCH_LIMIT)
      for (const listing of listings) {
        const id = (listing.mlsId ?? '').trim()
        if (id) liveIds.add(id)
      }
    } catch (err) {
      errors.push(`${status}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const siteIds = new Set(site.map((l) => (l.mlsId ?? '').trim()).filter(Boolean))
  const stale =
    errors.length > 0 ? [] : site.filter((l) => !liveIds.has((l.mlsId ?? '').trim()))
  const missingFromSite =
    errors.length > 0 ? [] : [...liveIds].filter((id) => !siteIds.has(id))

  return {
    town,
    siteCount: site.length,
    mlsCount: liveIds.size,
    stale,
    missingFromSite,
    errors,
  }
}

async function main() {
  console.log(`site: ${SITE}`)
  const audits: TownAudit[] = []
  for (const town of TMRE_TOWNS) {
    process.stdout.write(`auditing ${town}… `)
    try {
      const audit = await auditTown(town)
      console.log(
        `site=${audit.siteCount} mls=${audit.mlsCount} phantom=${audit.stale.length} missing=${audit.missingFromSite.length}${audit.errors.length ? ` ERRORS ${audit.errors.join('; ')}` : ''}`,
      )
      audits.push(audit)
    } catch (err) {
      console.log(`FAILED ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // Classify the phantoms: Closed rows are still visible in our RETS view, so a
  // successful lookup names the real status; NO_RECORDS_FOUND means the record
  // left our feed entirely (Withdrawn / Expired / Temp off market / Hold).
  const allStale = audits.flatMap((audit) =>
    audit.stale.map((listing) => ({ town: audit.town, listing })),
  )
  const truth = new Map<string, string>()
  console.log(
    `\nclassifying ${Math.min(allStale.length, LOOKUP_CAP)} of ${allStale.length} phantoms via per-MLS lookup…`,
  )
  for (const { listing } of allStale.slice(0, LOOKUP_CAP)) {
    const id = (listing.mlsId ?? '').trim()
    try {
      const live = await getListingByMlsId(id)
      truth.set(id, live ? live.status || '(blank)' : 'off-feed (withdrawn/expired/hold)')
    } catch {
      truth.set(id, 'lookup failed')
    }
  }

  const byTruth = new Map<string, number>()
  const byDomBand = new Map<string, number>()
  let rentals = 0
  for (const { listing } of allStale) {
    const id = (listing.mlsId ?? '').trim()
    const verdict = truth.get(id) ?? '(not sampled)'
    byTruth.set(verdict, (byTruth.get(verdict) ?? 0) + 1)
    if (listing.isRental) rentals += 1
    const d = listing.dom ?? 9999
    const band =
      d <= 7 ? '0-7d' : d <= 30 ? '8-30d' : d <= 90 ? '31-90d' : d <= 180 ? '91-180d' : '180d+'
    byDomBand.set(band, (byDomBand.get(band) ?? 0) + 1)
  }

  console.log(`\n=== PHANTOM ACTIVES ON THE LIVE SITE ===`)
  for (const audit of audits) {
    if (audit.stale.length === 0) continue
    console.log(`\n${audit.town} — ${audit.stale.length} of ${audit.siteCount}`)
    for (const listing of audit.stale) {
      const id = (listing.mlsId ?? '').trim()
      console.log(
        `  ${id.padEnd(10)} shows=${(listing.contractStatus || listing.status || '—').padEnd(34)} mls=${(truth.get(id) ?? '(not sampled)').padEnd(36)} ${money(listing.price).padEnd(12)} dom=${listing.dom ?? '—'}  ${listing.address ?? '—'}`,
      )
    }
  }

  const siteTotal = audits.reduce((sum, a) => sum + a.siteCount, 0)
  const mlsTotal = audits.reduce((sum, a) => sum + a.mlsCount, 0)
  const staleTotal = audits.reduce((sum, a) => sum + a.stale.length, 0)
  const missingTotal = audits.reduce((sum, a) => sum + a.missingFromSite.length, 0)

  console.log(`\n=== TOTALS ===`)
  console.log(`site Active rows:            ${siteTotal}`)
  console.log(`MLS Active-family listings:  ${mlsTotal}`)
  console.log(
    `phantom (site says active, MLS does not): ${staleTotal}${siteTotal ? ` (${((staleTotal / siteTotal) * 100).toFixed(1)}%)` : ''}`,
  )
  console.log(`missing (MLS active, site has no row):     ${missingTotal}`)
  console.log(`rentals among phantoms:       ${rentals} of ${staleTotal}`)
  console.log('\nphantoms by real MLS state:')
  for (const [verdict, count] of [...byTruth].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${verdict.padEnd(38)} ${count}`)
  }
  console.log('\nphantoms by days on market as we show it:')
  for (const band of ['0-7d', '8-30d', '31-90d', '91-180d', '180d+']) {
    const count = byDomBand.get(band)
    if (count) console.log(`  ${band.padEnd(10)} ${count}`)
  }
  console.log('\nmissing-from-site MLS numbers (first 40 per town):')
  for (const audit of audits) {
    if (audit.missingFromSite.length === 0) continue
    console.log(
      `  ${audit.town}: ${audit.missingFromSite.slice(0, 40).join(', ')}${audit.missingFromSite.length > 40 ? ` … +${audit.missingFromSite.length - 40}` : ''}`,
    )
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
