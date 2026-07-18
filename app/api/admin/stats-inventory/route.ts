import { NextResponse } from 'next/server'
import {
  STATS_INVENTORY,
  STATS_INVENTORY_CATEGORIES,
  STATS_STORAGE_MEDIUM_META,
  statsInventoryByCategory,
} from '@/lib/admin-stats-inventory'
import { loadStatsInventoryLiveCounts } from '@/lib/admin-stats-inventory-live'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const live = await loadStatsInventoryLiveCounts()
    return NextResponse.json({
      categories: STATS_INVENTORY_CATEGORIES,
      entries: STATS_INVENTORY,
      groups: statsInventoryByCategory(),
      mediums: STATS_STORAGE_MEDIUM_META,
      live,
    })
  } catch (err) {
    console.error('[/api/admin/stats-inventory] error', err)
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : 'Failed to load stats inventory',
        categories: STATS_INVENTORY_CATEGORIES,
        entries: STATS_INVENTORY,
        groups: statsInventoryByCategory(),
        mediums: STATS_STORAGE_MEDIUM_META,
        live: null,
      },
      { status: 500 },
    )
  }
}
