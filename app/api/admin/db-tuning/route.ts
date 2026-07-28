import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthorizedRequest } from '@/lib/admin-auth'
import {
  DB_UPSERT_CHUNK_ROWS_DEFAULT,
  DB_UPSERT_CHUNK_ROWS_MAX,
  DB_UPSERT_CHUNK_ROWS_MIN,
  getUpsertChunkRows,
  setUpsertChunkRows,
} from '@/lib/db/db-write-tuning'
import {
  ACTIVE_LISTINGS_FETCH_LIMIT,
  ACTIVE_LISTINGS_FETCH_LIMIT_MAX,
  ACTIVE_LISTINGS_FETCH_LIMIT_MIN,
  CLOSED_LISTINGS_FETCH_LIMIT,
  EXPIRED_LISTINGS_FETCH_LIMIT,
  getActiveListingsFetchLimit,
  setActiveListingsFetchLimit,
} from '@/lib/listings-store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function payload() {
  return {
    chunkRows: getUpsertChunkRows(),
    default: DB_UPSERT_CHUNK_ROWS_DEFAULT,
    min: DB_UPSERT_CHUNK_ROWS_MIN,
    max: DB_UPSERT_CHUNK_ROWS_MAX,
    activeFetchLimit: getActiveListingsFetchLimit(),
    activeFetchDefault: ACTIVE_LISTINGS_FETCH_LIMIT,
    activeFetchMin: ACTIVE_LISTINGS_FETCH_LIMIT_MIN,
    activeFetchMax: ACTIVE_LISTINGS_FETCH_LIMIT_MAX,
    /** Read-only code constants (not admin-tunable yet). */
    closedFetchLimit: CLOSED_LISTINGS_FETCH_LIMIT,
    expiredFetchLimit: EXPIRED_LISTINGS_FETCH_LIMIT,
  }
}

export async function GET(req: NextRequest) {
  if (!isAdminAuthorizedRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return NextResponse.json(payload())
}

export async function PATCH(req: NextRequest) {
  if (!isAdminAuthorizedRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const obj = body as {
    chunkRows?: unknown
    activeFetchLimit?: unknown
  }

  if (obj.chunkRows !== undefined) {
    const value =
      typeof obj.chunkRows === 'number' ? obj.chunkRows : Number(obj.chunkRows)
    if (!Number.isFinite(value)) {
      return NextResponse.json(
        { error: 'chunkRows must be a number' },
        { status: 400 },
      )
    }
    await setUpsertChunkRows(value)
  }

  if (obj.activeFetchLimit !== undefined) {
    const value =
      typeof obj.activeFetchLimit === 'number'
        ? obj.activeFetchLimit
        : Number(obj.activeFetchLimit)
    if (!Number.isFinite(value)) {
      return NextResponse.json(
        { error: 'activeFetchLimit must be a number' },
        { status: 400 },
      )
    }
    await setActiveListingsFetchLimit(value)
  }

  if (obj.chunkRows === undefined && obj.activeFetchLimit === undefined) {
    return NextResponse.json(
      { error: 'Provide chunkRows and/or activeFetchLimit' },
      { status: 400 },
    )
  }

  return NextResponse.json({ ok: true, ...payload() })
}
