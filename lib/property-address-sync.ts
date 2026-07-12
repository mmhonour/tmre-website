import { TMRE_TOWNS } from '@/lib/tmre-towns'
import type { Listing } from '@/lib/rets'
import {
  assessorSaleToPropertyAddressDraft,
  listingToPropertyAddressDraft,
} from '@/lib/property-address'
import {
  countPropertyAddresses,
  loadMlsListingsForPropertySync,
  touchPropertyAddressSyncMeta,
  upsertPropertyAddress,
} from '@/lib/property-address-db'
import { fetchTownRecentSales } from '@/lib/vision-appraisal'

export type PropertyAddressSyncResult = {
  ok: boolean
  mlsRows: number
  assessorRows: number
  totalRows: number
  durationMs: number
  syncedAt: string
}

function pickLatestListingPerProperty(
  rows: { listing: Listing; town: string; listingId: string; modMs: number }[],
): { listing: Listing; town: string; listingId: string }[] {
  const byKey = new Map<string, { listing: Listing; town: string; listingId: string; modMs: number }>()
  for (const row of rows) {
    const draft = listingToPropertyAddressDraft(row.listing, row.town, row.listingId)
    const existing = byKey.get(draft.propertyKey)
    if (!existing || row.modMs > existing.modMs) {
      byKey.set(draft.propertyKey, row)
    }
  }
  return [...byKey.values()].map(({ listing, town, listingId }) => ({ listing, town, listingId }))
}

async function loadMlsPropertyRows(): Promise<{ listing: Listing; town: string; listingId: string }[]> {
  const parsed = await loadMlsListingsForPropertySync(TMRE_TOWNS)
  return pickLatestListingPerProperty(parsed)
}

async function loadAssessorPropertyRows(): Promise<
  ReturnType<typeof assessorSaleToPropertyAddressDraft>[]
> {
  const out: NonNullable<ReturnType<typeof assessorSaleToPropertyAddressDraft>>[] = []
  const seen = new Set<string>()

  for (const town of TMRE_TOWNS) {
    let sales: Awaited<ReturnType<typeof fetchTownRecentSales>> = []
    try {
      sales = await fetchTownRecentSales(town)
    } catch (err) {
      console.warn(`[property-address-sync] assessor fetch failed for ${town}`, err)
      continue
    }

    for (const sale of sales) {
      const draft = assessorSaleToPropertyAddressDraft(town, sale.address)
      if (!draft) continue
      const dedupeKey = `${draft.town}|${draft.addressNorm}`
      if (seen.has(dedupeKey)) continue
      seen.add(dedupeKey)
      out.push(draft)
    }
  }

  return out
}

export async function syncPropertyAddresses(): Promise<PropertyAddressSyncResult> {
  const started = Date.now()
  const syncedAt = new Date().toISOString()

  const mlsRows = await loadMlsPropertyRows()
  for (const row of mlsRows) {
    const draft = listingToPropertyAddressDraft(row.listing, row.town, row.listingId)
    await upsertPropertyAddress(draft, syncedAt)
  }

  const assessorRows = await loadAssessorPropertyRows()
  for (const draft of assessorRows) {
    if (!draft) continue
    await upsertPropertyAddress(draft, syncedAt)
  }

  const totalRows = await countPropertyAddresses()
  const result: PropertyAddressSyncResult = {
    ok: true,
    mlsRows: mlsRows.length,
    assessorRows: assessorRows.length,
    totalRows,
    durationMs: Date.now() - started,
    syncedAt,
  }

  touchPropertyAddressSyncMeta(result)
  console.info(
    `[property-address-sync] verified ${result.totalRows} addresses (${result.mlsRows} MLS, ${result.assessorRows} assessor) in ${result.durationMs}ms`,
  )

  return result
}
