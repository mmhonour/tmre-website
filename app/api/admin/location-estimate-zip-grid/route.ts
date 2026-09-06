import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthorizedRequest } from '@/lib/admin-auth'
import {
  getLocationEstimateZipGridFresh,
  patchLocationEstimateZipGrid,
} from '@/lib/location-estimate-zip-grid-config'
import {
  isCellKey,
  isCoastalStripIndex,
  type ZipGridCells,
} from '@/lib/location-estimate-zip-grid-shared'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!isAdminAuthorizedRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const grid = await getLocationEstimateZipGridFresh()
  return NextResponse.json(grid)
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

  const raw = body as { patch?: unknown; erase?: unknown }
  const patch: ZipGridCells = {}
  if (raw.patch && typeof raw.patch === 'object') {
    for (const [key, value] of Object.entries(raw.patch)) {
      if (isCellKey(key) && isCoastalStripIndex(value)) patch[key] = value
    }
  }
  const erase = Array.isArray(raw.erase)
    ? raw.erase.filter((k): k is string => typeof k === 'string' && isCellKey(k))
    : []

  if (Object.keys(patch).length === 0 && erase.length === 0) {
    return NextResponse.json(
      { error: 'Provide { patch } and/or { erase }' },
      { status: 400 },
    )
  }

  const grid = await patchLocationEstimateZipGrid({ patch, erase })
  return NextResponse.json({ ok: true, ...grid })
}
