import { NextResponse } from 'next/server'
import {
  sendListingIfEmail,
  type ListingIfEmailKind,
} from '@/lib/listing-if-email'
import {
  IF_DEFAULT_MIDPOINT_METHOD,
  IF_MIDPOINT_METHODS,
  type IfMidpointMethod,
} from '@/lib/listing-if-estimates'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function parseKinds(raw: unknown): ListingIfEmailKind[] {
  if (!Array.isArray(raw)) return ['sale', 'rent']
  return raw.filter((k): k is ListingIfEmailKind => k === 'sale' || k === 'rent')
}

function parseMethod(raw: unknown): IfMidpointMethod {
  if (
    typeof raw === 'string' &&
    (IF_MIDPOINT_METHODS as readonly string[]).includes(raw)
  ) {
    return raw as IfMidpointMethod
  }
  return IF_DEFAULT_MIDPOINT_METHOD
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ mlsId: string }> },
) {
  const { mlsId } = await ctx.params
  const id = (mlsId ?? '').trim()
  if (!id) {
    return NextResponse.json({ error: 'mlsId required' }, { status: 400 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const record = body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  const to = typeof record.to === 'string' ? record.to : ''
  const kinds = parseKinds(record.kinds)
  const midpointMethod = parseMethod(record.midpointMethod)

  const result = await sendListingIfEmail({
    mlsId: id,
    to,
    kinds,
    midpointMethod,
  })

  if (!result.ok) {
    const status =
      result.error.includes('not found')
        ? 404
        : result.error.includes('not configured')
          ? 503
          : result.error.includes('required') ||
              result.error.includes('Select') ||
              result.error.includes('Valid')
            ? 400
            : 502
    return NextResponse.json({ error: result.error }, { status })
  }

  return NextResponse.json({ ok: true, bcc: result.bcc })
}
