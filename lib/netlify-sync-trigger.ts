import 'server-only'

import { syncCronSecret } from '@/lib/netlify-cron-auth'

/** POST a Netlify background sync function (returns 202 when queued). */
async function postNetlifyFunction(path: string): Promise<boolean> {
  const base =
    process.env.URL?.trim() ||
    process.env.DEPLOY_PRIME_URL?.trim() ||
    process.env.DEPLOY_URL?.trim()
  if (!base) return false

  const headers: Record<string, string> = { 'content-type': 'application/json' }
  const secret = syncCronSecret()
  if (secret) headers.authorization = `Bearer ${secret}`

  try {
    const res = await fetch(`${base.replace(/\/$/, '')}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ source: 'netlify-sync-trigger' }),
    })
    return res.status === 202 || res.ok
  } catch (err) {
    console.warn(`[netlify-sync-trigger] ${path} failed`, err)
    return false
  }
}

export function queueNetlifyIncrementalSync(): Promise<boolean> {
  // Background worker — the scheduled `sync-listings` function only queues this.
  return postNetlifyFunction('/.netlify/functions/sync-listings-worker')
}

export function queueNetlifyFullSync(): Promise<boolean> {
  return postNetlifyFunction('/.netlify/functions/sync-listings-full')
}
