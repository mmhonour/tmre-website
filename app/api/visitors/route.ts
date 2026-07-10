import { NextResponse } from 'next/server'
import { readVisitorRecords } from '@/lib/visitors'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const visitors = await readVisitorRecords()
    const identifiedCount = visitors.filter((v) => Boolean(v.email)).length
    return NextResponse.json({
      count: visitors.length,
      identifiedCount,
      visitors,
    })
  } catch (err) {
    console.error('[/api/visitors] read failed', err)
    return NextResponse.json({ error: 'Failed to read visitors' }, { status: 500 })
  }
}
