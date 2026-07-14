// Backfill the Postgres listing_photo_index table from the photos already
// stored in Cloudflare R2 — WITHOUT re-pulling anything from RETS.
//
// Why this exists: `npm run sync:listings` writes photo BYTES to R2 (a global
// bucket shared by localhost + prod) but writes the INDEX rows to whatever
// Postgres DATABASE_URL points at. When the sync runs against local Postgres,
// Neon's listing_photo_index stays empty, so prod would show empty galleries
// even though every byte is already in R2. This script lists the R2 objects
// and writes the matching index rows straight into the target Postgres.
//
// R2 credentials are read from .env.local (R2_ACCOUNT_ID / R2_ACCESS_KEY_ID /
// R2_SECRET_ACCESS_KEY / R2_BUCKET). The Postgres connection string is resolved
// the same way as scripts/run-migrations.mjs (UNPOOLED preferred). To target
// Neon from a machine whose .env.local points at local Postgres, override the
// connection for this one command:
//
//   $env:DATABASE_URL_UNPOOLED = "postgresql://...neon.tech/neondb?sslmode=require"
//   npm run backfill:photo-index
//   Remove-Item Env:\DATABASE_URL_UNPOOLED
//
// Idempotent: rows upsert on (cache_id, photo_index), so re-running is safe.

import pg from 'pg'
import { ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3'

const PHOTO_KEY_PREFIX = 'photos/'
const CHUNK_ROWS = 500

function resolveConnectionString() {
  const candidates = [
    'DATABASE_URL_UNPOOLED',
    'NETLIFY_DATABASE_URL_UNPOOLED',
    'DATABASE_URL',
    'NETLIFY_DATABASE_URL',
  ]
  for (const key of candidates) {
    const value = process.env[key]?.trim()
    if (value) return { key, value }
  }
  return null
}

function shouldUseSsl(connectionString) {
  try {
    const url = new URL(connectionString)
    if ((url.searchParams.get('sslmode') ?? '').toLowerCase() === 'disable') return false
    const host = url.hostname.toLowerCase()
    return !(host === 'localhost' || host === '127.0.0.1' || host === '::1')
  } catch {
    return true
  }
}

function readEnv(name) {
  const value = process.env[name]?.trim()
  return value ? value : null
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

// key: photos/{cacheId}/{photoIndex} → { cacheId, photoIndex } | null
function parsePhotoKey(key) {
  if (!key || !key.startsWith(PHOTO_KEY_PREFIX)) return null
  const rest = key.slice(PHOTO_KEY_PREFIX.length)
  const slash = rest.indexOf('/')
  if (slash <= 0) return null
  const cacheId = rest.slice(0, slash)
  const idxRaw = rest.slice(slash + 1)
  const photoIndex = Number.parseInt(idxRaw, 10)
  if (!cacheId || !Number.isFinite(photoIndex) || photoIndex < 0) return null
  return { cacheId, photoIndex }
}

async function upsertChunk(client, rows) {
  if (rows.length === 0) return
  const values = []
  const params = []
  rows.forEach((row, i) => {
    const base = i * 4
    values.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, now())`)
    params.push(row.cacheId, row.photoIndex, 'image/jpeg', row.byteLength)
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

async function main() {
  const conn = resolveConnectionString()
  if (!conn) {
    console.error(
      '[backfill] No Postgres connection string. Set DATABASE_URL_UNPOOLED (preferred) ' +
        'or DATABASE_URL — use the Neon string to backfill prod.',
    )
    process.exit(1)
  }
  console.log(`[backfill] Postgres via ${conn.key}`)

  const { client: r2, bucket } = makeR2Client()
  console.log(`[backfill] R2 bucket: ${bucket}`)

  const db = new pg.Client({
    connectionString: conn.value,
    ssl: shouldUseSsl(conn.value) ? { rejectUnauthorized: false } : false,
  })
  await db.connect()

  let listed = 0
  let written = 0
  let skipped = 0
  let buffer = []
  let continuationToken

  try {
    do {
      const res = await r2.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: PHOTO_KEY_PREFIX,
          ContinuationToken: continuationToken,
        }),
      )
      for (const obj of res.Contents ?? []) {
        listed += 1
        const parsed = parsePhotoKey(obj.Key)
        const size = typeof obj.Size === 'number' ? obj.Size : 0
        if (!parsed || size < 100) {
          skipped += 1
          continue
        }
        buffer.push({ cacheId: parsed.cacheId, photoIndex: parsed.photoIndex, byteLength: size })
        if (buffer.length >= CHUNK_ROWS) {
          await upsertChunk(db, buffer)
          written += buffer.length
          buffer = []
          process.stdout.write(`\r[backfill] listed ${listed} · indexed ${written}   `)
        }
      }
      continuationToken = res.IsTruncated ? res.NextContinuationToken : undefined
    } while (continuationToken)

    if (buffer.length > 0) {
      await upsertChunk(db, buffer)
      written += buffer.length
    }

    process.stdout.write('\n')
    const { rows } = await db.query(
      `SELECT COUNT(*)::int AS rows, COUNT(DISTINCT cache_id)::int AS listings
       FROM listing_photo_index`,
    )
    const summary = rows[0] ?? { rows: 0, listings: 0 }
    console.log(
      `[backfill] Done. R2 objects listed: ${listed} · index rows written: ${written} · skipped: ${skipped}`,
    )
    console.log(
      `[backfill] listing_photo_index now holds ${summary.rows} rows across ${summary.listings} listings.`,
    )
  } finally {
    await db.end()
  }
}

main().catch((err) => {
  console.error('\n[backfill] FAILED:', err?.message ?? err)
  process.exit(1)
})
