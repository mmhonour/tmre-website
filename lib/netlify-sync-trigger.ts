import 'server-only'

/** POST a Netlify background sync function (returns 202 when queued). */
async function postNetlifyFunction(path: string): Promise<boolean> {
  const base =
    process.env.URL?.trim() ||
    process.env.DEPLOY_PRIME_URL?.trim() ||
    process.env.DEPLOY_URL?.trim()
  if (!base) return false

  try {
    const res = await fetch(`${base.replace(/\/$/, '')}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
    })
    return res.status === 202 || res.ok
  } catch (err) {
    console.warn(`[netlify-sync-trigger] ${path} failed`, err)
    return false
  }
}

export function queueNetlifyIncrementalSync(): Promise<boolean> {
  return postNetlifyFunction('/.netlify/functions/sync-listings')
}

export function queueNetlifyFullSync(): Promise<boolean> {
  return postNetlifyFunction('/.netlify/functions/sync-listings-full')
}
