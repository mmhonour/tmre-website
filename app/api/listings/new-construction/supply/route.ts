import { NextRequest, NextResponse } from 'next/server'
import { fetchClosedListingsForCity } from '@/lib/listings-store'
import { isNewConstructionListing } from '@/lib/new-construction-server'
import { TMRE_TOWNS, isTmreTown } from '@/lib/tmre-towns'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ALL_CITIES = [...TMRE_TOWNS]

/** Closed-sales analytics for new-construction supply — SQLite only. */
async function avgMonthlyClosings(city: string | null): Promise<number | null> {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth() - 4, 1)
  const end = new Date(now.getFullYear(), now.getMonth(), 0)
  const startMs = start.getTime()
  const endMs = end.getTime()

  const cities = city ? [city] : ALL_CITIES
  const results = await Promise.all(
    cities.map((c) => fetchClosedListingsForCity(c, 2500).catch(() => ({ listings: [] }))),
  )
  const listings = results.flatMap((r) => r.listings)

  const newConstr = listings.filter(
    (l) =>
      isNewConstructionListing(l) ||
      (l.yearBuilt != null && l.yearBuilt >= now.getFullYear() - 4),
  )

  const counts = new Map<string, number>()
  for (const l of newConstr) {
    const ts = l.statusChangeTimestamp ?? l.modificationTimestamp
    if (!ts) continue
    const d = new Date(ts)
    if (Number.isNaN(d.getTime())) continue
    const ms = d.getTime()
    if (ms < startMs || ms > endMs) continue
    const key = `${d.getFullYear()}-${d.getMonth() + 1}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

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
