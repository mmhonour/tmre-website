import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthorizedRequest } from '@/lib/admin-auth'
import { hydrateSyncMetaStore } from '@/lib/db/sync-meta-store'
import {
  formatIncrementalStepLog,
  readIncrementalStepLog,
} from '@/lib/incremental-sync-step-log'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Latest production incremental step transcript (text or JSON). */
export async function GET(req: NextRequest) {
  if (!isAdminAuthorizedRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  await hydrateSyncMetaStore()
  const log = readIncrementalStepLog()
  const wantJson = req.nextUrl.searchParams.get('format') === 'json'
  if (wantJson) {
    return NextResponse.json({ ok: true, log })
  }

  const text = formatIncrementalStepLog(log)
  return new NextResponse(text, {
    status: 200,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}
