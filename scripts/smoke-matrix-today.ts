/**
 * Smoke today's SmartMLS matrix: RETS + DB presence.
 * Usage:
 *   npx tsx --env-file=.env.local --require ./scripts/stub-server-only.cjs scripts/smoke-matrix-today.ts
 *   … --pull   # run Incremental all towns first
 */
import { hydrateSyncMetaStore, getSyncMeta } from '../lib/db/sync-meta-store'
import { getListingByMlsId, isRetsConfigured } from '../lib/rets'
import { query } from '../lib/db/postgres'
import { syncIncrementalListings } from '../lib/listings-sync'
import { NEW_LISTING_MAX_DOM } from '../lib/latest-status-rules'

const MATRIX: { mls: string; city: string; note: string }[] = [
  { mls: '24196334', city: 'Fairfield', note: 'NEW' },
  { mls: '24194486', city: 'Fairfield', note: 'NEW · 839 Oldfield (matrix)' },
  { mls: '24194568', city: 'Fairfield', note: 'prior Oldfield cite' },
  { mls: '24196292', city: 'Fairfield', note: 'NEW' },
  { mls: '24195441', city: 'New Canaan', note: 'NEW' },
  { mls: '24195961', city: 'Norwalk', note: 'NEW' },
  { mls: '24178081', city: 'Ridgefield', note: 'CS' },
  { mls: '24190698', city: 'Wilton', note: 'ACTV DOM23' },
]

function latestHint(status: string, dom: number | null, listDate: string | null): string {
  const s = status.trim().toLowerCase()
  if (s === 'coming soon' || s === 'cs') return 'Coming Soon'
  if (s === 'pending' || s === 'p') return 'excluded'
  if (s.includes('under contract')) return 'excluded'
  if (s === 'active' || s === 'a' || s === 'new') {
    const listMs = listDate ? Date.parse(listDate) : NaN
    const withinList =
      Number.isFinite(listMs) &&
      Date.now() - listMs <= NEW_LISTING_MAX_DOM * 86400_000
    const withinDom = dom != null && dom <= NEW_LISTING_MAX_DOM
    if (withinDom || withinList) return 'New'
    return 'excluded (Active, not New window)'
  }
  return `excluded (${status})`
}

async function main() {
  const doPull = process.argv.includes('--pull')
  console.log('RETS configured:', isRetsConfigured())
  await hydrateSyncMetaStore()

  if (doPull) {
    console.log('\n--- Incremental all towns ---')
    const result = await syncIncrementalListings({
      postHooks: false,
      stepLogSource: 'cli',
    })
    console.log(
      `upserts=${result.totalUpserted} finishedAt=${result.finishedAt}`,
    )
    for (const t of result.towns) {
      console.log(
        `  ${t.town}: ${t.ok ? `${t.count} (${t.inserted ?? 0} new, ${t.updated ?? 0} upd)` : `FAIL ${t.error}`}`,
      )
    }
  }

  console.log('\n--- sync_meta ---')
  console.log('End', getSyncMeta('last_incremental_sync') ?? 'null')
  console.log(
    'Railway heartbeat',
    getSyncMeta('last_mls_sync_heartbeat') ?? 'never',
  )

  console.log('\n--- matrix ---')
  let retsOk = 0
  let dbOk = 0
  let latestOk = 0
  for (const row of MATRIX) {
    const rets = await getListingByMlsId(row.mls).catch(() => null)
    if (rets) retsOk++
    const db = (
      await query<{
        id: string
        mls_status: string | null
        synced_at: string | null
      }>(
        `SELECT id, mls_status, synced_at::text
         FROM listings WHERE id = $1 OR mls_id = $1 LIMIT 1`,
        [row.mls],
      )
    )[0]

    if (db) dbOk++
    const hint = rets
      ? latestHint(rets.status, rets.dom, rets.listDate)
      : '—'
    if (hint === 'New' || hint === 'Coming Soon') latestOk++

    console.log(
      [
        row.mls,
        row.note,
        rets
          ? `RETS:${rets.status}/DOM${rets.dom ?? '?'}`
          : 'RETS:MISS',
        db ? `DB:${db.mls_status}` : 'DB:MISS',
        `latest?:${hint}`,
      ].join(' | '),
    )
  }

  console.log('\n--- summary ---')
  console.log(
    `RETS ${retsOk}/${MATRIX.length} · DB ${dbOk}/${MATRIX.length} · likely /latest ${latestOk}/${MATRIX.length}`,
  )
  console.log(
    'DB = DATABASE_URL in env (localhost here ≠ Netlify Neon). /latest on prod needs Neon + feed rebuild.',
  )
  if (dbOk < MATRIX.length - 1) process.exitCode = 1 // allow one of the two Oldfield ids to miss
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
