import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthorizedRequest } from '@/lib/admin-auth'
import { resetListingsDbConnections, setSyncMeta } from '@/lib/listings-db'
import {
  ensureAdminSqliteDatabasesReady,
  readRefreshLockHistoryFromBlob,
} from '@/lib/listings-db-persist'
import {
  buildRefreshLockHistorySummary,
  forceClearSqliteRefreshLock,
  readRefreshLockHistorySummary,
  readSqliteRefreshLockStatus,
  readSqliteRefreshStatus,
  type RefreshLockHistoryEntry,
} from '@/lib/sqlite-refresh-status'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function isValidEntry(v: unknown): v is RefreshLockHistoryEntry {
  return (
    v != null &&
    typeof v === 'object' &&
    typeof (v as RefreshLockHistoryEntry).id === 'string' &&
    typeof (v as RefreshLockHistoryEntry).startedAt === 'string' &&
    Array.isArray((v as RefreshLockHistoryEntry).tables)
  )
}

async function readHistoryWithBlobFallback() {
  const primary = readRefreshLockHistorySummary()
  if (primary.entries.length > 0) return primary

  // sync_meta is empty on this Lambda (blob restore failed or DB is schema-only).
  // Fall back to the dedicated refresh-lock-history blob key.
  const blobRaw = await readRefreshLockHistoryFromBlob()
  if (!blobRaw || blobRaw.length === 0) return primary

  const blobEntries = blobRaw.filter(isValidEntry)
  if (blobEntries.length === 0) return primary

  // Write them back into sync_meta so future reads on this Lambda see them too.
  try {
    setSyncMeta('refresh_lock_history', JSON.stringify(blobEntries))
  } catch {
    // best-effort
  }

  return buildRefreshLockHistorySummary(blobEntries)
}

export async function GET(req: NextRequest) {
  if (!isAdminAuthorizedRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  await ensureAdminSqliteDatabasesReady(resetListingsDbConnections)

  const lock = readSqliteRefreshLockStatus()
  const refresh = readSqliteRefreshStatus()
  const history = await readHistoryWithBlobFallback()

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
