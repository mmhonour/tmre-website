import 'server-only'

/**
 * Shared auth for Netlify scheduled → background worker handoff.
 * Set SYNC_CRON_SECRET in Netlify env (any long random string).
 */
export function syncCronSecret(): string | null {
  return process.env.SYNC_CRON_SECRET?.trim() || null
}

export function assertSyncCronAuth(req: Request): boolean {
  const expected = syncCronSecret()
  if (!expected) {
    // No secret configured — allow (legacy). Prefer setting SYNC_CRON_SECRET.
    return true
  }
  const auth = req.headers.get('authorization')?.trim() ?? ''
  if (auth === `Bearer ${expected}`) return true
  try {
    const url = new URL(req.url)
    if (url.searchParams.get('secret') === expected) return true
  } catch {
    /* ignore */
  }
  return false
}

/** Base site URL for same-site function → function invoke. */
export function netlifySiteBaseUrl(): string | null {
  const base =
    process.env.URL?.trim() ||
    process.env.DEPLOY_PRIME_URL?.trim() ||
    process.env.DEPLOY_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim()
  return base ? base.replace(/\/$/, '') : null
}
