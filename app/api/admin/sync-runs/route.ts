import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthorizedRequest } from '@/lib/admin-auth'
import {
  ADMIN_SYNC_HISTORY_DEFAULT_DAYS,
  ADMIN_SYNC_HISTORY_MAX_LIMIT,
} from '@/lib/admin-sync-history-glom'
import { readAdminSyncRunHistory } from '@/lib/db/listings-repo'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function parseOkFilter(raw: string | null): boolean | null {
  if (raw == null || raw === '' || raw === 'all') return null
  if (raw === '1' || raw === 'true' || raw === 'ok') return true
  if (raw === '0' || raw === 'false' || raw === 'fail') return false
  return null
}

function defaultSinceIso(): string {
  return new Date(
    Date.now() - ADMIN_SYNC_HISTORY_DEFAULT_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString()
}

/** GET /api/admin/sync-runs — durable MLS sync_runs history (newest first). */
export async function GET(req: NextRequest) {
  if (!isAdminAuthorizedRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = req.nextUrl
  const limit = Number(
    url.searchParams.get('limit') ?? String(ADMIN_SYNC_HISTORY_MAX_LIMIT),
  )
  const offset = Number(url.searchParams.get('offset') ?? '0')
  const ok = parseOkFilter(url.searchParams.get('ok'))
  // Default: last 7 days. Pass since=all (or empty with sinceAll=1) for no bound.
  const sinceParam = url.searchParams.get('since')
  const sinceAll =
    url.searchParams.get('sinceAll') === '1' ||
    sinceParam === 'all' ||
    sinceParam === '*'
  const since = sinceAll
    ? null
    : sinceParam && sinceParam !== 'default'
      ? sinceParam
      : defaultSinceIso()

  try {
    const result = await readAdminSyncRunHistory({
      limit: Number.isFinite(limit) ? limit : ADMIN_SYNC_HISTORY_MAX_LIMIT,
      offset: Number.isFinite(offset) ? offset : 0,
      ok,
      since,
    })
    return NextResponse.json(result)
  } catch (err) {
    console.error('[/api/admin/sync-runs]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load sync history' },
      { status: 500 },
    )
  }
}
