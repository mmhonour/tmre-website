import 'server-only'

import { getSyncMeta as getSyncMetaFromDb } from '@/lib/db/sync-meta'
import { getSyncMeta, setSyncMetaDurable } from '@/lib/db/sync-meta-store'
import {
  DEFAULT_SPOTLIGHT_TAB_ORDER,
  normalizeSpotlightTabOrder,
  type SpotlightTabOrderPayload,
} from '@/lib/spotlight-tab-order-shared'
import type { SpotlightPropertyTabId } from '@/lib/spotlight-listing'

export const SPOTLIGHT_TAB_ORDER_SYNC_KEY = 'spotlight_tab_order'

export {
  DEFAULT_SPOTLIGHT_TAB_ORDER,
  normalizeSpotlightTabOrder,
  orderVisibleSpotlightTabs,
  spotlightTabOrderVersion,
  type SpotlightTabOrderPayload,
} from '@/lib/spotlight-tab-order-shared'

function defaultPayload(): SpotlightTabOrderPayload {
  return {
    order: [...DEFAULT_SPOTLIGHT_TAB_ORDER],
    updatedAt: '1970-01-01T00:00:00.000Z',
  }
}

function parsePayload(raw: string | null): SpotlightTabOrderPayload {
  if (!raw) return defaultPayload()
  try {
    const parsed = JSON.parse(raw) as {
      order?: unknown
      updatedAt?: unknown
    }
    const order = normalizeSpotlightTabOrder(parsed?.order)
    const updatedAt =
      typeof parsed?.updatedAt === 'string' && parsed.updatedAt.trim()
        ? parsed.updatedAt.trim()
        : defaultPayload().updatedAt
    return { order, updatedAt }
  } catch {
    return defaultPayload()
  }
}

/** @deprecated Prefer {@link readSpotlightTabOrderFresh}. */
export function readSpotlightTabOrder(): SpotlightTabOrderPayload {
  return parsePayload(getSyncMeta(SPOTLIGHT_TAB_ORDER_SYNC_KEY))
}

export async function readSpotlightTabOrderFresh(): Promise<SpotlightTabOrderPayload> {
  try {
    return parsePayload(await getSyncMetaFromDb(SPOTLIGHT_TAB_ORDER_SYNC_KEY))
  } catch {
    return readSpotlightTabOrder()
  }
}

export async function writeSpotlightTabOrder(
  orderInput: readonly SpotlightPropertyTabId[] | unknown,
): Promise<SpotlightTabOrderPayload> {
  const payload: SpotlightTabOrderPayload = {
    order: normalizeSpotlightTabOrder(orderInput),
    updatedAt: new Date().toISOString(),
  }
  await setSyncMetaDurable(
    SPOTLIGHT_TAB_ORDER_SYNC_KEY,
    JSON.stringify(payload),
  )
  return payload
}
