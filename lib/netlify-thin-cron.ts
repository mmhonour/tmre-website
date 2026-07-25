import 'server-only'

import type { NetlifyFunctionQueueResult } from '@/lib/netlify-sync-trigger'

/** Shared JSON response for thin scheduled → background worker handoff. */
export function thinCronResponse(
  queued: NetlifyFunctionQueueResult,
  extra: Record<string, unknown> = {},
): Response {
  return new Response(
    JSON.stringify({
      ok: queued.ok,
      mode: 'scheduled-queue',
      workerQueued: queued,
      ...extra,
    }),
    {
      status: queued.ok ? 200 : 502,
      headers: { 'content-type': 'application/json' },
    },
  )
}

export function thinCronSkipped(reason: string): Response {
  return new Response(
    JSON.stringify({
      ok: true,
      mode: 'scheduled-queue',
      skipped: true,
      reason,
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  )
}

export function thinCronError(label: string, err: unknown): Response {
  console.error(`[${label}]`, err)
  return new Response(
    JSON.stringify({
      ok: false,
      mode: 'scheduled-queue',
      error: err instanceof Error ? err.message : String(err),
    }),
    { status: 500, headers: { 'content-type': 'application/json' } },
  )
}
