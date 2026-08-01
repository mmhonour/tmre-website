import 'server-only'

import { CPI_RELEASES, type CpiRelease } from '@/lib/cpi-calendar'
import { parseFomcYmd } from '@/lib/fed-fomc-calendar'
import {
  ensureCpiReleasesTable,
  listCpiReleasesFromDb,
  upsertCpiRelease,
} from '@/lib/db/cpi-releases-repo'
import { setSyncMetaDurable } from '@/lib/db/sync-meta-store'
import {
  CPI_CURRENT_RELEASE_URL,
  guessCpiReleaseUrl,
  parseCpiReleaseHtml,
} from '@/lib/cpi-release-parse'

const FETCH_TIMEOUT_MS = 12_000
/** Cap polite scrapes per run (newest first). */
const MAX_RELEASES_PER_RUN = 24

export type CpiSyncReleaseResult = {
  id: string
  ok: boolean
  skipped?: boolean
  reason?: string
  releaseUrl?: string | null
  summaryChars?: number
  highlightCount?: number
}

export type CpiSyncResult = {
  ok: boolean
  syncedAt: string
  fetched: number
  updated: number
  skipped: number
  failed: number
  releases: CpiSyncReleaseResult[]
}

async function fetchReleaseHtml(url: string): Promise<{
  ok: boolean
  status: number
  html: string | null
  reason?: string
}> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'user-agent':
          'tmre-website/0.1 (+https://tmrebuilder.com; cpi-sync; respectful bot)',
        accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
      cache: 'no-store',
    })
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        html: null,
        reason: `HTTP ${res.status}`,
      }
    }
    const html = await res.text()
    return { ok: true, status: res.status, html }
  } catch (err) {
    const name = err instanceof Error ? err.name : ''
    return {
      ok: false,
      status: 0,
      html: null,
      reason:
        name === 'AbortError'
          ? `Timed out after ${FETCH_TIMEOUT_MS}ms`
          : err instanceof Error
            ? err.message
            : String(err),
    }
  } finally {
    clearTimeout(timer)
  }
}

function mergeSeedWithDb(
  seed: readonly CpiRelease[],
  dbRows: CpiRelease[],
): CpiRelease[] {
  const byId = new Map(dbRows.map((r) => [r.id, r]))
  return seed.map((base) => {
    const overlay = byId.get(base.id)
    if (!overlay) return { ...base }
    return {
      ...base,
      ...overlay,
      referenceMonth: overlay.referenceMonth || base.referenceMonth,
      releaseDate: overlay.releaseDate || base.releaseDate,
      releaseTimeEt: overlay.releaseTimeEt || base.releaseTimeEt,
      note: overlay.note ?? base.note,
      momPct: overlay.momPct ?? base.momPct,
      yoyPct: overlay.yoyPct ?? base.yoyPct,
      coreMomPct: overlay.coreMomPct ?? base.coreMomPct,
      coreYoyPct: overlay.coreYoyPct ?? base.coreYoyPct,
      releaseUrl: overlay.releaseUrl || base.releaseUrl,
      summary: overlay.summary || base.summary || null,
      excerpt: overlay.excerpt || base.excerpt || null,
      highlights:
        overlay.highlights && overlay.highlights.length > 0
          ? overlay.highlights
          : base.highlights ?? [],
    }
  })
}

/**
 * Seed CPI calendar merged with Postgres overlays (summaries, synced prints).
 * Falls back to the hand-maintained seed when the DB is unavailable.
 */
export async function getCpiReleasesFresh(): Promise<CpiRelease[]> {
  try {
    const dbRows = await listCpiReleasesFromDb()
    return mergeSeedWithDb(CPI_RELEASES, dbRows)
  } catch {
    return CPI_RELEASES.map((r) => ({ ...r }))
  }
}

function candidateUrls(release: CpiRelease, isNewest: boolean): string[] {
  const urls: string[] = []
  // Only the newest print may still live at nr0.htm — never fall back
  // older months onto the current release (wrong summary).
  if (isNewest) urls.push(CPI_CURRENT_RELEASE_URL)
  const archive = guessCpiReleaseUrl(release.releaseDate)
  urls.push(archive)
  if (release.releaseUrl?.trim()) urls.push(release.releaseUrl.trim())
  return [...new Set(urls)]
}

