import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthorizedRequest } from '@/lib/admin-auth'
import { ADMIN_TAB_KIT } from '@/lib/admin-tab-kit'
import {
  isAdminTabKitId,
  mergeTabKitAssignments,
  readTabKitAssignmentsFresh,
  writeTabKitAssignments,
} from '@/lib/tab-kit-assignments'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!isAdminAuthorizedRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const assignments = await readTabKitAssignmentsFresh()
  return NextResponse.json({
    assignments,
    catalog: ADMIN_TAB_KIT,
  })
}

/**
 * PATCH body:
 *   { roleId, kitId } — assign one surface to a catalog style
 *   { reset: true } — restore identity defaults
 */
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

  const raw = body as {
    roleId?: unknown
    kitId?: unknown
    reset?: unknown
  }

  if (raw.reset === true) {
    const assignments = await writeTabKitAssignments(
      mergeTabKitAssignments(null),
    )
    return NextResponse.json({ ok: true, assignments })
  }

  if (typeof raw.roleId !== 'string' || typeof raw.kitId !== 'string') {
    return NextResponse.json(
      { error: 'Provide { roleId, kitId } or { reset: true }' },
      { status: 400 },
    )
  }

  if (!ADMIN_TAB_KIT.some((row) => row.id === raw.roleId)) {
    return NextResponse.json({ error: 'Unknown roleId' }, { status: 400 })
  }
  if (!isAdminTabKitId(raw.kitId)) {
    return NextResponse.json({ error: 'Unknown kitId' }, { status: 400 })
  }

  const current = await readTabKitAssignmentsFresh()
  const assignments = await writeTabKitAssignments({
    ...current,
    [raw.roleId]: raw.kitId,
  })
  return NextResponse.json({ ok: true, assignments })
}
