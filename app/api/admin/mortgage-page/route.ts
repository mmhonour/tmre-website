import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthorizedRequest } from '@/lib/admin-auth'
import {
  DEFAULT_MORTGAGE_PAGE_CONTENT,
  getMortgagePageContentFresh,
  setMortgagePageContent,
} from '@/lib/mortgage-page-config'
import {
  readMortgageRatesSyncMeta,
  isFredConfigured,
} from '@/lib/mortgage-rates-sync'
import { readMortgageRateCounts } from '@/lib/db/mortgage-rates-repo'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function payload() {
  const [content, syncMeta, counts] = await Promise.all([
    getMortgagePageContentFresh(),
    readMortgageRatesSyncMeta(),
    readMortgageRateCounts().catch(() => []),
  ])
  return {
    content,
    default: DEFAULT_MORTGAGE_PAGE_CONTENT,
    fredConfigured: isFredConfigured(),
    rates: { ...syncMeta, counts },
  }
}

export async function GET(req: NextRequest) {
  if (!isAdminAuthorizedRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return NextResponse.json(await payload())
}

export async function PUT(req: NextRequest) {
  if (!isAdminAuthorizedRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const raw =
    body && typeof body === 'object' && 'content' in body
      ? (body as { content: unknown }).content
      : body

  const content = await setMortgagePageContent(raw)
  return NextResponse.json({ ok: true, ...(await payload()), content })
}
