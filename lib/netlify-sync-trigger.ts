import 'server-only'

import { netlifySiteBaseUrl, syncCronSecret } from '@/lib/netlify-cron-auth'

export type NetlifyFunctionQueueResult = {
  ok: boolean
  status: number | null
  base: string | null
  error?: string
}

/** Max bases to try — hanging fetches must not burn the 30s scheduled budget. */
const MAX_QUEUE_BASES = 3
/** Per-attempt HTTP timeout for function→function queue. */
const QUEUE_FETCH_TIMEOUT_MS = 6_000

/** Prefer *.netlify.app so custom-domain / Cloudflare quirks don't block function→function. */
function candidateBases(): string[] {
  const siteName = process.env.SITE_NAME?.trim()
  const fromName = siteName ? `https://${siteName}.netlify.app` : null
  const raw = [
    fromName,
    process.env.DEPLOY_PRIME_URL?.trim(),
    process.env.DEPLOY_URL?.trim(),
    process.env.URL?.trim(),
    process.env.NEXT_PUBLIC_SITE_URL?.trim(),
    netlifySiteBaseUrl(),
  ]
  const seen = new Set<string>()
  const out: string[] = []
  for (const entry of raw) {
    if (!entry) continue
    const base = entry.replace(/\/$/, '')
    if (seen.has(base)) continue
    seen.add(base)
    out.push(base)
    if (out.length >= MAX_QUEUE_BASES) break
  }
  return out
}

/**
 * Netlify dashboard site-wide password (Visitor access control), if any.
 * App `/admin` cookie password is unrelated but reused as a last-resort candidate.
 */
function visitorPasswordCandidates(): string[] {
  const raw = [
    process.env.NETLIFY_SITE_PASSWORD?.trim(),
    process.env.NETLIFY_VISITOR_PASSWORD?.trim(),
    process.env.SITE_PASSWORD?.trim(),
  ]
  return [...new Set(raw.filter((v): v is string => Boolean(v)))]
}

async function unlockVisitorCookie(
  base: string,
  password: string,
): Promise<string | null> {
  try {
    const res = await fetch(base, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ password }).toString(),
      signal: AbortSignal.timeout(QUEUE_FETCH_TIMEOUT_MS),
    })
    const setCookie = res.headers.getSetCookie?.() ?? []
    const legacy = res.headers.get('set-cookie')
    const parts = setCookie.length > 0 ? setCookie : legacy ? [legacy] : []
    if (parts.length === 0) return null
    return parts.map((c) => c.split(';')[0]!.trim()).filter(Boolean).join('; ')
  } catch (err) {
    console.warn('[netlify-sync-trigger] visitor unlock failed', err)
    return null
  }
}

async function postOnce(
  base: string,
  path: string,
  body: Record<string, unknown>,
  cookie?: string | null,
): Promise<{ status: number; text: string; contentType: string }> {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  const secret = syncCronSecret()
  if (secret) headers.authorization = `Bearer ${secret}`
  if (cookie) headers.cookie = cookie

  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    redirect: 'manual',
    signal: AbortSignal.timeout(QUEUE_FETCH_TIMEOUT_MS),
  })
  const text = await res.text().catch(() => '')
  return {
    status: res.status,
    text,
    contentType: res.headers.get('content-type') ?? '',
  }
}

function isHtmlBody(text: string, contentType: string): boolean {
  if (contentType.toLowerCase().includes('text/html')) return true
  const sample = text.trimStart().slice(0, 240).toLowerCase()
  return (
    sample.startsWith('<!doctype') ||
    sample.startsWith('<html') ||
    (sample.includes('<form') && sample.includes('password'))
  )
}

function looksLikePasswordGate(
  status: number,
  text: string,
  contentType: string,
): boolean {
  if (isHtmlBody(text, contentType) && status >= 200 && status < 400) return true
  if (status === 401 || status === 403) {
    const sample = text.slice(0, 800).toLowerCase()
    return (
      sample.includes('password') ||
      sample.includes('<form') ||
      sample.includes('site protection') ||
      sample.includes('netlify')
    )
  }
  return false
}

/**
 * Background workers must return 202. A 200 HTML login page used to count as
 * “queued”, which left Sync history stuck at the prior real RETS run.
 */
function isAcceptedBackgroundQueue(
  status: number,
  text: string,
  contentType: string,
): boolean {
  if (isHtmlBody(text, contentType)) return false
  if (status === 202) return true
  // Sync (non-background) local/dev handlers may finish with JSON 200.
  if (status >= 200 && status < 300) {
    const sample = text.trimStart()
    return sample.startsWith('{') || sample.startsWith('[') || sample.length === 0
  }
  return false
}

