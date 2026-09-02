import 'server-only'

import {
  STATS_INVENTORY,
  type StatsInventoryEntry,
  type StatsLiveProbe,
} from '@/lib/admin-stats-inventory'
import {
  countStatsCacheByPrefixes,
  countStatsCacheRows,
  listStatsCacheKeyFamilies,
  type StatsCacheKeyFamily,
} from '@/lib/db/stats-cache-repo'
import { queryOne } from '@/lib/db/postgres'

const ALLOWED_TABLES = new Set([
  'listings',
  'listing_edge_scores',
  'listing_superlatives',
  'listing_relations',
  'listing_if_estimates',
  'listing_land_premiums',
  'listing_tax_history',
  'listing_price_history',
  'listing_photo_index',
  'sync_runs',
  'sync_meta',
  'stats_cache',
  'town_property_addresses',
  'vision_addresses',
])

export type StatsCacheLiveFamily = StatsCacheKeyFamily & {
  /** Friendly catalog name when the family matches a known inventory prefix. */
  label: string
  /** Inventory entry id when matched; null for uncatalogued keys. */
  entryId: string | null
}

export type StatsInventoryLiveCounts = {
  measuredAt: string
  statsCacheTotal: number
  byEntryId: Record<string, number | null>
  /** Distinct key families living in stats_cache right now (names + row counts). */
  keyFamilies: StatsCacheLiveFamily[]
}

function labelStatsCacheFamily(family: string): {
  label: string
  entryId: string | null
} {
  const prefix = family.endsWith(':') ? family : `${family}:`
  const entry = STATS_INVENTORY.find(
    (e) => e.live.kind === 'stats_cache_prefix' && e.live.prefix === prefix,
  )
  return {
    label: entry?.name ?? family,
    entryId: entry?.id ?? null,
  }
}

async function countTable(table: string): Promise<number> {
  if (!ALLOWED_TABLES.has(table)) return 0
  const row = await queryOne<{ count: number }>(
    `SELECT count(*)::int AS count FROM ${table}`,
  )
  return row?.count ?? 0
}

function collectProbes(entries: readonly StatsInventoryEntry[]): {
  prefixes: string[]
  tables: string[]
  needSyncMeta: boolean
  needGoldilocksScored: boolean
} {
  const prefixes = new Set<string>()
  const tables = new Set<string>()
  let needSyncMeta = false
  let needGoldilocksScored = false
  for (const entry of entries) {
    const probe: StatsLiveProbe = entry.live
    if (probe.kind === 'stats_cache_prefix') prefixes.add(probe.prefix)
    else if (probe.kind === 'postgres_table') tables.add(probe.table)
    else if (probe.kind === 'sync_meta_count') needSyncMeta = true
    else if (probe.kind === 'goldilocks_scored') needGoldilocksScored = true
  }
  return {
    prefixes: [...prefixes],
    tables: [...tables],
    needSyncMeta,
    needGoldilocksScored,
  }
}

/** Live row counts for Admin Stats inventory entries that support probing. */
export async function loadStatsInventoryLiveCounts(): Promise<StatsInventoryLiveCounts> {
  const { prefixes, tables, needSyncMeta, needGoldilocksScored } =
    collectProbes(STATS_INVENTORY)

  const [statsCacheTotal, prefixCounts, keyFamiliesRaw, ...tableCounts] =
    await Promise.all([
      countStatsCacheRows(),
      countStatsCacheByPrefixes(prefixes),
      listStatsCacheKeyFamilies(),
      ...tables.map((table) => countTable(table)),
    ])

  const keyFamilies: StatsCacheLiveFamily[] = keyFamiliesRaw.map((row) => {
    const { label, entryId } = labelStatsCacheFamily(row.family)
    return { ...row, label, entryId }
  })

  const tableCountByName = new Map<string, number>()
  tables.forEach((table, i) => {
    tableCountByName.set(table, tableCounts[i] ?? 0)
  })

  let syncMetaCount: number | null = null
  if (needSyncMeta) {
    syncMetaCount = await countTable('sync_meta')
  }

  let goldilocksScored: number | null = null
  if (needGoldilocksScored) {
    const row = await queryOne<{ count: number }>(
      'SELECT count(*)::int AS count FROM listings WHERE goldilocks_score IS NOT NULL',
    )
    goldilocksScored = row?.count ?? 0
  }

  const byEntryId: Record<string, number | null> = {}
  for (const entry of STATS_INVENTORY) {
    const probe = entry.live
    if (probe.kind === 'stats_cache_prefix') {
      byEntryId[entry.id] = prefixCounts.get(probe.prefix) ?? 0
    } else if (probe.kind === 'postgres_table') {
      byEntryId[entry.id] = tableCountByName.get(probe.table) ?? 0
    } else if (probe.kind === 'sync_meta_count') {
      byEntryId[entry.id] = syncMetaCount
    } else if (probe.kind === 'goldilocks_scored') {
      byEntryId[entry.id] = goldilocksScored
    } else {
      byEntryId[entry.id] = null
    }
  }

  return {
    measuredAt: new Date().toISOString(),
    statsCacheTotal,
    byEntryId,
    keyFamilies,
  }
}
