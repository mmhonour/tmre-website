import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthorizedRequest } from '@/lib/admin-auth'
import { readCpiSyncMeta } from '@/lib/db/cpi-releases-repo'
import { readFomcSyncMeta } from '@/lib/db/fomc-meetings-repo'
import { getCpiReleasesFresh, runCpiReleaseSync } from '@/lib/cpi-release-sync'
import { getFomcMeetingsFresh, runFedFomcSync } from '@/lib/fed-fomc-sync'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  if (!isAdminAuthorizedRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const [fomcMeta, cpiMeta, meetings, releases] = await Promise.all([
    readFomcSyncMeta(),
    readCpiSyncMeta(),
    getFomcMeetingsFresh(),
    getCpiReleasesFresh(),
  ])
  return NextResponse.json({
    lastSyncedAt: fomcMeta.lastSyncedAt ?? cpiMeta.lastSyncedAt,
    lastResult: [fomcMeta.lastResult, cpiMeta.lastResult]
      .filter(Boolean)
      .join(' · '),
    fomc: {
      ...fomcMeta,
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
    },
    cpi: {
      ...cpiMeta,
      releaseCount: releases.length,
      withSummary: releases.filter((r) => Boolean(r.summary)).length,
      withHighlights: releases.filter((r) => (r.highlights?.length ?? 0) > 0)
        .length,
      releases: releases
        .filter((r) => r.yoyPct != null || r.momPct != null || r.summary)
        .slice()
        .sort((a, b) => b.releaseDate.localeCompare(a.releaseDate))
        .slice(0, 18)
        .map((r) => ({
          id: r.id,
          releaseDate: r.releaseDate,
          releaseUrl: r.releaseUrl,
          hasSummary: Boolean(r.summary),
          summaryChars: r.summary?.length ?? 0,
          highlightCount: r.highlights?.length ?? 0,
          momPct: r.momPct,
          yoyPct: r.yoyPct,
          syncedAt: r.syncedAt ?? null,
        })),
    },
    // Back-compat for older admin panel fields
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
  let releaseId: string | undefined
  try {
    const body = (await req.json()) as {
      meetingId?: unknown
      releaseId?: unknown
    }
    if (typeof body.meetingId === 'string' && body.meetingId.trim()) {
      meetingId = body.meetingId.trim()
    }
    if (typeof body.releaseId === 'string' && body.releaseId.trim()) {
      releaseId = body.releaseId.trim()
    }
  } catch {
    // empty body is fine — sync all eligible FOMC + CPI
  }

  try {
    const onlyFomc = Boolean(meetingId) && !releaseId
    const onlyCpi = Boolean(releaseId) && !meetingId

    const fomcResult = onlyCpi
      ? null
      : await runFedFomcSync({ meetingId })
    const cpiResult = onlyFomc
      ? null
      : await runCpiReleaseSync({ releaseId })

    const [fomcMeta, cpiMeta] = await Promise.all([
      readFomcSyncMeta(),
      readCpiSyncMeta(),
    ])

    const ok = (fomcResult?.ok ?? true) && (cpiResult?.ok ?? true)
    return NextResponse.json(
      {
        ok,
        fomc: fomcResult,
        cpi: cpiResult,
        fetched: (fomcResult?.fetched ?? 0) + (cpiResult?.fetched ?? 0),
        updated: (fomcResult?.updated ?? 0) + (cpiResult?.updated ?? 0),
        skipped: (fomcResult?.skipped ?? 0) + (cpiResult?.skipped ?? 0),
        failed: (fomcResult?.failed ?? 0) + (cpiResult?.failed ?? 0),
        lastSyncedAt: fomcMeta.lastSyncedAt ?? cpiMeta.lastSyncedAt,
        lastResult: [fomcMeta.lastResult, cpiMeta.lastResult]
          .filter(Boolean)
          .join(' · '),
        cpiMeta,
      },
      { status: ok ? 200 : 207 },
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
