import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthorizedRequest } from '@/lib/admin-auth'
import { isValidEmail } from '@/lib/contact-notify-config'
import {
  getMarketDigestConfigFresh,
  setMarketDigestEmail,
  setMarketDigestEnabled,
  setMarketDigestIncludeSocialProfiles,
  setMarketDigestSubjectTemplate,
} from '@/lib/market-digest-config'
import { updateMarketDigestSchedule } from '@/lib/market-digest-schedule'
import { sendMarketDigestEmail } from '@/lib/market-digest-notify'
import { isServerlessRuntime } from '@/lib/runtime-host'
import {
  isSyncScheduleWeekdayEt,
  normalizeStartTimeEt,
} from '@/lib/sync-schedule-config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function payload() {
  return getMarketDigestConfigFresh()
}

export async function GET(req: NextRequest) {
  if (!isAdminAuthorizedRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return NextResponse.json(await payload())
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

  const o = body as {
    email?: unknown
    enabled?: unknown
    subjectTemplate?: unknown
    includeSocialProfiles?: unknown
    weekdayEt?: unknown
    startTimeEt?: unknown
  }
  try {
    if (typeof o.email === 'string') {
      if (!isValidEmail(o.email)) {
        return NextResponse.json(
          { error: 'A valid email address is required' },
          { status: 400 },
        )
      }
      await setMarketDigestEmail(o.email)
    }
    if (typeof o.enabled === 'boolean') {
      await setMarketDigestEnabled(o.enabled)
    }
    if (typeof o.includeSocialProfiles === 'boolean') {
      await setMarketDigestIncludeSocialProfiles(o.includeSocialProfiles)
    }

    const schedulePatch: {
      weekdayEt?: 0 | 1 | 2 | 3 | 4 | 5 | 6
      startTimeEt?: string
    } = {}
    if (o.weekdayEt !== undefined && o.weekdayEt !== null) {
      const wd = Number(o.weekdayEt)
      if (!isSyncScheduleWeekdayEt(wd)) {
        return NextResponse.json(
          { error: 'weekdayEt must be 0–6 (Sun–Sat)' },
          { status: 400 },
        )
      }
      schedulePatch.weekdayEt = wd
    }
    if (typeof o.startTimeEt === 'string') {
      if (!normalizeStartTimeEt(o.startTimeEt)) {
        return NextResponse.json(
          { error: 'startTimeEt must be HH:MM' },
          { status: 400 },
        )
      }
      schedulePatch.startTimeEt = o.startTimeEt
    }
    if (
      schedulePatch.weekdayEt != null ||
      schedulePatch.startTimeEt != null
    ) {
      await updateMarketDigestSchedule(schedulePatch)
    }

    // Subject after weekday so a same-request custom subject wins over auto day rename.
    if (typeof o.subjectTemplate === 'string') {
      await setMarketDigestSubjectTemplate(o.subjectTemplate)
    }

    return NextResponse.json({ ok: true, ...(await payload()) })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Save failed' },
      { status: 400 },
    )
  }
}

/** Force-send a test digest (does not update the weekly watermark). */
export async function POST(req: NextRequest) {
  if (!isAdminAuthorizedRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Building the snapshot (two-year closed-sales aggregate) outlives a
    // synchronous Netlify function, so serverless has to hand the work off.
    // That used to mean POSTing the background worker directly, which is why
    // this button still answered "HTTP 429" long after the scheduled path
    // stopped depending on that hop. It goes on `sync_queue` now, like every
    // other brief. stampWeek stays false throughout: a test that consumed the
    // weekly watermark would silently cancel the real Monday send.
    if (isServerlessRuntime()) {
      const config = await payload()
      const { enqueueSyncJob, readSyncQueueSnapshot } = await import(
        '@/lib/sync-queue'
      )
      const { SYNC_QUEUE_PRIORITY_MANUAL } = await import(
        '@/lib/sync-queue-shared'
      )

      if (!(await readSyncQueueSnapshot(1)).runnerStale) {
        const enqueued = await enqueueSyncJob({
          jobId: 'market-digest',
          trigger: 'admin-test',
          priority: SYNC_QUEUE_PRIORITY_MANUAL,
          payload: { force: true, stampWeek: false },
          ignoreCooldown: true,
        })

        // One queued row per job. Silently piggybacking on a scheduled brief
        // would send with stampWeek true and burn the watermark, so refuse.
        if (!enqueued.enqueued) {
          return NextResponse.json(
            {
              ...config,
              error: enqueued.alreadyRunning
                ? 'A brief is already sending. Wait for it to finish, then test again.'
                : 'A scheduled brief is already queued ahead of this test. Wait for it to send, then test again.',
            },
            { status: 409 },
          )
        }

        const { pokeMlsSyncServiceQueue } = await import(
          '@/lib/mls-sync-service-client'
        )
        await pokeMlsSyncServiceQueue('market-digest').catch(() => null)

        return NextResponse.json({
          ...config,
          ok: true,
          queued: true,
          to: config.email,
          message: `Test brief queued on the sync runner — ${config.email} should have it within a couple of minutes. It does not consume the weekly watermark, so Monday still sends. Syncs → Dashboard shows it in the Queue column.`,
        })
      }

      // Runner silent: fall back to the worker that used to own this outright.
      const { queueNetlifyMarketDigest } = await import(
        '@/lib/netlify-sync-trigger'
      )
      const queued = await queueNetlifyMarketDigest({
        source: 'admin',
        force: true,
        stampWeek: false,
      })
      if (!queued.ok) {
        return NextResponse.json(
          {
            ...config,
            error: `The sync runner is not responding and Netlify refused the fallback worker: ${queued.error ?? 'unknown'}`,
          },
          { status: 502 },
        )
      }
      return NextResponse.json({
        ...config,
        ok: true,
        queued: true,
        to: config.email,
        message: `Sync runner is silent — test brief queued on the Netlify worker instead. ${config.email} should have it within a couple of minutes.`,
      })
    }

    const result = await sendMarketDigestEmail({
      force: true,
      stampWeek: false,
      trigger: 'admin-test',
    })
    if (!result.ok) {
      return NextResponse.json(
        { error: result.reason ?? 'Send failed', ...result },
        { status: 503 },
      )
    }
    return NextResponse.json({ ...(await payload()), ...result, ok: true })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Send failed' },
      { status: 502 },
    )
  }
}
