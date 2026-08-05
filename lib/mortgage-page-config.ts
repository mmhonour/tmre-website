import 'server-only'

import { getSyncMeta as getSyncMetaFresh } from '@/lib/db/sync-meta'
import { getSyncMeta, setSyncMetaDurable } from '@/lib/db/sync-meta-store'
import {
  DEFAULT_MORTGAGE_PAGE_CONTENT,
  normalizeMortgagePageContent,
  type MortgagePageContent,
} from '@/lib/mortgage-page-shared'

export const MORTGAGE_PAGE_KEY = 'mortgage_page'

export {
  DEFAULT_MORTGAGE_PAGE_CONTENT,
  normalizeMortgagePageContent,
  type MortgagePageContent,
} from '@/lib/mortgage-page-shared'

function parseStored(raw: string | null | undefined): MortgagePageContent {
  if (!raw?.trim()) return structuredClone(DEFAULT_MORTGAGE_PAGE_CONTENT)
  try {
    return normalizeMortgagePageContent(JSON.parse(raw) as unknown)
  } catch {
    return structuredClone(DEFAULT_MORTGAGE_PAGE_CONTENT)
  }
}

/** Cached sync_meta read (hydrated Next server). */
export function getMortgagePageContent(): MortgagePageContent {
  return parseStored(getSyncMeta(MORTGAGE_PAGE_KEY))
}

/** Authoritative Postgres read. */
export async function getMortgagePageContentFresh(): Promise<MortgagePageContent> {
  try {
    const raw = await getSyncMetaFresh(MORTGAGE_PAGE_KEY)
    return parseStored(raw)
  } catch {
    return getMortgagePageContent()
  }
}

/** Persist commentary / spot quote / loan limits (durable). */
export async function setMortgagePageContent(
  value: unknown,
): Promise<MortgagePageContent> {
  const normalized = normalizeMortgagePageContent(value)
  const withStamp: MortgagePageContent = {
    ...normalized,
    updatedAt: new Date().toISOString(),
  }
  await setSyncMetaDurable(MORTGAGE_PAGE_KEY, JSON.stringify(withStamp))
  return withStamp
}