/**
 * Fetch official BLS CPI news releases, extract summary / highlights / prints,
 * and upsert into Postgres.
 */
export async function runCpiReleaseSync(options?: {
  /** Only sync this release id (e.g. 2025-07). */
  releaseId?: string
}): Promise<CpiSyncResult> {
  await ensureCpiReleasesTable()
  const now = new Date()
  const endOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    23,
    59,
    59,
    999,
  )

  const existing = await listCpiReleasesFromDb()
  const merged = mergeSeedWithDb(CPI_RELEASES, existing)
  const sorted = [...merged].sort(
    (a, b) =>
      parseFomcYmd(b.releaseDate).getTime() -
      parseFomcYmd(a.releaseDate).getTime(),
  )

  let targets = sorted.filter((r) => {
    if (options?.releaseId) return r.id === options.releaseId
    return parseFomcYmd(r.releaseDate).getTime() <= endOfToday.getTime()
  })

  if (!options?.releaseId) {
    targets = targets.slice(0, MAX_RELEASES_PER_RUN)
  }

  const results: CpiSyncReleaseResult[] = []
  let updated = 0
  let skipped = 0
  let failed = 0
  let fetched = 0

  for (let i = 0; i < targets.length; i++) {
    const release = targets[i]!
    const isNewest = i === 0
    const urls = candidateUrls(release, isNewest)

    let html: string | null = null
    let usedUrl: string | null = null
    let lastReason: string | undefined

    for (const url of urls) {
      const fetchResult = await fetchReleaseHtml(url)
      if (fetchResult.ok && fetchResult.html) {
        html = fetchResult.html
        usedUrl = url
        break
      }
      lastReason = fetchResult.reason
      if (fetchResult.status === 404) continue
      // 403/other — try next URL
    }

    if (!html || !usedUrl) {
      const skipReason =
        lastReason?.includes('404') || lastReason === 'HTTP 404'
          ? 'Release not posted yet (404)'
          : lastReason
      if (skipReason?.includes('404')) {
        skipped += 1
        results.push({
          id: release.id,
          ok: true,
          skipped: true,
          reason: skipReason,
          releaseUrl: urls[0] ?? null,
        })
      } else {
        failed += 1
        results.push({
          id: release.id,
          ok: false,
          reason: skipReason ?? 'Fetch failed',
          releaseUrl: urls[0] ?? null,
        })
      }
      continue
    }

    fetched += 1
    const parsed = parseCpiReleaseHtml(html)
    if (!parsed.summary && parsed.yoyPct == null && parsed.momPct == null) {
      failed += 1
      results.push({
        id: release.id,
        ok: false,
        reason: 'Could not parse CPI release body',
        releaseUrl: usedUrl,
      })
      continue
    }

    const next: CpiRelease = {
      ...release,
      releaseUrl: usedUrl,
      momPct: parsed.momPct ?? release.momPct,
      yoyPct: parsed.yoyPct ?? release.yoyPct,
      coreMomPct: parsed.coreMomPct ?? release.coreMomPct,
      coreYoyPct: parsed.coreYoyPct ?? release.coreYoyPct,
      summary: parsed.summary,
      excerpt: parsed.excerpt,
      highlights: parsed.highlights,
    }

    await upsertCpiRelease(next)
    updated += 1
    results.push({
      id: release.id,
      ok: true,
      releaseUrl: usedUrl,
      summaryChars: parsed.summary?.length ?? 0,
      highlightCount: parsed.highlights.length,
    })
  }

  const syncedAt = new Date().toISOString()
  const summaryLine = `fetched=${fetched} updated=${updated} skipped=${skipped} failed=${failed}`
  try {
    await setSyncMetaDurable('cpi_last_synced_at', syncedAt)
    await setSyncMetaDurable('cpi_last_sync_result', summaryLine)
  } catch {
    // sync_meta write is best-effort
  }

  return {
    ok: failed === 0,
    syncedAt,
    fetched,
    updated,
    skipped,
    failed,
    releases: results,
  }
}
