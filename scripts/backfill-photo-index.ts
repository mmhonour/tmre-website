#!/usr/bin/env node
/**
 * Upsert Postgres `listing_photo_index` for photos already in Cloudflare R2.
 * Does not re-pull MLS / RETS.
 *
 * TARGET: prod (Neon) by default. Bytes live in the shared R2 bucket; the
 * index must follow prod Postgres or the heroes job still reports missing.
 *
 * Default (R2 → Neon):
 *   npm run backfill:photo-index
 *
 * Copy local listing_photo_index → Neon (no R2 list, no MLS fetch):
 *   npm run backfill:photo-index -- --from-local
 *
 * Test a handful of rows first:
 *   npm run backfill:photo-index -- --from-local --limit=20
 *
 * Dry-run (counts only, no Neon writes):
 *   npm run backfill:photo-index -- --from-local --dry-run
 *
 * Localhost dest is refused unless you pass --allow-local.
 */
import { existsSync, readFileSync } from 'node:fs'
import pg from 'pg'
import { ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3'
import {
  formatScriptDbTarget,
  pickListingsDbTarget,
  pickProdDbTarget,
  shouldUseSslForDbUrl,
  type ScriptDbTarget,
} from '../lib/script-postgres-target'

const PHOTO_KEY_PREFIX = 'photos/'
const CHUNK_ROWS = 500

function argFlag(name: string): boolean {
  return process.argv.slice(2).includes(name)
}

function argValue(flag: string): string | null {
  const prefix = `${flag}=`
  for (const arg of process.argv.slice(2)) {
    if (arg === flag) return 'true'
    if (arg.startsWith(prefix)) return arg.slice(prefix.length)
  }
  return null
}

function parseLimit(): number {
  const raw = argValue('--limit')
  if (raw == null || raw === 'true') return 0
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}

function readEnv(name: string): string | null {
  const value = process.env[name]?.trim()
  return value ? value : null
}

function envFileText(): string | null {
  return existsSync('.env.local') ? readFileSync('.env.local', 'utf8') : null
}

function makeR2Client() {
  const accountId = readEnv('R2_ACCOUNT_ID')
  const accessKeyId = readEnv('R2_ACCESS_KEY_ID')
  const secretAccessKey = readEnv('R2_SECRET_ACCESS_KEY')
  const bucket = readEnv('R2_BUCKET')
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    console.error(
      '[backfill] Missing R2 config. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, ' +
        'R2_SECRET_ACCESS_KEY and R2_BUCKET in .env.local.',
    )
    process.exit(1)
  }
  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
  })
  return { client, bucket }
}

function parsePhotoKey(key: string | undefined): { cacheId: string; photoIndex: number } | null {
  if (!key || !key.startsWith(PHOTO_KEY_PREFIX)) return null
  const rest = key.slice(PHOTO_KEY_PREFIX.length)
  const slash = rest.indexOf('/')
  if (slash <= 0) return null
  const cacheId = rest.slice(0, slash)
  const photoIndex = Number.parseInt(rest.slice(slash + 1), 10)
  if (!cacheId || !Number.isFinite(photoIndex) || photoIndex < 0) return null
  return { cacheId, photoIndex }
}

function resolveDest(allowLocal: boolean): ScriptDbTarget {
  const picked = pickProdDbTarget({
    env: process.env,
    envFileText: envFileText(),
  })
  if ('target' in picked) {
    console.log(
      `[backfill] TARGET=prod · ${formatScriptDbTarget(picked.target)} · ${picked.source}`,
    )
    return picked.target
  }
  if (allowLocal) {
    const local = pickListingsDbTarget(process.env)
    if (local) {
      console.warn(
        `[backfill] TARGET=localhost · ${formatScriptDbTarget(local)} (--allow-local)`,
      )
      return local
    }
  }
  console.error(`[backfill] ${picked.error}`)
  process.exit(1)
}

function makePgClient(target: ScriptDbTarget): pg.Client {
  return new pg.Client({
    connectionString: target.value,
    ssl: shouldUseSslForDbUrl(target.value)
      ? { rejectUnauthorized: false }
      : false,
  })
}

