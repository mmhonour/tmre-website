import { NextResponse } from 'next/server'
import { fetchPreferredPhotoUrl } from '@/lib/rets'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ mlsId: string }> },
) {
  const { mlsId } = await ctx.params
  const id = (mlsId ?? '').trim()
  if (!id) return NextResponse.json({ url: null })

  try {
    const url = await fetchPreferredPhotoUrl(id)
    return NextResponse.json({ url })
  } catch {
    return NextResponse.json({ url: null })
  }
}
