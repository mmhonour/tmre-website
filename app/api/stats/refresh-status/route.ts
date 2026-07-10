import { NextResponse } from 'next/server'
import { getListingsDbStats } from '@/lib/listings-db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const stats = getListingsDbStats()
  const generatedAt = stats.lastStatsCache
  const startedAt = stats.lastStatsCacheStarted
  const startedMs = startedAt ? Date.parse(startedAt) : NaN
  const finishedMs = generatedAt ? Date.parse(generatedAt) : NaN
  const rebuilding =
    startedAt != null &&
    (generatedAt == null || (!Number.isNaN(startedMs) && startedMs > finishedMs))

  return NextResponse.json(
    { generatedAt, startedAt, rebuilding },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
