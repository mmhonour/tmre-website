/**
 * Why isn't this MLS# on /latest? (CLI)
 *
 *   npm run why:latest -- --mls=24197539
 *
 * Answers the question in the order the feed asks it: is the listing in Neon
 * at all, is our copy current, does it earn a badge, and does it survive the
 * feed's own window. Reads only.
 *
 * Written because "it was reduced yesterday and I can't see it" has no visible
 * cause — a listing can be missing because its town's RETS pull failed, because
 * the price ladder never recorded the cut, or because the badge window closed,
 * and all three look identical from the page.
 */

import { existsSync } from 'node:fs'

import { query } from '../lib/db/postgres'
import { getSyncMeta } from '../lib/db/sync-meta'
import { fetchLatestUpdatedListings } from '../lib/latest-listings'
import {
  NEW_LISTING_MAX_DOM,
  PRICE_CHANGE_EVENT_WINDOW_HOURS,
  PRICE_CHANGE_EVENT_WINDOW_MS,
} from '../lib/latest-status-rules'

if (existsSync('.env.local')) {
  process.loadEnvFile('.env.local')
}

function parseMls(argv: string[]): string[] {
  const out: string[] = []
  for (const raw of argv) {
    if (!raw.startsWith('--mls=')) continue
    for (const part of raw.slice('--mls='.length).split(',')) {
      const id = part.trim()
      if (id) out.push(id)
    }
  }
  return out
}

function ageLabel(iso: unknown): string {
  if (typeof iso !== 'string' && !(iso instanceof Date)) return 'null'
  const ms = iso instanceof Date ? iso.getTime() : Date.parse(iso)
  if (!Number.isFinite(ms)) return String(iso)
  const mins = Math.round((Date.now() - ms) / 60_000)
  const stamp = new Date(ms).toISOString()
  if (mins < 60) return `${stamp} (${mins}m ago)`
  if (mins < 60 * 48) return `${stamp} (${Math.round(mins / 60)}h ago)`
  return `${stamp} (${Math.round(mins / 1440)}d ago)`
}

function money(v: unknown): string {
  const n = Number(v)
  return Number.isFinite(n) ? `$${n.toLocaleString()}` : String(v ?? 'null')
}

/** Returns true when this listing is eligible; false when it is not. */
async function inspect(
  mls: string,
  liveFeedIds: Set<string>,
  cachedFeedIds: Set<string> | null,
): Promise<boolean> {
  const rows = await query<{ row: Record<string, unknown> }>(
    `SELECT to_jsonb(l) AS row FROM listings l WHERE mls_id = $1`,
    [mls],
  )
  const row = rows[0]?.row

  console.info(`\n=== ${mls} ===`)
  if (!row) {
    console.info('NOT IN NEON at all.')
    console.info(
      'That means the pull that should have brought it never landed. Check the',
      'town\'s recent incremental outcomes — a RETS 20513 on one town drops that',
      "town's listings silently while the run still records an End.",
    )
    return false
  }

  const town = String(row.town ?? row.city ?? '?')
  console.info(`town              ${town}`)
  console.info(
    `status            ${row.mls_status ?? '(none)'} (bucket ${row.status_bucket})`,
  )
  if (row.previous_mls_status) {
    console.info(
      `previous status   ${row.previous_mls_status} → changed ${ageLabel(row.previous_status_changed_at)}`,
    )
  }
  console.info(`price             ${money(row.price)}`)
  console.info(`original price    ${money(row.original_list_price)}`)
  console.info(`list_date         ${ageLabel(row.list_date)}`)
  console.info(`modification_ts   ${ageLabel(row.modification_timestamp)}`)
  console.info(`price_change_ts   ${ageLabel(row.price_change_timestamp)}`)

  // The badge for a cut hangs entirely off PriceChangeTimestamp, so a row that
  // carries the new price but an old stamp shows nothing and looks like a bug.
  const pcMs = row.price_change_timestamp
    ? Date.parse(String(row.price_change_timestamp))
    : Number.NaN
  const pcFresh =
    Number.isFinite(pcMs) && Date.now() - pcMs <= PRICE_CHANGE_EVENT_WINDOW_MS
  console.info(
    `price change fresh? ${pcFresh ? 'yes' : 'NO'} (window ${PRICE_CHANGE_EVENT_WINDOW_HOURS}h)`,
  )
  console.info(`new-inventory DOM cutoff ${NEW_LISTING_MAX_DOM} days`)

  const history = await query<{
    changed_at: string
    previous_price: string | null
    price: string | null
    previous_status: string | null
  }>(
    `SELECT changed_at::text, previous_price::text, price::text, previous_status
       FROM listing_price_history WHERE mls_id = $1
       ORDER BY changed_at DESC LIMIT 5`,
    [mls],
  ).catch(() => [])
  console.info(`\nprice history rows: ${history.length}`)
  for (const h of history) {
    console.info(
      `  ${h.changed_at} ${money(h.previous_price)} → ${money(h.price)}${
        h.previous_status ? ` (was ${h.previous_status})` : ''
      }`,
    )
  }

  // Live and cached are separate answers. The page reads a warm snapshot when
  // it passes its freshness gates, so "eligible in the database but absent from
  // the cache" is a real and otherwise invisible state.
  const live = liveFeedIds.has(mls)
  console.info(`\neligible now (live query)?  ${live ? 'YES' : 'NO'}`)
  if (cachedFeedIds) {
    console.info(
      `present in warm feed cache? ${cachedFeedIds.has(mls) ? 'YES' : 'NO'}`,
    )
  } else {
    console.info('present in warm feed cache? (no cache stored)')
  }

  if (live && cachedFeedIds && !cachedFeedIds.has(mls)) {
    console.info(
      '  Eligible but missing from the warm cache — the page will show it only',
      'once that cache is rebuilt, or immediately if the cache fails its',
      'freshness gates. Rebuild: Admin → Syncs → Sync now on Stats cache.',
    )
  } else if (live) {
    console.info(
      '  In the feed. If the page still hides it, the page is filtering: a town',
      'or zip selection, a status pill, or a collapsed day group.',
    )
  } else {
    console.info(
      '  Not feed-eligible. Compare the price and timestamps above against MLS:',
      'if they lag, our copy predates the change and this is a sync problem,',
      'not a feed problem.',
    )
  }
  return live
}

