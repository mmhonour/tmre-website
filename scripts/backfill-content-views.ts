/**
 * Rebuild Most Viewed (`content_views`) from retained `visitors.pages` hits.
 *
 * Why: the visitors log predates (or outruns) the durable content_views counter,
 * so Admin → Traffic / Visitors top cards can look empty while the log has paths.
 *
 * Strategy: aggregate every retained page hit per (content_key, vid), then upsert
 * with views = GREATEST(existing, aggregated) so we never double-count live traffic
 * that was already written to content_views, and we never wipe higher live totals
 * when the log only still has the last 50 paths.
 *
 *   npm run backfill:content-views
 *
 * Point at Neon (when .env.local is local Postgres):
 *   $env:DATABASE_URL_UNPOOLED = "postgresql://…neon…"
 *   npm run backfill:content-views
 */

import { resolveViewedContent } from '../lib/content-views'
import { ensureContentViewsTable } from '../lib/db/content-views-repo'
import { query } from '../lib/db/postgres'

type PageHit = { path?: unknown; at?: unknown }

type Agg = {
  contentKey: string
  vid: string
  kind: string
  mlsId: string | null
  path: string
  views: number
  firstAt: string
  lastAt: string
}

function asHit(raw: unknown): { path: string; at: string } | null {
  if (!raw || typeof raw !== 'object') return null
  const hit = raw as PageHit
  const path = typeof hit.path === 'string' ? hit.path.trim() : ''
  const at = typeof hit.at === 'string' ? hit.at.trim() : ''
  if (!path || !at || Number.isNaN(Date.parse(at))) return null
  return { path, at }
}

async function main() {
  console.log('[backfill:content-views] Ensuring content_views table…')
  await ensureContentViewsTable()

  console.log('[backfill:content-views] Reading visitors.pages…')
  const rows = await query<{ vid: string; pages: unknown }>(
    `SELECT vid, pages FROM visitors ORDER BY last_seen DESC`,
  )

  const byKey = new Map<string, Agg>()
  let hitCount = 0
  let skippedHits = 0

  for (const row of rows) {
    const vid = row.vid?.trim()
    if (!vid) continue
    const pages = Array.isArray(row.pages) ? row.pages : []
    for (const raw of pages) {
      const hit = asHit(raw)
      if (!hit) {
        skippedHits += 1
        continue
      }
      hitCount += 1
      const content = resolveViewedContent(hit.path)
      const mapKey = `${content.contentKey}\0${vid}`
      const existing = byKey.get(mapKey)
      if (!existing) {
        byKey.set(mapKey, {
          contentKey: content.contentKey,
          vid,
          kind: content.kind,
          mlsId: content.mlsId,
          path: content.path,
          views: 1,
          firstAt: hit.at,
          lastAt: hit.at,
        })
        continue
      }
      existing.views += 1
      if (Date.parse(hit.at) < Date.parse(existing.firstAt)) {
        existing.firstAt = hit.at
      }
      if (Date.parse(hit.at) > Date.parse(existing.lastAt)) {
        existing.lastAt = hit.at
      }
    }
  }

  console.log(
    `[backfill:content-views] ${rows.length} visitors · ${hitCount} hits · ${byKey.size} (content, vid) rows · ${skippedHits} skipped hits`,
  )

  let upserted = 0
  for (const agg of byKey.values()) {
    await query(
      `INSERT INTO content_views (
         content_key, vid, kind, mls_id, path, views, first_viewed_at, last_viewed_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7::timestamptz, $8::timestamptz
       )
       ON CONFLICT (content_key, vid) DO UPDATE SET
         views = GREATEST(content_views.views, EXCLUDED.views),
         first_viewed_at = LEAST(content_views.first_viewed_at, EXCLUDED.first_viewed_at),
         last_viewed_at = GREATEST(content_views.last_viewed_at, EXCLUDED.last_viewed_at),
         kind = EXCLUDED.kind,
         mls_id = COALESCE(EXCLUDED.mls_id, content_views.mls_id),
         path = EXCLUDED.path`,
      [
        agg.contentKey,
        agg.vid,
        agg.kind,
        agg.mlsId,
        agg.path,
        agg.views,
        agg.firstAt,
        agg.lastAt,
      ],
    )
    upserted += 1
    if (upserted % 100 === 0) {
      process.stdout.write(`\r[backfill:content-views] upserted ${upserted}/${byKey.size}`)
    }
  }
  if (upserted > 0) process.stdout.write('\n')

  const totals = await query<{
    kind: string
    items: string | number
    views: string | number
  }>(
    `SELECT kind,
            count(DISTINCT content_key)::int AS items,
            sum(views)::bigint AS views
     FROM content_views
     GROUP BY kind
     ORDER BY kind`,
  )

  console.log('[backfill:content-views] Done. content_views totals:')
  for (const row of totals) {
    console.log(
      `  ${row.kind}: ${Number(row.items).toLocaleString()} items · ${Number(row.views).toLocaleString()} views`,
    )
  }
}

main().catch((err) => {
  const message =
    err instanceof Error
      ? err.message || err.name || String(err)
      : String(err)
  console.error('[backfill:content-views] FAILED:', message)
  if (err instanceof Error && err.stack) {
    console.error(err.stack)
  }
  console.error(
    'Tip: .env.local DATABASE_URL must reach a running Postgres (local or Neon).',
  )
  process.exit(1)
})
