import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthorizedRequest } from '@/lib/admin-auth'
import { readListingByIdFromDb } from '@/lib/db/listings-repo'
import { fetchListingByMlsId } from '@/lib/listings-store'
import type { Listing } from '@/lib/rets'
import {
  SPOTLIGHT_PROPERTY_TABS,
  type SpotlightPropertyTabId,
} from '@/lib/spotlight-listing'
import {
  effectiveSpotlightMlsId,
  readSpotlightMlsOverridesFresh,
  writeSpotlightMlsOverrides,
  type SpotlightMlsOverrides,
} from '@/lib/spotlight-mls-overrides'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type MlsResolveSource = 'db' | 'rets' | 'none' | 'error'

type TabMlsSummary = {
  tab: SpotlightPropertyTabId
  mlsId: string
  exists: boolean
  street: string
  town: string
  source: MlsResolveSource
}

function addressFromListing(listing: Listing): { street: string; town: string } {
  return {
    street: listing.address?.street?.trim() || listing.address?.full?.trim() || '',
    town: listing.address?.city?.trim() || '',
  }
}

/** DB-first (optionally RETS) resolution of an MLS id to a listing address. */
async function resolveMlsAddress(
  mlsId: string,
  { allowRets }: { allowRets: boolean },
): Promise<{ exists: boolean; street: string; town: string; source: MlsResolveSource }> {
  const id = mlsId.trim()
  if (!id) return { exists: false, street: '', town: '', source: 'none' }

  // Track whether the DB read *failed* (e.g. Postgres unreachable) vs simply
  // returned no row. These are very different: a connection error must not be
  // reported to the admin as "id no longer resolves".
  let dbErrored = false
  try {
    const dbListing = await readListingByIdFromDb(id)
    if (dbListing) {
      return { exists: true, ...addressFromListing(dbListing), source: 'db' }
    }
  } catch {
    dbErrored = true
  }

  if (allowRets) {
    try {
      const { listing } = await fetchListingByMlsId(id)
      if (listing) {
        return { exists: true, ...addressFromListing(listing), source: 'rets' }
      }
    } catch {
      // treat as not found / unavailable
    }
  }

  // Couldn't confirm the listing. If the DB read threw, surface an error state
  // so the panel can say "Postgres unreachable" instead of pretending the saved
  // id is bad.
  if (dbErrored) return { exists: false, street: '', town: '', source: 'error' }

  return { exists: false, street: '', town: '', source: 'none' }
}

async function buildTabSummaries(
  overrides: SpotlightMlsOverrides,
  { allowRets }: { allowRets: boolean },
): Promise<TabMlsSummary[]> {
  return Promise.all(
    SPOTLIGHT_PROPERTY_TABS.map(async (tab) => {
      const mlsId = effectiveSpotlightMlsId(tab, overrides)
      if (!mlsId) {
        return { tab, mlsId: '', exists: false, street: '', town: '', source: 'none' as const }
      }
      const resolved = await resolveMlsAddress(mlsId, { allowRets })
      return { tab, mlsId, ...resolved }
    }),
  )
}

export async function GET(req: NextRequest) {
  if (!isAdminAuthorizedRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const overrides = await readSpotlightMlsOverridesFresh()
  const tabs = await buildTabSummaries(overrides, { allowRets: false })
  return NextResponse.json({ overrides, tabs })
}

export async function PATCH(req: NextRequest) {
  if (!isAdminAuthorizedRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const rawTab = (body as { tab?: unknown })?.tab
  const rawMlsId = (body as { mlsId?: unknown })?.mlsId
  const tab = Number(rawTab) as SpotlightPropertyTabId
  if (!SPOTLIGHT_PROPERTY_TABS.includes(tab)) {
    return NextResponse.json({ error: 'Invalid tab' }, { status: 400 })
  }
  const mlsId = typeof rawMlsId === 'string' ? rawMlsId.trim() : ''

  const overrides = await readSpotlightMlsOverridesFresh()

  // Empty = intentional clear (hides the tab). Non-empty must validate first.
  if (mlsId.length > 0) {
    const resolved = await resolveMlsAddress(mlsId, { allowRets: true })
    if (!resolved.exists) {
      // Do not persist an id that resolves to no listing.
      return NextResponse.json({
        ok: false,
        saved: false,
        tab,
        mlsId,
        exists: false,
        street: '',
        town: '',
        source: 'none' as const,
      })
    }
  }

  const next: SpotlightMlsOverrides = { ...overrides, [tab]: mlsId }
  await writeSpotlightMlsOverrides(next)

  const tabs = await buildTabSummaries(next, { allowRets: true })
  const saved = tabs.find((t) => t.tab === tab)
  return NextResponse.json({ ok: true, saved: true, overrides: next, tabs, tab: saved })
}
