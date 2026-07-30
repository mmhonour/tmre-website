import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { SITE_PASSWORD_COOKIE } from '@/lib/site-password'
import { readVisitorRecords } from '@/lib/visitors'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const jar = await cookies()
  if (jar.get(SITE_PASSWORD_COOKIE)?.value !== '1') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

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
