import 'server-only'

import { getSyncMeta as getSyncMetaFresh } from '@/lib/db/sync-meta'
import { getSyncMeta, setSyncMetaDurable } from '@/lib/db/sync-meta-store'
import {
  DEFAULT_TOWN_BUDGET_SOURCES,
  normalizeTownBudgetSources,
  type TownBudgetSourcesConfig,
} from '@/lib/town-budget-sources-shared'

export const TOWN_BUDGET_SOURCES_KEY = 'town_budget_sources'
export {
  DEFAULT_TOWN_BUDGET_SOURCES,
  normalizeTownBudgetSources,
  type TownBudgetSourceSlot,
  type TownBudgetSourcesConfig,
} from '@/lib/town-budget-sources-shared'

function parseStored(raw: string | null | undefined): TownBudgetSourcesConfig {
  if (!raw?.trim()) return structuredClone(DEFAULT_TOWN_BUDGET_SOURCES)
  try {
    return normalizeTownBudgetSources(JSON.parse(raw) as unknown)
  } catch {
    return structuredClone(DEFAULT_TOWN_BUDGET_SOURCES)
  }
}

/** Cached sync_meta read. */
export function getTownBudgetSources(): TownBudgetSourcesConfig {
  return parseStored(getSyncMeta(TOWN_BUDGET_SOURCES_KEY))
}

/** Authoritative Postgres read. */
export async function getTownBudgetSourcesFresh(): Promise<TownBudgetSourcesConfig> {
  try {
    const raw = await getSyncMetaFresh(TOWN_BUDGET_SOURCES_KEY)
    return parseStored(raw)
  } catch {
    return getTownBudgetSources()
  }
}

/** Persist source slots (durable). Parsing / fetch runs later. */
export async function setTownBudgetSources(
  value: unknown,
): Promise<TownBudgetSourcesConfig> {
  const normalized = normalizeTownBudgetSources(value)
  await setSyncMetaDurable(
    TOWN_BUDGET_SOURCES_KEY,
    JSON.stringify(normalized),
  )
  return normalized
}
