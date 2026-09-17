#!/usr/bin/env node
/**
 * Pull listing photos for rows already in Postgres and store bytes on R2.
 *
 * Incremental sync only writes MLS rows (and queues new inserts for Site warm).
 * Everything already in inventory stays cold until someone opens the showcase
 * (`?size=full` → Media/RETS → R2). This CLI walks those rows and stores the
 * missing bytes. Do not run it on Railway Incremental — that process OOMs
 * when it fetches photo bodies. Railway R2 photo scavenger (`hero-photos`) already
 * scavenges remaining photos for every listing (Active or not) between runs; use this
 * when you have time for a faster catch-up (`--all`, town/status filters).
 *
 * Targets (printed at start — read them before walking away):
 *   listings  → DATABASE_URL (often localhost)
 *   photos    → prod R2 when R2_* is set
 *   index     → prod Neon (required when R2 is set). Localhost index is
 *               refused unless you pass --index-local.
 *
 * Default is the showcase hero: first six shots at size=full. `--all` fills
 * every photo slot at display quality (the post-town-sync warm).
 * `--all` gap scan reads listing_photo_index in 400-id SQL chunks so Closed
 * inventory does not exhaust the Neon pooler (`timeout exceeded when trying
 * to connect`). Hero mode still walks two listings at a time.
 *
 * Usage:
 *   npm run backfill:listing-photos
 *   npm run backfill:listing-photos -- --dry-run
 *   npm run backfill:listing-photos -- --town=Westport
 *   npm run backfill:listing-photos -- --towns=Westport,Norwalk --limit=40
 *   npm run backfill:listing-photos -- --all --concurrency=2
 *   npm run backfill:listing-photos -- --status=Closed
 *   npm run backfill:listing-photos -- --index-local
 *
 * If yesterday already filled R2 and only the index is on localhost:
 *   npm run backfill:photo-index -- --from-local
 */
import { existsSync, readFileSync } from 'node:fs'
import { readListingsFromDb } from '../lib/db/listings-repo'
import {
  backfillListingPhotos,
  listPhotoBackfillCandidates,
  type ListingPhotoBackfillMode,
} from '../lib/listing-photos-sync'
import { photoBackendUsesR2 } from '../lib/listing-photo-backend'
import { listingPhotoCacheId } from '../lib/listing-photo-store'
import {
  formatScriptDbTarget,
  pickListingsDbTarget,
  pickProdDbTarget,
} from '../lib/script-postgres-target'
import type { Listing } from '../lib/rets'
import { isTmreTown, TMRE_TOWNS, type TmreTown } from '../lib/tmre-towns'

if (existsSync('.env.local')) {
  process.loadEnvFile('.env.local')
}

const STATUS_BUCKETS = ['Active', 'Closed', 'Expired'] as const
type StatusBucket = (typeof STATUS_BUCKETS)[number]

function argValue(flag: string): string | null {
  const prefix = `${flag}=`
  for (const arg of process.argv.slice(2)) {
    if (arg === flag) return 'true'
    if (arg.startsWith(prefix)) return arg.slice(prefix.length)
  }
  return null
}

function parseTowns(): TmreTown[] {
  const raw = argValue('--towns') ?? argValue('--town')
  if (!raw || raw === 'true') return [...TMRE_TOWNS]
  const towns = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is TmreTown => isTmreTown(s))
  return towns.length > 0 ? towns : [...TMRE_TOWNS]
}

function parseStatuses(): StatusBucket[] {
  const raw = (argValue('--status') ?? 'Active').trim()
  if (raw.toLowerCase() === 'all') return [...STATUS_BUCKETS]
  const wanted = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is StatusBucket =>
      STATUS_BUCKETS.includes(s as StatusBucket),
    )
  return wanted.length > 0 ? wanted : ['Active']
}

function parseArgs() {
  const all = argValue('--all') === 'true'
  const mode: ListingPhotoBackfillMode = all ? 'all' : 'hero'
  const dryRun = argValue('--dry-run') === 'true'
  const indexLocal = argValue('--index-local') === 'true'
  const concurrency = Math.max(1, Number(argValue('--concurrency') ?? '2') || 2)
  const limitRaw = argValue('--limit')
  const limit = limitRaw != null ? Math.max(0, Number(limitRaw) || 0) : 0
  return {
    mode,
    dryRun,
    indexLocal,
    concurrency,
    limit,
    towns: parseTowns(),
    statuses: parseStatuses(),
  }
}