async function upsertChunk(
  client: pg.Client,
  rows: { cacheId: string; photoIndex: number; byteLength: number; contentType?: string }[],
): Promise<void> {
  if (rows.length === 0) return
  const values: string[] = []
  const params: unknown[] = []
  rows.forEach((row, i) => {
    const base = i * 4
    values.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, now())`)
    params.push(
      row.cacheId,
      row.photoIndex,
      row.contentType || 'image/jpeg',
      row.byteLength,
    )
  })
  await client.query(
    `INSERT INTO listing_photo_index (cache_id, photo_index, content_type, byte_length, synced_at)
     VALUES ${values.join(', ')}
     ON CONFLICT (cache_id, photo_index) DO UPDATE SET
       content_type = EXCLUDED.content_type,
       byte_length = EXCLUDED.byte_length,
       synced_at = EXCLUDED.synced_at`,
    params,
  )
}

async function copyFromLocal(
  dest: pg.Client,
  destTarget: ScriptDbTarget,
  dryRun: boolean,
  limit: number,
): Promise<{ listed: number; written: number }> {
  const sourceTarget = pickListingsDbTarget(process.env)
  if (!sourceTarget) {
    console.error(
      '[backfill] --from-local needs DATABASE_URL (the local Postgres that already has listing_photo_index).',
    )
    process.exit(1)
  }
  if (sourceTarget.kind === 'prod' || sourceTarget.host === destTarget.host) {
    console.error(
      `[backfill] --from-local source is ${formatScriptDbTarget(sourceTarget)} — same as dest. Use the default R2 path instead.`,
    )
    process.exit(1)
  }
  console.log(
    `[backfill] SOURCE=${sourceTarget.kind} · ${formatScriptDbTarget(sourceTarget)}`,
  )

  const source = makePgClient(sourceTarget)
  await source.connect()
  try {
    const { rows: countRows } = await source.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n
         FROM listing_photo_index
        WHERE byte_length >= 100`,
    )
    const total = countRows[0]?.n ?? 0
    const params: number[] = []
    let sql = `SELECT cache_id, photo_index, content_type, byte_length
         FROM listing_photo_index
        WHERE byte_length >= 100
        ORDER BY cache_id, photo_index`
    if (limit > 0) {
      params.push(limit)
      sql += ` LIMIT $1`
    }
    const { rows } = await source.query<{
      cache_id: string
      photo_index: number
      content_type: string | null
      byte_length: number
    }>(sql, params)
    console.log(
      `[backfill] local listing_photo_index rows=${total}` +
        (limit > 0 ? ` · copying ${rows.length} (--limit=${limit})` : ' · copying all'),
    )
    for (const row of rows.slice(0, 5)) {
      console.log(
        `[backfill]   sample ${row.cache_id} slot=${row.photo_index} bytes=${row.byte_length}`,
      )
    }
    if (dryRun) {
      console.log('[backfill] dry-run — no Neon writes')
      return { listed: rows.length, written: 0 }
    }
    let written = 0
    let buffer: { cacheId: string; photoIndex: number; byteLength: number; contentType?: string }[] =
      []
    for (const row of rows) {
      buffer.push({
        cacheId: row.cache_id,
        photoIndex: row.photo_index,
        byteLength: row.byte_length,
        contentType: row.content_type || 'image/jpeg',
      })
      if (buffer.length >= CHUNK_ROWS) {
        await upsertChunk(dest, buffer)
        written += buffer.length
        buffer = []
        process.stdout.write(`\r[backfill] copied ${written} / ${rows.length}   `)
      }
    }
    if (buffer.length > 0) {
      await upsertChunk(dest, buffer)
      written += buffer.length
    }
    process.stdout.write('\n')
    return { listed: rows.length, written }
  } finally {
    await source.end()
  }
}

async function copyFromR2(
  dest: pg.Client,
  dryRun: boolean,
  limit: number,
): Promise<{ listed: number; written: number; skipped: number }> {
  const { client: r2, bucket } = makeR2Client()
  console.log(`[backfill] photos=prod · R2 bucket=${bucket}`)

  let listed = 0
  let written = 0
  let skipped = 0
  let buffer: { cacheId: string; photoIndex: number; byteLength: number }[] = []
  let continuationToken: string | undefined

  do {
    const res = await r2.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: PHOTO_KEY_PREFIX,
        ContinuationToken: continuationToken,
      }),
    )
    for (const obj of res.Contents ?? []) {
      if (limit > 0 && written + buffer.length >= limit) break
      listed += 1
      const parsed = parsePhotoKey(obj.Key)
      const size = typeof obj.Size === 'number' ? obj.Size : 0
      if (!parsed || size < 100) {
        skipped += 1
        continue
      }
      if (dryRun) {
        if (limit > 0 && listed - skipped >= limit) break
        continue
      }
      buffer.push({
        cacheId: parsed.cacheId,
        photoIndex: parsed.photoIndex,
        byteLength: size,
      })
      if (buffer.length >= CHUNK_ROWS) {
        await upsertChunk(dest, buffer)
        written += buffer.length
        buffer = []
        process.stdout.write(`\r[backfill] listed ${listed} · indexed ${written}   `)
      }
    }
    if (limit > 0 && (written + buffer.length >= limit || (dryRun && listed - skipped >= limit))) {
      break
    }
    continuationToken = res.IsTruncated ? res.NextContinuationToken : undefined
  } while (continuationToken)

  if (!dryRun && buffer.length > 0) {
    await upsertChunk(dest, buffer)
    written += buffer.length
  }
  process.stdout.write('\n')
  if (dryRun) {
    console.log('[backfill] dry-run — no Neon writes')
  }
  return { listed, written, skipped }
}

async function main() {
  const fromLocal = argFlag('--from-local')
  const dryRun = argFlag('--dry-run')
  const allowLocal = argFlag('--allow-local')
  const limit = parseLimit()
  if (limit > 0) {
    console.log(`[backfill] limit=${limit}`)
  }

  const destTarget = resolveDest(allowLocal)
  const dest = makePgClient(destTarget)
  await dest.connect()

  try {
    const result = fromLocal
      ? await copyFromLocal(dest, destTarget, dryRun, limit)
      : await copyFromR2(dest, dryRun, limit)

    const skipped = 'skipped' in result ? result.skipped : 0
    console.log(
      `[backfill] Done. listed=${result.listed} · indexed=${result.written}` +
        (skipped ? ` · skipped=${skipped}` : '') +
        (fromLocal ? ' · source=local listing_photo_index' : ' · source=R2'),
    )

    const { rows } = await dest.query<{ rows: number; listings: number }>(
      `SELECT COUNT(*)::int AS rows, COUNT(DISTINCT cache_id)::int AS listings
         FROM listing_photo_index`,
    )
    const summary = rows[0] ?? { rows: 0, listings: 0 }
    console.log(
      `[backfill] dest listing_photo_index now holds ${summary.rows} rows across ${summary.listings} listings.`,
    )
  } finally {
    await dest.end()
  }
}

main().catch((err) => {
  console.error('\n[backfill] FAILED:', err?.message ?? err)
  process.exit(1)
})
