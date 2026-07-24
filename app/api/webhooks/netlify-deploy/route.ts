import { NextRequest, NextResponse } from 'next/server'
import {
  parseNetlifyDeployPayload,
  sendDeployNotify,
} from '@/lib/deploy-notify'
import { hydrateSyncMetaStore } from '@/lib/db/sync-meta-store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Netlify → Site settings → Notifications → Outgoing webhook
 * Event: Deploy succeeded (+ optionally Deploy failed)
 * URL: https://<site>/api/webhooks/netlify-deploy
 * Auth: Authorization: Bearer <DEPLOY_NOTIFY_WEBHOOK_SECRET>
 *   or  ?secret=<DEPLOY_NOTIFY_WEBHOOK_SECRET>
 */
function authorize(req: NextRequest): boolean {
  const expected = process.env.DEPLOY_NOTIFY_WEBHOOK_SECRET?.trim()
  if (!expected) {
    console.warn('[netlify-deploy webhook] DEPLOY_NOTIFY_WEBHOOK_SECRET not set')
    return false
  }
  const header = req.headers.get('authorization')?.trim() ?? ''
  if (header.toLowerCase().startsWith('bearer ')) {
    if (header.slice(7).trim() === expected) return true
  }
  const q = req.nextUrl.searchParams.get('secret')?.trim()
  return q === expected
}

export async function POST(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  try {
    await hydrateSyncMetaStore()
    const event = parseNetlifyDeployPayload(body)
    const result = await sendDeployNotify({ event })
    return NextResponse.json({ ...result, event })
  } catch (err) {
    console.error('[netlify-deploy webhook]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
