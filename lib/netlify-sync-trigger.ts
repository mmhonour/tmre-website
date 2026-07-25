import 'server-only'

import { netlifySiteBaseUrl, syncCronSecret } from '@/lib/netlify-cron-auth'

export type NetlifyFunctionQueueResult = {
  ok: boolean
  status: number | null
  base: string | null
  error?: string
}

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
): Promise<{ status: number; text: string }> {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  const secret = syncCronSecret()
  if (secret) headers.authorization = `Bearer ${secret}`
  if (cookie) headers.cookie = cookie

  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
  const text = await res.text().catch(() => '')
  return { status: res.status, text }
}

function looksLikePasswordGate(status: number, text: string): boolean {
  if (status === 401 || status === 403) return true
  const sample = text.slice(0, 800).toLowerCase()
  return (
    sample.includes('password') &&
    (sample.includes('<form') || sample.includes('site protection') || sample.includes('netlify'))
  )
}

/** POST a Netlify background sync function (returns 202 when queued). */
async function postNetlifyFunction(
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

  let last: NetlifyFunctionQueueResult = {
    ok: false,
    status: null,
    base: bases[0] ?? null,
    error: 'queue failed',
  }

  for (const base of bases) {
    try {
      let { status, text } = await postOnce(base, path, body)
      if (status === 202 || (status >= 200 && status < 300)) {
        return { ok: true, status, base }
      }

      if (looksLikePasswordGate(status, text)) {
        for (const password of visitorPasswordCandidates()) {
          const cookie = await unlockVisitorCookie(base, password)
          if (!cookie) continue
          ;({ status, text } = await postOnce(base, path, body, cookie))
          if (status === 202 || (status >= 200 && status < 300)) {
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

export function queueNetlifyIncrementalSync(
  startedAt?: string,
  options?: { sideWorkOnly?: boolean },
): Promise<NetlifyFunctionQueueResult> {
  return postNetlifyFunction('/.netlify/functions/sync-listings-worker', {
    source: 'netlify-sync-trigger',
    startedAt: startedAt ?? new Date().toISOString(),
    ...(options?.sideWorkOnly ? { sideWorkOnly: true } : {}),
  })
}

export function queueNetlifyFullSync(): Promise<NetlifyFunctionQueueResult> {
  return postNetlifyFunction('/.netlify/functions/sync-listings-full', {
    source: 'netlify-sync-trigger',
  })
}

/** Back-compat boolean helper for callers that only need success/fail. */
export async function queueNetlifyIncrementalSyncOk(startedAt?: string): Promise<boolean> {
  const result = await queueNetlifyIncrementalSync(startedAt)
  return result.ok
}
