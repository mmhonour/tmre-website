import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthorizedRequest } from '@/lib/admin-auth'
import {
  DB_UPSERT_CHUNK_ROWS_DEFAULT,
  DB_UPSERT_CHUNK_ROWS_MAX,
  DB_UPSERT_CHUNK_ROWS_MIN,
  getUpsertChunkRows,
  setUpsertChunkRows,
} from '@/lib/db/db-write-tuning'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function payload() {
  return {
    chunkRows: getUpsertChunkRows(),
    default: DB_UPSERT_CHUNK_ROWS_DEFAULT,
    min: DB_UPSERT_CHUNK_ROWS_MIN,
    max: DB_UPSERT_CHUNK_ROWS_MAX,
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

  const raw = (body as { chunkRows?: unknown })?.chunkRows
  const value = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(value)) {
    return NextResponse.json({ error: 'chunkRows must be a number' }, { status: 400 })
  }

  const applied = await setUpsertChunkRows(value)
  return NextResponse.json({ ok: true, ...payload(), chunkRows: applied })
}
