import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthorizedRequest } from '@/lib/admin-auth'
import { readListingByIdFromDb } from '@/lib/db/listings-repo'
import type { Listing } from '@/lib/rets'
import { rebuildSpotlightCache } from '@/lib/spotlight-cache'
import {
  SPOTLIGHT_PROPERTY_TABS,
  type SpotlightPropertyTabId,
} from '@/lib/spotlight-listing'
import { ensureSpotlightListingIngested } from '@/lib/spotlight-listing-ingest'
import {
  effectiveSpotlightMlsId,
  findSpotlightMlsConflict,
  findSpotlightMlsDuplicateTabs,
  readSpotlightMlsOverridesFresh,
  writeSpotlightMlsOverrides,
  type SpotlightMlsOverrides,
} from '@/lib/spotlight-mls-overrides'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
/** One-off RETS + photo warm can exceed the default serverless budget. */
export const maxDuration = 60

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

async function summarizeFromDb(mlsId: string): Promise<{
  exists: boolean
  street: string
  town: string
  source: MlsResolveSource
}> {
  const id = mlsId.trim()
  if (!id) return { exists: false, street: '', town: '', source: 'none' }
  try {
    const dbListing = await readListingByIdFromDb(id)
    if (dbListing) {
      return { exists: true, ...addressFromListing(dbListing), source: 'db' }
    }
    return { exists: false, street: '', town: '', source: 'none' }
  } catch {
    return { exists: false, street: '', town: '', source: 'error' }
  }
}

async function buildTabSummaries(
  overrides: SpotlightMlsOverrides,
): Promise<TabMlsSummary[]> {
  return Promise.all(
    SPOTLIGHT_PROPERTY_TABS.map(async (tab) => {
      const mlsId = effectiveSpotlightMlsId(tab, overrides)
      if (!mlsId) {
        return {
          tab,
          mlsId: '',
          exists: false,
          street: '',
          town: '',
          source: 'none' as const,
        }
      }
      const resolved = await summarizeFromDb(mlsId)
      return { tab, mlsId, ...resolved }
    }),
  )
}

export async function GET(req: NextRequest) {
  if (!isAdminAuthorizedRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const overrides = await readSpotlightMlsOverridesFresh()
  const tabs = await buildTabSummaries(overrides)
  const duplicateTabs = findSpotlightMlsDuplicateTabs(overrides)
  return NextResponse.json({ overrides, tabs, duplicateTabs })
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

  // Empty = intentional clear (hides the tab). Non-empty must ingest first.
  let ingest:
    | Awaited<ReturnType<typeof ensureSpotlightListingIngested>>
    | null = null

  if (mlsId.length > 0) {
    const nextPreview: SpotlightMlsOverrides = { ...overrides, [tab]: mlsId }
    const conflictTab = findSpotlightMlsConflict(tab, mlsId, nextPreview)
    if (conflictTab != null) {
      return NextResponse.json({
        ok: false,
        saved: false,
        reason: 'duplicate' as const,
        tab,
        mlsId,
        conflictTab,
        exists: true,
        street: '',
        town: '',
        source: 'none' as const,
      })
    }

    // Marketing path: if missing from Postgres, pull RETS and await upsert now.
    ingest = await ensureSpotlightListingIngested(mlsId, {
      warmCache: false,
    })

    if (ingest.error?.startsWith('Postgres unavailable')) {
      return NextResponse.json({
        ok: false,
        saved: false,
        reason: 'db' as const,
        tab,
        mlsId,
        exists: false,
        street: '',
        town: '',
        source: 'error' as const,
        error: ingest.error,
      })
    }

    if (!ingest.found) {
      return NextResponse.json({
        ok: false,
        saved: false,
        reason: 'notfound' as const,
        tab,
        mlsId,
        exists: false,
        street: '',
        town: '',
        source: 'none' as const,
        error: ingest.error,
      })
    }

    if (!ingest.alreadyInDb && !ingest.persisted) {
      return NextResponse.json({
        ok: false,
        saved: false,
        reason: 'persist' as const,
        tab,
        mlsId,
        exists: true,
        ...addressFromListing(ingest.listing!),
        source: 'rets' as const,
        error:
          ingest.error ??
          'Fetched from RETS but could not write to Postgres',
      })
    }
  }

  const next: SpotlightMlsOverrides = { ...overrides, [tab]: mlsId }
  await writeSpotlightMlsOverrides(next)

  let cacheWarmed = false
  if (mlsId.length > 0) {
    // Override is saved — warm listing + photos so /spotlight is client-ready.
    cacheWarmed = await rebuildSpotlightCache(tab).catch((err) => {
      console.warn('[spotlight-mls] cache warm after ingest failed', err)
      return false
    })
  }

  const tabs = await buildTabSummaries(next)
  const saved = tabs.find((t) => t.tab === tab)

  // Prefer RETS address from the ingest when DB summary is still catching up.
  const street =
    saved?.street ||
    (ingest?.listing ? addressFromListing(ingest.listing).street : '')
  const town =
    saved?.town ||
    (ingest?.listing ? addressFromListing(ingest.listing).town : '')

  return NextResponse.json({
    ok: true,
    saved: true,
    overrides: next,
    tabs: tabs.map((t) =>
      t.tab === tab && ingest && !ingest.alreadyInDb
        ? {
            ...t,
            exists: true,
            street: street || t.street,
            town: town || t.town,
            source: 'rets' as const,
          }
        : t,
    ),
    tab: saved
      ? {
          ...saved,
          exists: saved.exists || Boolean(ingest?.found),
          street: street || saved.street,
          town: town || saved.town,
          source:
            ingest && !ingest.alreadyInDb
              ? ('rets' as const)
              : saved.source,
        }
      : saved,
    ingest: ingest
      ? {
          alreadyInDb: ingest.alreadyInDb,
          persisted: ingest.persisted,
          cacheWarmed,
          source: ingest.source,
        }
      : null,
    duplicateTabs: findSpotlightMlsDuplicateTabs(next),
  })
}