function resolvePhotoIndexTarget(indexLocal: boolean): void {
  const listings = pickListingsDbTarget(process.env)
  const r2 = photoBackendUsesR2()
  const bucket = process.env.R2_BUCKET?.trim() || '(unset)'

  console.info(
    `[backfill:listing-photos] listings=${
      listings ? formatScriptDbTarget(listings) : '(DATABASE_URL unset)'
    }`,
  )
  console.info(
    `[backfill:listing-photos] photos=${
      r2 ? `prod R2 bucket=${bucket}` : 'localhost SQLite listing-photos.db'
    }`,
  )

  if (!r2) {
    console.info(
      '[backfill:listing-photos] index=localhost SQLite (R2 unset — no Neon index write)',
    )
    return
  }

  if (indexLocal) {
    console.warn(
      `[backfill:listing-photos] index=${
        listings ? formatScriptDbTarget(listings) : 'localhost'
      } (--index-local; prod R2 photo scavenger will not see these rows)`,
    )
    return
  }

  const envFileText = existsSync('.env.local')
    ? readFileSync('.env.local', 'utf8')
    : null
  const picked = pickProdDbTarget({ env: process.env, envFileText })
  if ('error' in picked) {
    console.error(
      '[backfill:listing-photos] photos=prod R2 but index would go to localhost.',
    )
    console.error(`[backfill:listing-photos] ${picked.error}`)
    console.error(
      '[backfill:listing-photos] Set a real Neon DATABASE_URL_UNPOOLED, or pass --index-local to write the index to localhost anyway.',
    )
    process.exit(1)
  }

  process.env.LISTING_PHOTO_INDEX_URL = picked.target.value
  const sameHost = listings?.host === picked.target.host
  console.info(
    `[backfill:listing-photos] index=prod ${formatScriptDbTarget(picked.target)}` +
      (sameHost ? ' (same as listings)' : ` · ${picked.source}`),
  )
}

function listingLabel(listing: Listing): string {
  const addr = listing.address?.street?.trim() || listing.mlsId
  const id = listingPhotoCacheId(listing)
  const count = listing.photoCount ?? 0
  return `${addr} · ${id} · photos=${count}`
}

async function main() {
  const { mode, dryRun, indexLocal, concurrency, limit, towns, statuses } =
    parseArgs()

  console.info(
    `[backfill:listing-photos] mode=${mode}` +
      `${dryRun ? ' (dry-run)' : ''}` +
      ` · towns=${towns.join(',')}` +
      ` · status=${statuses.join(',')}` +
      ` · concurrency=${concurrency}` +
      (limit > 0 ? ` · limit=${limit}` : ''),
  )

  resolvePhotoIndexTarget(indexLocal)

  if (!photoBackendUsesR2()) {
    console.warn(
      '[backfill:listing-photos] R2 is not configured — bytes will land in the local SQLite photo store. Set R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET to fill the prod bucket.',
    )
  }

  let scanned = 0
  let needed = 0
  let listingsDone = 0
  let photosStored = 0
  let remaining = limit > 0 ? limit : Infinity
  const drySamples: string[] = []

  for (const town of towns) {
    if (remaining <= 0) break
    for (const status of statuses) {
      if (remaining <= 0) break
      const rows = await readListingsFromDb(town, status)
      const withPhotos = rows.filter((row) => (row.photoCount ?? 0) > 0)
      const gaps = await listPhotoBackfillCandidates(withPhotos, mode, {
        progressLabel: `${town} ${status}`,
      })
      const batch =
        remaining < Infinity ? gaps.slice(0, remaining) : gaps
      const skipped = gaps.length - batch.length

      scanned += withPhotos.length
      needed += batch.length
      if (limit > 0) remaining -= batch.length

      let townPulled = 0
      let townPhotos = 0
      if (dryRun) {
        for (const row of batch) {
          if (drySamples.length >= 20) break
          drySamples.push(`${town} ${status} · ${listingLabel(row)}`)
        }
      } else if (batch.length > 0) {
        const pulled = await backfillListingPhotos(batch, {
          mode,
          concurrency,
          progressLabel: `${town} ${status}`,
          alreadyCandidates: true,
        })
        listingsDone += pulled.listings
        photosStored += pulled.photos
        townPulled = pulled.listings
        townPhotos = pulled.photos
      }

      console.info(
        `[backfill:listing-photos] ${town} ${status} — scanned=${withPhotos.length} missing=${batch.length}` +
          (skipped > 0 ? ` (${skipped} more in town, over --limit)` : '') +
          (dryRun ? '' : ` pulled=${townPulled} photos=${townPhotos}`),
      )
    }
  }

  if (dryRun && drySamples.length > 0) {
    console.info('[backfill:listing-photos] sample gaps:')
    for (const line of drySamples) console.info(`  ${line}`)
    if (needed > drySamples.length) {
      console.info(`  … ${needed - drySamples.length} more`)
    }
  }

  console.info(
    `[backfill:listing-photos] done — scanned=${scanned} missing=${needed}` +
      (dryRun ? '' : ` listings=${listingsDone} photos=${photosStored}`),
  )
}

main().catch((err) => {
  console.error('[backfill:listing-photos] fatal', err)
  process.exit(1)
})
