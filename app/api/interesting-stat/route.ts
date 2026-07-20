import { NextResponse } from 'next/server'
import { readInterestingStat } from '@/lib/interesting-stat'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const stat = await readInterestingStat()
    if (!stat) {
      return NextResponse.json({ error: 'No interesting stat yet' }, { status: 404 })
    }
    return NextResponse.json(stat)
  } catch (err) {
    console.error('[/api/interesting-stat] error', err)
    return NextResponse.json(
      { error: 'Failed to load interesting stat' },
      { status: 502 },
    )
  }
}
