import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthorizedRequest } from '@/lib/admin-auth'
import { readFomcSyncMeta } from '@/lib/db/fomc-meetings-repo'
import { getFomcMeetingsFresh, runFedFomcSync } from '@/lib/fed-fomc-sync'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  if (!isAdminAuthorizedRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const [meta, meetings] = await Promise.all([
    readFomcSyncMeta(),
    getFomcMeetingsFresh(),
  ])
  return NextResponse.json({
    ...meta,
    meetingCount: meetings.length,
    withSummary: meetings.filter((m) => Boolean(m.summary)).length,
    meetings: meetings.map((m) => ({
      id: m.id,
      endDate: m.endDate,
      decision: m.decision,
      statementUrl: m.statementUrl,
      hasSummary: Boolean(m.summary),
      summaryChars: m.summary?.length ?? 0,
      syncedAt: m.syncedAt ?? null,
    })),
  })
}

export async function POST(req: NextRequest) {
  if (!isAdminAuthorizedRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let meetingId: string | undefined
  try {
    const body = (await req.json()) as { meetingId?: unknown }
    if (typeof body.meetingId === 'string' && body.meetingId.trim()) {
      meetingId = body.meetingId.trim()
    }
  } catch {
    // empty body is fine — sync all eligible meetings
  }

  try {
    const result = await runFedFomcSync({ meetingId })
    const meta = await readFomcSyncMeta()
    return NextResponse.json(
      { ...result, ...meta },
      { status: result.ok ? 200 : 207 },
    )
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : 'Fed sync failed',
      },
      { status: 500 },
    )
  }
}
