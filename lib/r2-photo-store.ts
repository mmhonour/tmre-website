import 'server-only'

import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'

/**
 * Cloudflare R2 object store for listing photos.
 *
 * Bytes live in R2 (S3-compatible API); a lightweight index lives in Postgres
 * (see lib/db/listing-photo-index-repo). Object keys are:
 *
 *   photos/{cacheId}/{photoIndex}
 *
 * where cacheId = listingKey || mlsId — the same id the sync writes under.
 *
 * Egress from R2 to the Lambda is free; keeping the existing proxy route means
 * the public URL surface is unchanged. This retires the SQLite-file-on-Blobs
 * pattern entirely (no whole-DB restore, no /tmp, no cold-Lambda warm gap).
 */

const PHOTO_KEY_PREFIX = 'photos'

let cachedClient: S3Client | null = null

function readEnv(name: string): string | null {
  const value = process.env[name]?.trim()
  return value ? value : null
}

export function r2Bucket(): string | null {
  return readEnv('R2_BUCKET')
}

/** True when every credential needed to talk to R2 is present. */
export function isR2PhotoStoreConfigured(): boolean {
  return (
    readEnv('R2_ACCOUNT_ID') != null &&
    readEnv('R2_ACCESS_KEY_ID') != null &&
    readEnv('R2_SECRET_ACCESS_KEY') != null &&
    r2Bucket() != null
  )
}

function getR2Client(): S3Client | null {
  if (cachedClient) return cachedClient
  const accountId = readEnv('R2_ACCOUNT_ID')
  const accessKeyId = readEnv('R2_ACCESS_KEY_ID')
  const secretAccessKey = readEnv('R2_SECRET_ACCESS_KEY')
  if (!accountId || !accessKeyId || !secretAccessKey) return null

  cachedClient = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
    // R2 ignores forcePathStyle but it keeps the SDK from prepending the
    // bucket as a virtual host, which R2 does not support for all regions.
    forcePathStyle: true,
  })
  return cachedClient
}

function photoObjectKey(cacheId: string, photoIndex: number): string {
  return `${PHOTO_KEY_PREFIX}/${cacheId}/${photoIndex}`
}

function cachePrefix(cacheId: string): string {
  return `${PHOTO_KEY_PREFIX}/${cacheId}/`
}

export type R2PhotoObject = {
  data: Buffer
  contentType: string
  syncedAt: string
}

/** Write one photo blob to R2. Returns false when R2 is not configured. */
export async function putR2ListingPhoto(
  cacheId: string,
  photoIndex: number,
  data: Buffer,
  contentType = 'image/jpeg',
): Promise<boolean> {
  const client = getR2Client()
  const bucket = r2Bucket()
  const id = cacheId.trim()
  if (!client || !bucket || !id || photoIndex < 0 || data.length < 100) {
    return false
  }

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: photoObjectKey(id, photoIndex),
      Body: data,
      ContentType: contentType || 'image/jpeg',
      Metadata: { 'synced-at': new Date().toISOString() },
    }),
  )
  return true
}

/** Read one photo blob from R2, or null when missing / not configured. */
export async function getR2ListingPhoto(
  cacheId: string,
  photoIndex: number,
): Promise<R2PhotoObject | null> {
  const client = getR2Client()
  const bucket = r2Bucket()
  const id = cacheId.trim()
  if (!client || !bucket || !id || photoIndex < 0) return null

  try {
    const res = await client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: photoObjectKey(id, photoIndex),
      }),
    )
    const bytes = await res.Body?.transformToByteArray()
    if (!bytes || bytes.length < 100) return null
    const syncedAt =
      res.Metadata?.['synced-at'] ??
      res.LastModified?.toISOString() ??
      new Date().toISOString()
    return {
      data: Buffer.from(bytes),
      contentType: res.ContentType || 'image/jpeg',
      syncedAt,
    }
  } catch (err) {
    // Missing object (NoSuchKey / 404) is an expected miss, not an error.
    if (isNotFound(err)) return null
    throw err
  }
}

/** Stored photo indices for one listing, ascending, parsed from object keys. */
export async function listR2ListingPhotoIndices(
  cacheId: string,
): Promise<number[]> {
  const client = getR2Client()
  const bucket = r2Bucket()
  const id = cacheId.trim()
  if (!client || !bucket || !id) return []

  const prefix = cachePrefix(id)
  const indices: number[] = []
  let continuationToken: string | undefined

  do {
    const res = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }),
    )
    for (const obj of res.Contents ?? []) {
      const key = obj.Key
      if (!key) continue
      const raw = key.slice(prefix.length)
      const index = Number.parseInt(raw, 10)
      if (Number.isFinite(index) && index >= 0) indices.push(index)
    }
    continuationToken = res.IsTruncated ? res.NextContinuationToken : undefined
  } while (continuationToken)

  return indices.sort((a, b) => a - b)
}

/** Delete every stored photo for one listing. */
export async function deleteR2ListingPhotos(cacheId: string): Promise<void> {
  const client = getR2Client()
  const bucket = r2Bucket()
  const id = cacheId.trim()
  if (!client || !bucket || !id) return

  const prefix = cachePrefix(id)
  let continuationToken: string | undefined

  do {
    const res = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }),
    )
    const keys = (res.Contents ?? [])
      .map((obj) => obj.Key)
      .filter((key): key is string => Boolean(key))
    if (keys.length > 0) {
      await client.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: { Objects: keys.map((Key) => ({ Key })) },
        }),
      )
    }
    continuationToken = res.IsTruncated ? res.NextContinuationToken : undefined
  } while (continuationToken)
}

function isNotFound(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const meta = (err as { $metadata?: { httpStatusCode?: number } }).$metadata
  const name = (err as { name?: string }).name
  return meta?.httpStatusCode === 404 || name === 'NoSuchKey' || name === 'NotFound'
}