async function main() {
  const ids = parseMls(process.argv.slice(2))
  if (ids.length === 0) {
    console.error('Usage: npm run why:latest -- --mls=24197539,24201368')
    process.exit(1)
  }

  // Bypass the warm cache so the live answer reflects the database, then read
  // the cache separately to compare.
  const [liveFeed, cachedFeed] = await Promise.all([
    fetchLatestUpdatedListings({ limit: 400, bypassGlobalFeedCache: true }),
    import('@/lib/latest-feed-cache')
      .then((m) => m.readLatestGlobalFeedCache(400))
      .catch(() => null),
  ])
  const liveIds = new Set(liveFeed.map((r) => r.mlsId))
  const cachedIds = cachedFeed ? new Set(cachedFeed.map((r) => r.mlsId)) : null

  console.info(
    `live feed rows ${liveFeed.length} · warm cache rows ${cachedFeed?.length ?? '(none)'}`,
  )
  console.info(
    `last incremental End ${ageLabel(await getSyncMeta('last_incremental_sync'))}`,
  )

  // The single most common answer, and the one the Dashboard used to hide.
  const { readIncrementalPartialRun } = await import(
    '../lib/incremental-partial-run'
  )
  const partial = await readIncrementalPartialRun()
  if (partial) {
    console.info(
      `PARTIAL last run — no data for: ${partial.towns.join(', ')} (${ageLabel(partial.at)})`,
    )
  }

  let missing = 0
  for (const mls of ids) {
    if (!(await inspect(mls, liveIds, cachedIds))) missing += 1
  }

  const failures = await query<{ finished_at: string; detail: string | null }>(
    `SELECT finished_at::text, detail FROM sync_queue
      WHERE job_id = 'incremental' AND ok = false
      ORDER BY finished_at DESC LIMIT 3`,
  ).catch(() => [])
  if (failures.length > 0) {
    console.info('\nrecent incremental failures:')
    for (const f of failures) {
      console.info(`  ${f.finished_at} — ${f.detail ?? ''}`)
    }
    console.info(
      'If a town above appears in these errors, that is the answer for that',
      "listing: the town's inventory is not being pulled.",
    )
  }

  console.info(`\n${ids.length - missing}/${ids.length} eligible`)
  process.exit(missing > 0 ? 1 : 0)
}

void main().catch((err) => {
  console.error('probe failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
