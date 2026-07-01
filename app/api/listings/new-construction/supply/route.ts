import { NextRequest, NextResponse } from 'next/server'
import { searchListings } from '@/lib/rets'
import { TMRE_TOWNS, isTmreTown } from '@/lib/tmre-towns'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ALL_CITIES = [...TMRE_TOWNS]
const MIN_YEAR = new Date().getFullYear() - 4

function isoDate(y: number, m: number, d: number) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** Closed-sales analytics for new-construction supply (Stats-adjacent metric). */
async function avgMonthlyClosings(city: string | null): Promise<number | null> {
  const now = new Date()
  // Go back 4 months to ensure 3 full completed months
  const start = new Date(now.getFullYear(), now.getMonth() - 4, 1)
  const end   = new Date(now.getFullYear(), now.getMonth(), 0) // last day of prev month

  const params = {
    status: 'closed',
    closedAfter:  isoDate(start.getFullYear(), start.getMonth() + 1, 1),
    closedBefore: isoDate(end.getFullYear(), end.getMonth() + 1, end.getDate()),
    limit: 500,
    ...(city ? { city } : {}),
  }

  const cities = city ? [city] : ALL_CITIES
  const results = await Promise.all(
    city
      ? [searchListings(params)]
      : cities.map((c) => searchListings({ ...params, city: c }).catch(() => [])),
  )
  const listings = results.flat()

  // Keep only new construction (yearBuilt within last 4 years)
  const newConstr = listings.filter((l) => l.yearBuilt != null && l.yearBuilt >= MIN_YEAR)

  // Group by year-month
  const counts = new Map<string, number>()
  for (const l of newConstr) {
    const ts = l.statusChangeTimestamp ?? l.modificationTimestamp
    if (!ts) continue
    const d = new Date(ts)
    if (isNaN(d.getTime())) continue
    const key = `${d.getFullYear()}-${d.getMonth() + 1}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  // Average the last 3 full months
  const months: number[] = []
  for (let offset = 1; offset <= 3; offset++) {
    const d = new Date(now.getFullYear(), now.getMonth() - offset, 1)
    const key = `${d.getFullYear()}-${d.getMonth() + 1}`
    months.push(counts.get(key) ?? 0)
  }

  const total = months.reduce((a, b) => a + b, 0)
  return months.length ? total / months.length : null
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const city = (searchParams.get('city') ?? '').trim() || null

  if (city && !isTmreTown(city)) {
    return NextResponse.json({ error: `Unsupported city '${city}'` }, { status: 400 })
  }

  try {
    const avg = await avgMonthlyClosings(city)
    return NextResponse.json({ city: city ?? 'All', avgMonthlyClosings: avg })
  } catch (err) {
    console.error('[/api/listings/new-construction/supply] error', err)
    return NextResponse.json({ city: city ?? 'All', avgMonthlyClosings: null })
  }
}
