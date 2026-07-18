import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthorizedRequest } from '@/lib/admin-auth'
import { readAdminSyncRunHistory } from '@/lib/db/listings-repo'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function parseOkFilter(raw: string | null): boolean | null {
  if (raw == null || raw === '' || raw === 'all') return null
  if (raw === '1' || raw === 'true' || raw === 'ok') return true
  if (raw === '0' || raw === 'false' || raw === 'fail') return false
  return null
}

/** GET /api/admin/sync-runs — durable MLS sync_runs history (newest first). */
export async function GET(req: NextRequest) {
  if (!isAdminAuthorizedRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = req.nextUrl
  const limit = Number(url.searchParams.get('limit') ?? '50')
  const offset = Number(url.searchParams.get('offset') ?? '0')
  const ok = parseOkFilter(url.searchParams.get('ok'))

  try {
    const result = await readAdminSyncRunHistory({
      limit: Number.isFinite(limit) ? limit : 50,
      offset: Number.isFinite(offset) ? offset : 0,
      ok,
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
