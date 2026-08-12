import 'server-only'

import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { isR2PhotoStoreConfigured, r2Bucket } from '@/lib/r2-photo-store'

const VISION_KEY_PREFIX = 'vision'

let cachedClient: S3Client | null = null

function readEnv(name: string): string | null {
  const value = process.env[name]?.trim()
  return value ? value : null
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
    forcePathStyle: true,
  })
  return cachedClient
}

export function visionFieldCardObjectKey(town: string, visionPid: string): string {
  const t = town.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-')
  const pid = visionPid.trim().replace(/[^0-9A-Za-z_-]+/g, '')
  return `${VISION_KEY_PREFIX}/${t}/${pid}.html`
}

export function isR2VisionStoreConfigured(): boolean {
  return isR2PhotoStoreConfigured()
}

/** Store Field Card / parcel HTML. Returns R2 key or null when R2 is unavailable. */
export async function putVisionFieldCardHtml(
  town: string,
  visionPid: string,
  html: string,
): Promise<string | null> {
  const client = getR2Client()
  const bucket = r2Bucket()
  if (!client || !bucket || !html.trim()) return null
  const key = visionFieldCardObjectKey(town, visionPid)
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: Buffer.from(html, 'utf8'),
      ContentType: 'text/html; charset=utf-8',
      Metadata: {
        'scraped-at': new Date().toISOString(),
        town: town.trim().slice(0, 64),
        'vision-pid': visionPid.trim().slice(0, 32),
      },
    }),
  )
  return key
}

export async function getVisionFieldCardHtml(
  town: string,
  visionPid: string,
): Promise<string | null> {
  const client = getR2Client()
  const bucket = r2Bucket()
  if (!client || !bucket) return null
  try {
    const res = await client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: visionFieldCardObjectKey(town, visionPid),
      }),
    )
    return (await res.Body?.transformToString('utf8')) ?? null
  } catch {
    return null
  }
}
