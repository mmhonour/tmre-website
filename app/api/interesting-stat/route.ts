import { NextResponse } from 'next/server'
import {
  readInterestingStat,
  readInterestingStatHistory,
} from '@/lib/interesting-stat'
import { interestingStatHref } from '@/lib/interesting-stat-link'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const historyWanted = new URL(request.url).searchParams.get('history') === '1'
    if (historyWanted) {
      const history = await readInterestingStatHistory()
      const featured = await readInterestingStat()
      const raw = history?.entries?.length
        ? history.entries
        : featured
          ? [featured]
          : []
      const entries = raw.map((e) => ({
        ...e,
        href: interestingStatHref(e.kind, e.town),
      }))
      if (entries.length === 0) {
        return NextResponse.json({ error: 'No interesting stat yet' }, { status: 404 })
      }
      return NextResponse.json({ entries })
    }

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
