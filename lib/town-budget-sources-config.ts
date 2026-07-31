import 'server-only'

import { listActiveCtTownNames } from '@/lib/ct-coverage'
import { getSyncMeta as getSyncMetaFresh } from '@/lib/db/sync-meta'
import { getSyncMeta, setSyncMetaDurable } from '@/lib/db/sync-meta-store'
import {
  DEFAULT_TOWN_BUDGET_SOURCES,
  mergeTownBudgetSourcesForActiveTowns,
  normalizeTownBudgetSources,
  townBudgetSlotsByTown,
  type TownBudgetSourceSlot,
  type TownBudgetSourcesConfig,
} from '@/lib/town-budget-sources-shared'

export const TOWN_BUDGET_SOURCES_KEY = 'town_budget_sources'
export {
  DEFAULT_TOWN_BUDGET_SOURCES,
  normalizeTownBudgetSources,
  type TownBudgetSourceSlot,
  type TownBudgetSourcesConfig,
} from '@/lib/town-budget-sources-shared'

function parseStoredRaw(raw: string | null | undefined): unknown {
  if (!raw?.trim()) return { slots: [] }
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return { slots: [] }
  }
}

/** Cached sync_meta read merged onto currently active CT towns. */
export function getTownBudgetSources(): TownBudgetSourcesConfig {
  // Active towns need Postgres — without it, surface stored slots only.
  return normalizeTownBudgetSources(parseStoredRaw(getSyncMeta(TOWN_BUDGET_SOURCES_KEY)))
}

/** Authoritative: active CT coverage towns × saved URL/year. */
export async function getTownBudgetSourcesFresh(): Promise<TownBudgetSourcesConfig> {
  try {
    const [raw, activeTowns] = await Promise.all([
      getSyncMetaFresh(TOWN_BUDGET_SOURCES_KEY),
      listActiveCtTownNames(),
    ])
    return mergeTownBudgetSourcesForActiveTowns(
      parseStoredRaw(raw),
      activeTowns,
    )
  } catch {
    return getTownBudgetSources()
  }
}

/**
 * Persist URL/year for active towns. Keeps saved rows for towns that are
 * currently inactive so re-enabling in CT coverage restores the URL.
 */
export async function setTownBudgetSources(
  value: unknown,
): Promise<TownBudgetSourcesConfig> {
  const activeTowns = await listActiveCtTownNames()
  const prevRaw = await getSyncMetaFresh(TOWN_BUDGET_SOURCES_KEY)
  const merged = townBudgetSlotsByTown(parseStoredRaw(prevRaw))
  const incoming = townBudgetSlotsByTown(value)

  for (const town of activeTowns) {
    const next = incoming.get(town)
    if (next) {
      merged.set(town, next)
    } else if (!merged.has(town)) {
      merged.set(town, {
        town,
        year: new Date().getFullYear(),
        sourceUrl: '',
      })
    }
  }

  const toStore: TownBudgetSourcesConfig = {
    slots: [...merged.values()].sort((a, b) => a.town.localeCompare(b.town)),
  }
  await setSyncMetaDurable(TOWN_BUDGET_SOURCES_KEY, JSON.stringify(toStore))
  return mergeTownBudgetSourcesForActiveTowns(toStore, activeTowns)
}
