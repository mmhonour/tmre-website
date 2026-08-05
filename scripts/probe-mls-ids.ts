/**
 * One-shot: look up MLS ids in SmartMLS RETS (not Neon).
 * Usage: npx tsx --env-file=.env.local --require ./scripts/stub-server-only.cjs scripts/probe-mls-ids.ts 24196609 24196740
 * Optional: --town-pull Weston Active 2026-08-03T00:00:00.000Z
 */
import {
  getListingByMlsId,
  isRetsConfigured,
  type Listing,
} from '../lib/rets'
import { searchMarketListingsForTown } from '../lib/listings-store'
import type { TmreTown } from '../lib/tmre-towns'

function addrLine(L: Listing): string {
  const a = L.address
  if (!a) return '?'
  if (a.full?.trim()) return a.full.trim()
  return [a.street, a.city, a.state, a.postalCode].filter(Boolean).join(', ') || '?'
}

async function main() {
  const argv = process.argv.slice(2)
  const townPullIdx = argv.indexOf('--town-pull')
  if (townPullIdx >= 0) {
    const town = argv[townPullIdx + 1] as TmreTown
    const status = argv[townPullIdx + 2] ?? 'Active'
    const modifiedAfter =
      argv[townPullIdx + 3] ??
      new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
    console.log('town-pull', { town, status, modifiedAfter })
    const rows = await searchMarketListingsForTown(town, status, 500, {
      modifiedAfter,
    })
    console.log(`hits=${rows.length}`)
    for (const id of ['24196609', '24196740', '24184227']) {
      const hit = rows.find((r) => r.mlsId === id)
      console.log(id, hit ? `IN PULL · ${hit.status} · ${addrLine(hit)}` : 'not in this pull')
    }
    return
  }

  const ids = argv.filter((a) => !a.startsWith('-'))
  if (ids.length === 0) {
    console.error('Usage: scripts/probe-mls-ids.ts <mlsId>…')
    process.exit(2)
  }
  console.log('RETS configured:', isRetsConfigured())
  for (const id of ids) {
    try {
      const L = await getListingByMlsId(id)
      if (!L) {
        console.log(`${id}\tRETS: NOT FOUND`)
        continue
      }
      const city =
        typeof L.address === 'object' && L.address
          ? (L.address.city ?? '?')
          : '?'
      console.log(
        [
          id,
          city,
          addrLine(L),
          L.status ?? '?',
          `mod=${L.modificationTimestamp ?? '?'}`,
          `list=${L.listDate ?? '?'}`,
          `type=${L.propertyType ?? '?'}`,
        ].join('\t'),
      )
    } catch (err) {
      console.log(
        `${id}\tERR\t${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
