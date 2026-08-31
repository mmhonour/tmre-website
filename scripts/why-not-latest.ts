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

function parseMls(argv: string[]): string | null {
  for (const raw of argv) {
    if (raw.startsWith('--mls=')) return raw.slice('--mls='.length).trim()
  }
  return null
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

async function main() {
  const mls = parseMls(process.argv.slice(2))
  if (!mls) {
    console.error('Usage: npm run why:latest -- --mls=24197539')
    process.exit(1)
  }

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
    process.exit(1)
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

  // The real feed, not a reimplementation of it — the point is to agree with
  // the page rather than to have a second opinion about it.
  const feed = await fetchLatestUpdatedListings({ limit: 300 })
  const hit = feed.find((r) => r.mlsId === mls)
  console.info(`\nin /latest feed (top 300)? ${hit ? 'YES' : 'NO'}`)
  if (hit) {
    console.info(`  badge ${hit.status} · town ${hit.town}`)
    console.info(
      '  It is in the feed. If the page is not showing it, the page is filtering:',
      'a town or zip selection, a status pill, or a collapsed day group.',
    )
  } else {
    console.info(
      '  Not feed-eligible. Most likely: our copy predates the change',
      '(compare price above against MLS), or price_change_timestamp is stale,',
      'or the listing is Pending / under contract, which never appears.',
    )
  }

  console.info(`\nlast incremental End  ${ageLabel(await getSyncMeta('last_incremental_sync'))}`)

  const failures = await query<{ finished_at: string; detail: string | null }>(
    `SELECT finished_at::text, detail FROM sync_queue
      WHERE job_id = 'incremental' AND ok = false
      ORDER BY finished_at DESC LIMIT 3`,
  ).catch(() => [])
  if (failures.length > 0) {
    console.info('recent incremental failures:')
    for (const f of failures) {
      console.info(`  ${f.finished_at} — ${f.detail ?? ''}`)
    }
    console.info(
      `\nIf ${town} appears in those errors, that is your answer: that town's`,
      'listings are not being pulled.',
    )
  }
  process.exit(0)
}

void main().catch((err) => {
  console.error('probe failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
