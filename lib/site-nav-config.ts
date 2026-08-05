import 'server-only'

import { getSyncMeta as getSyncMetaFresh } from '@/lib/db/sync-meta'
import { getSyncMeta, setSyncMetaDurable } from '@/lib/db/sync-meta-store'
import {
  DEFAULT_SITE_NAV,
  normalizeSiteNav,
  type SiteNavConfig,
} from '@/lib/site-nav-shared'

export const SITE_NAV_KEY = 'site_nav'

export {
  DEFAULT_SITE_NAV,
  normalizeSiteNav,
  type SiteNavConfig,
  type SiteNavTopItem,
  type SiteNavExploreGroup,
} from '@/lib/site-nav-shared'

function parseStored(raw: string | null | undefined): SiteNavConfig {
  if (!raw?.trim()) return structuredClone(DEFAULT_SITE_NAV)
  try {
    return normalizeSiteNav(JSON.parse(raw) as unknown)
  } catch {
    return structuredClone(DEFAULT_SITE_NAV)
  }
}

/** Cached sync_meta read (hydrated Next server). */
export function getSiteNav(): SiteNavConfig {
  return parseStored(getSyncMeta(SITE_NAV_KEY))
}

/** Authoritative Postgres read. */
export async function getSiteNavFresh(): Promise<SiteNavConfig> {
  try {
    const raw = await getSyncMetaFresh(SITE_NAV_KEY)
    return parseStored(raw)
  } catch {
    return getSiteNav()
  }
}

/** Persist header nav config (durable). */
export async function setSiteNav(value: unknown): Promise<SiteNavConfig> {
  const normalized = normalizeSiteNav(value)
  await setSyncMetaDurable(SITE_NAV_KEY, JSON.stringify(normalized))
  return normalized
}
