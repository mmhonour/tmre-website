import { NextResponse } from 'next/server'
import { getFinishQuality } from '@/lib/finish-quality'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ mlsId: string }> },
) {
  const { mlsId } = await ctx.params
  const id = (mlsId ?? '').trim()
  if (!id) {
    return NextResponse.json({ error: 'Missing mlsId' }, { status: 400 })
  }

  const assessment = await getFinishQuality(id)
  return NextResponse.json(assessment, {
    headers: {
      'Cache-Control':
        assessment.source === 'cached'
          ? 'public, max-age=3600, stale-while-revalidate=86400'
          : 'public, max-age=300',
    },
  })
}
