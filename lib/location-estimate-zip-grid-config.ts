import 'server-only'

import { getSyncMeta as getSyncMetaFresh } from '@/lib/db/sync-meta'
import { getSyncMeta, setSyncMetaDurable } from '@/lib/db/sync-meta-store'
import {
  LOCATION_ESTIMATE_ZIP_GRID_KEY,
  emptyZipGrid,
  mergeZipGridPatch,
  parseZipGridPayload,
  type ZipGridCells,
  type ZipGridPayload,
} from '@/lib/location-estimate-zip-grid-shared'

export { LOCATION_ESTIMATE_ZIP_GRID_KEY } from '@/lib/location-estimate-zip-grid-shared'

export function getLocationEstimateZipGrid(): ZipGridPayload {
  return parseZipGridPayload(getSyncMeta(LOCATION_ESTIMATE_ZIP_GRID_KEY))
}

export async function getLocationEstimateZipGridFresh(): Promise<ZipGridPayload> {
  try {
    return parseZipGridPayload(
      await getSyncMetaFresh(LOCATION_ESTIMATE_ZIP_GRID_KEY),
    )
  } catch {
    return getLocationEstimateZipGrid()
  }
}

export async function patchLocationEstimateZipGrid(args: {
  patch?: ZipGridCells
  erase?: readonly string[]
}): Promise<ZipGridPayload> {
  const current = await getLocationEstimateZipGridFresh()
  const cells = mergeZipGridPatch(
    current.cells,
    args.patch ?? {},
    args.erase ?? [],
  )
  const next: ZipGridPayload = { version: 1, cells }
  await setSyncMetaDurable(LOCATION_ESTIMATE_ZIP_GRID_KEY, JSON.stringify(next))
  return next
}

export async function replaceLocationEstimateZipGrid(
  cells: ZipGridCells,
): Promise<ZipGridPayload> {
  const next: ZipGridPayload = { version: 1, cells }
  await setSyncMetaDurable(LOCATION_ESTIMATE_ZIP_GRID_KEY, JSON.stringify(next))
  return next
}

export function emptyGrid(): ZipGridPayload {
  return emptyZipGrid()
}
