/**
 * Spotlight display order — slot ids stay stable (Property #5 stays #5).
 * Only the public rail order changes. Client-safe (no DB imports).
 */

import {
  SPOTLIGHT_PROPERTY_TABS,
  type SpotlightPropertyTabId,
} from '@/lib/spotlight-listing'

export const DEFAULT_SPOTLIGHT_TAB_ORDER: SpotlightPropertyTabId[] = [
  ...SPOTLIGHT_PROPERTY_TABS,
]

export type SpotlightTabOrderPayload = {
  /** Display order of stable slot ids (e.g. [5, 1, 2, 3, 4]). */
  order: SpotlightPropertyTabId[]
  /** ISO timestamp of last Admin save — used as the public version stamp. */
  updatedAt: string
}

export function isSpotlightPropertyTabId(
  value: unknown,
): value is SpotlightPropertyTabId {
  return (
    typeof value === 'number' &&
    SPOTLIGHT_PROPERTY_TABS.includes(value as SpotlightPropertyTabId)
  )
}

/**
 * Normalize any admin/API input into a full permutation of slots 1–5.
 * Missing ids are appended in default order; duplicates dropped.
 */
export function normalizeSpotlightTabOrder(
  input: unknown,
): SpotlightPropertyTabId[] {
  const raw = Array.isArray(input) ? input : []
  const seen = new Set<SpotlightPropertyTabId>()
  const out: SpotlightPropertyTabId[] = []
  for (const item of raw) {
    const n = typeof item === 'string' ? Number(item) : item
    if (!isSpotlightPropertyTabId(n) || seen.has(n)) continue
    seen.add(n)
    out.push(n)
  }
  for (const tab of DEFAULT_SPOTLIGHT_TAB_ORDER) {
    if (!seen.has(tab)) out.push(tab)
  }
  return out
}

/** Version stamp for polling — changes whenever Admin saves a new order. */
export function spotlightTabOrderVersion(
  payload: Pick<SpotlightTabOrderPayload, 'order' | 'updatedAt'>,
): string {
  return `${payload.updatedAt}|${payload.order.join(',')}`
}

/** Visible tabs in display order (stable ids; deep links unchanged). */
export function orderVisibleSpotlightTabs(
  order: readonly SpotlightPropertyTabId[],
  visible: readonly SpotlightPropertyTabId[],
): SpotlightPropertyTabId[] {
  const visibleSet = new Set(visible)
  const ordered = order.filter((tab) => visibleSet.has(tab))
  for (const tab of visible) {
    if (!ordered.includes(tab)) ordered.push(tab)
  }
  return ordered
}

export const SPOTLIGHT_ORDER_CHANGED_EVENT = 'tmre:spotlight-order-changed'

export type SpotlightOrderChangedDetail = {
  version: string
  order: SpotlightPropertyTabId[]
  visibleTabs: SpotlightPropertyTabId[]
}
