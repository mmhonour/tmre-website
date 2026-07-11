import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthorizedRequest } from '@/lib/admin-auth'
import { resetListingsDbConnections } from '@/lib/listings-db'
import { ensureAdminSqliteDatabasesReady } from '@/lib/listings-db-persist'
import {
  forceClearSqliteRefreshLock,
  readRefreshLockHistorySummary,
  readSqliteRefreshLockStatus,
  readSqliteRefreshStatus,
} from '@/lib/sqlite-refresh-status'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!isAdminAuthorizedRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  await ensureAdminSqliteDatabasesReady(resetListingsDbConnections)

  const lock = readSqliteRefreshLockStatus()
  const refresh = readSqliteRefreshStatus()
  const history = readRefreshLockHistorySummary()

  return NextResponse.json({
    lock,
    refreshing: refresh.refreshing,
    history,
  })
}

export async function POST(req: NextRequest) {
  if (!isAdminAuthorizedRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  await ensureAdminSqliteDatabasesReady(resetListingsDbConnections)

  const before = readSqliteRefreshLockStatus()
  if (!before.inProgress && before.depth <= 0) {
    return NextResponse.json({
      ok: true,
      cleared: false,
      message: 'No refresh lock is held',
      lock: before,
      refreshing: false,
    })
  }

  forceClearSqliteRefreshLock()
  const lock = readSqliteRefreshLockStatus()
  const history = readRefreshLockHistorySummary()

  return NextResponse.json({
    ok: true,
    cleared: true,
    message: 'Refresh lock cleared',
    before,
    lock,
    history,
    refreshing: false,
  })
}