/** POST a Netlify background sync function (returns 202 when queued). */
export async function queueNetlifyFunction(
  path: string,
  body: Record<string, unknown> = { source: 'netlify-sync-trigger' },
): Promise<NetlifyFunctionQueueResult> {
  const bases = candidateBases()
  if (bases.length === 0) {
    return {
      ok: false,
      status: null,
      base: null,
      error: 'no site URL (URL / DEPLOY_* / SITE_NAME)',
    }
  }

  const secret = syncCronSecret()
  let last: NetlifyFunctionQueueResult = {
    ok: false,
    status: null,
    base: bases[0] ?? null,
    error: 'queue failed',
  }

  for (const base of bases) {
    try {
      let { status, text, contentType } = await postOnce(base, path, body)
      if (isAcceptedBackgroundQueue(status, text, contentType)) {
        return { ok: true, status, base }
      }

      // Bearer was sent but rejected — do not confuse with visitor password gate.
      if ((status === 401 || status === 403) && secret) {
        last = {
          ok: false,
          status,
          base,
          error: `worker auth failed (HTTP ${status}) — SYNC_CRON_SECRET mismatch or missing on function`,
        }
        continue
      }

      if (looksLikePasswordGate(status, text, contentType)) {
        for (const password of visitorPasswordCandidates()) {
          const cookie = await unlockVisitorCookie(base, password)
          if (!cookie) continue
          ;({ status, text, contentType } = await postOnce(base, path, body, cookie))
          if (isAcceptedBackgroundQueue(status, text, contentType)) {
            return { ok: true, status, base }
          }
        }
        last = {
          ok: false,
          status,
          base,
          error: `password gate (HTTP ${status}) — set NETLIFY_SITE_PASSWORD or disable site-wide protection for functions`,
        }
        continue
      }

      last = {
        ok: false,
        status,
        base,
        error: `HTTP ${status}${text ? `: ${text.slice(0, 160)}` : ''}`,
      }
    } catch (err) {
      last = {
        ok: false,
        status: null,
        base,
        error: err instanceof Error ? err.message : String(err),
      }
      console.warn(`[netlify-sync-trigger] ${path} failed via ${base}`, err)
    }
  }

  return last
}

export type IncrementalQueueSource =
  | 'admin'
  | 'cron'
  | 'netlify-sync-trigger'
  | 'watchdog'

export function queueNetlifyIncrementalSync(
  startedAt?: string,
  options?: {
    sideWorkOnly?: boolean
    /**
     * Passed through to the worker.
     * admin / watchdog skip cron heartbeat + pause/defer gates.
     */
    source?: IncrementalQueueSource
    /**
     * Adhoc Admin town scope. Omit = all TMRE towns (cron / default Sync now).
     * Single-town values are validated in the worker.
     */
    towns?: readonly string[]
    /** Adhoc Admin status filter: all | active | closed. */
    statusScope?: 'all' | 'active' | 'closed'
  },
): Promise<NetlifyFunctionQueueResult> {
  const towns =
    options?.towns && options.towns.length > 0
      ? [...options.towns]
      : undefined
  const statusScope =
    options?.statusScope === 'active' || options?.statusScope === 'closed'
      ? options.statusScope
      : undefined
  return queueNetlifyFunction('/.netlify/functions/sync-listings-worker', {
    source: options?.source ?? 'netlify-sync-trigger',
    startedAt: startedAt ?? new Date().toISOString(),
    ...(options?.sideWorkOnly ? { sideWorkOnly: true } : {}),
    ...(towns ? { towns } : {}),
    ...(statusScope ? { statusScope } : {}),
  })
}

/** Admin Syncs "Stats cache" — rebuild only (no RETS), up to ~15 min. */
export function queueNetlifyStatsCacheRebuild(
  startedAt?: string,
  options?: { source?: IncrementalQueueSource },
): Promise<NetlifyFunctionQueueResult> {
  return queueNetlifyFunction('/.netlify/functions/sync-listings-worker', {
    source: options?.source ?? 'admin',
    startedAt: startedAt ?? new Date().toISOString(),
    statsCacheOnly: true,
  })
}

/** Full reload worker (background). Never point this at the scheduled trigger. */
export function queueNetlifyFullSync(): Promise<NetlifyFunctionQueueResult> {
  return queueNetlifyFunction('/.netlify/functions/sync-listings-full-worker', {
    source: 'netlify-sync-trigger',
  })
}

export function queueNetlifyPropertyAddressSync(): Promise<NetlifyFunctionQueueResult> {
  return queueNetlifyFunction('/.netlify/functions/sync-property-addresses-worker', {
    source: 'netlify-sync-trigger',
  })
}

export function queueNetlifyListingEdgeScoreSync(): Promise<NetlifyFunctionQueueResult> {
  return queueNetlifyFunction('/.netlify/functions/sync-listing-edge-scores-worker', {
    source: 'netlify-sync-trigger',
  })
}

export function queueNetlifyZipBoundariesSync(): Promise<NetlifyFunctionQueueResult> {
  return queueNetlifyFunction('/.netlify/functions/sync-zip-boundaries-worker', {
    source: 'netlify-sync-trigger',
  })
}

export function queueNetlifyMarketDigest(): Promise<NetlifyFunctionQueueResult> {
  return queueNetlifyFunction('/.netlify/functions/market-digest-worker', {
    source: 'netlify-sync-trigger',
  })
}

export function queueNetlifyFomcSync(options?: {
  source?: 'admin' | 'netlify-sync-trigger'
}): Promise<NetlifyFunctionQueueResult> {
  return queueNetlifyFunction('/.netlify/functions/sync-fomc-worker', {
    source: options?.source ?? 'netlify-sync-trigger',
  })
}

export function queueNetlifyCpiSync(options?: {
  source?: 'admin' | 'netlify-sync-trigger'
}): Promise<NetlifyFunctionQueueResult> {
  return queueNetlifyFunction('/.netlify/functions/sync-cpi-worker', {
    source: options?.source ?? 'netlify-sync-trigger',
  })
}

/** Back-compat boolean helper for callers that only need success/fail. */
export async function queueNetlifyIncrementalSyncOk(startedAt?: string): Promise<boolean> {
  const result = await queueNetlifyIncrementalSync(startedAt)
  return result.ok
}
